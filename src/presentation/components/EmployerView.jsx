import React, { useState } from "react";
import { MONO, useC } from "../theme";
import { studentName } from "../../data/seedData";
import { sha256Hex, canonicalize, computeDataHash, computeRecordHash, readFileWithHash } from "../../application/crypto";
import { extractAcademicData } from "../../application/verification";
import { now } from "../../application/utils";
import { formatSevisId, sameSevisId } from "../../application/identity";
import { Badge, Card, Btn, Field, SectionTitle, FingerprintStrip, inputCls, inputStyle } from "./ui";
import QRScanner from "./QRScanner";

/* ============================================================ EMPLOYER */
function EmployerView({ user, entries, records, tokens, checks, setChecks, log }) {
  const C = useC();  const [mode, setMode] = useState("qr");
  const [tokenIn, setTokenIn] = useState("");
  const [idIn, setIdIn] = useState("");
  const [docIn, setDocIn] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  const record = (res, method, rec) => {
    setChecks((c) => [{ t: now(), by: user.name, method, result: res, recordId: rec ? rec.id : null }, ...c]);
    log(`${user.name} ran a ${method === "qr_scan" ? "QR" : "document"} verification — result: ${res}.`);
  };

  const verifyToken = async (raw) => {
    setBusy(true);
    setResult(null);
    const input = (typeof raw === "string" ? raw : tokenIn).trim();
    /* the QR printed on downloaded documents encodes "EDUVERIFY-PNG|SHA256:<record hash>" —
       accept that payload (or a bare 64-hex hash) and verify the record directly */
    const hashM = !input.startsWith("qr_") && input.match(/[0-9a-f]{64}/i);
    if (hashM) {
      const h = hashM[0].toLowerCase();
      const rec = records.find((r) => r.hash === h && entries.find((e) => e.id === r.entryId && e.status === "certified"));
      if (!rec) { setResult({ ok: false, msg: "No official record matches that document hash — the document may be forged, altered, or superseded by a re-sealed record." }); record("failed", "qr_scan", null); setBusy(false); return; }
      const rc = await computeRecordHash(rec.structured, rec.docText);
      if (rc === rec.hash) {
        setResult({ ok: true, rec, msg: "Verified — the hash printed on the document matches an official record, and the stored record is intact." });
        record("verified", "qr_scan", rec);
      } else {
        setResult({ ok: false, msg: "Verification failed — the stored record no longer matches its certified hash. Possible internal tampering; the issuing institution has been flagged." });
        record("failed", "qr_scan", rec);
      }
      setBusy(false);
      return;
    }
    const tk = tokens.find((t) => t.token === input);
    if (!tk) { setResult({ ok: false, msg: "Token not recognised. Ask the credential holder to generate a fresh QR code." }); record("failed", "qr_scan", null); setBusy(false); return; }
    if (tk.expiresAt && Date.now() > tk.expiresAt) { setResult({ ok: false, msg: "Token has expired. Ask the credential holder to generate a fresh QR code." }); record("failed", "qr_scan", null); setBusy(false); return; }
    const rec = records.find((r) => r.id === tk.recordId);
    if (!rec) { setResult({ ok: false, msg: "The record behind this token no longer exists." }); record("failed", "qr_scan", null); setBusy(false); return; }
    const recomputed = await computeRecordHash(rec.structured, rec.docText);
    if (recomputed === rec.hash) {
      setResult({ ok: true, rec, msg: "Verified — this record is authentic and matches official institutional data." });
      record("verified", "qr_scan", rec);
    } else {
      setResult({ ok: false, msg: "Verification failed — the stored record no longer matches its certified hash. Possible internal tampering; the issuing institution has been flagged." });
      record("failed", "qr_scan", rec);
    }
    setBusy(false);
  };

  const verifyDoc = async () => {
    setBusy(true);
    setResult(null);

    /* assemble the document text we were given: pasted text and/or a decodable uploaded file */
    let sourceText = docIn || "";
    if (docFile) {
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(docFile.bytes);
      const printable = decoded.replace(/[^\t\n\r\u0020-\u007E\u00A0-\uFFFF]/g, "");
      if (decoded.length > 0 && printable.length / decoded.length > 0.7) sourceText = decoded + "\n" + sourceText;
    }

    /* STEP 1 — extract the key academic information from the document */
    const extracted = sourceText ? extractAcademicData(sourceText) : null;

    const typedId = idIn.trim();
    const wantedId = typedId || (extracted && extracted.studentId) || "";
    const fail = (msg, extra) => { setResult({ ok: false, msg, extracted, ...(extra || {}) }); record("failed", "file_upload", null); setBusy(false); };
    if (!wantedId) return fail("Could not determine the student's SevisPass ID — enter it above, or provide a certificate that includes it.");
    // Accept either the raw SevisPass identifier (as embedded in a sealed
    // document) or the clean SevisPass number the student sees on screen.
    if (typedId && extracted && extracted.studentId && !sameSevisId(extracted.studentId, typedId))
      return fail(`Identity mismatch — the document names ${formatSevisId(extracted.studentId)}, but you entered ${formatSevisId(typedId)}. Flagged for potential forgery.`);

    const studentRecords = records.filter((r) => sameSevisId(r.structured.studentId, wantedId) && entries.find((e) => e.id === r.entryId && e.status === "certified"));
    if (studentRecords.length === 0) return fail("No certified records found for that ID number.");

    /* byte-exact seal check (secondary integrity signal): does the presented text,
       in any tolerated transport form, hash to the record's sealed document hash? */
    const SEP = "----------------------------------------";
    const byteExact = async (text, r) => {
      const base = text.replace(/\r\n/g, "\n");
      const cand = [text, base, base.trim(), base.split(SEP)[0].replace(/\n+$/, ""), base.split(SEP)[0].trim()];
      if (base.includes("<pre>")) {
        const inner = base.split("<pre>")[1].split("</pre>")[0].replace(/&lt;/g, "<").replace(/&amp;/g, "&");
        cand.push(inner, inner.trim());
      }
      for (const t of [...new Set(cand)]) {
        if ((await sha256Hex(canonicalize(r.structured) + (await sha256Hex(t)))) === r.hash) return true;
      }
      return false;
    };

    /* STEP 2 — hash the standardized academic data and compare it against the
       hash generated from each official academic record on file */
    const fieldsComplete = extracted && extracted.studentId && extracted.institution && extracted.program && extracted.graduationYear && extracted.gpa;
    if (fieldsComplete) {
      const docDataHash = await sha256Hex(canonicalize(extracted));
      for (const r of studentRecords) {
        const storedDataHash = await computeDataHash(r.structured);
        if (docDataHash === storedDataHash) {
          const exactText = sourceText ? await byteExact(sourceText, r) : false;
          const exactFile = !!(docFile && r.structured.documentSha256 && r.structured.documentSha256 === docFile.sha256);
          setResult({
            ok: true, rec: r, extracted, docDataHash, storedDataHash, exact: exactText || exactFile,
            msg: "Verified as authentic — the SHA-256 hash of the academic data extracted from this document matches the hash generated from the official academic record on file.",
          });
          record("verified", "file_upload", r);
          setBusy(false);
          return;
        }
      }
    }

    /* STEP 3 — fallbacks for documents we cannot parse: sealed-file fingerprint, then byte-exact sealed text */
    if (docFile) {
      const fileMatch = studentRecords.find((r) => r.structured.documentSha256 && r.structured.documentSha256 === docFile.sha256);
      if (fileMatch) {
        setResult({ ok: true, rec: fileMatch, extracted, exact: true, msg: "Verified — this document file is byte-for-byte identical to the official document sealed by the institution." });
        record("verified", "file_upload", fileMatch);
        setBusy(false);
        return;
      }
    }
    if (sourceText) {
      for (const r of studentRecords) {
        if (await byteExact(sourceText, r)) {
          setResult({ ok: true, rec: r, extracted, exact: true, msg: "Verified — this document is byte-for-byte identical to the sealed official record." });
          record("verified", "file_upload", r);
          setBusy(false);
          return;
        }
      }
    }

    if (fieldsComplete) {
      const docDataHash = await sha256Hex(canonicalize(extracted));
      return fail("Flagged for potential forgery or alteration — the SHA-256 hash of the academic data extracted from this document does not match the hash of any official academic record on file for this student.", { docDataHash });
    }
    return fail("Verification failed — the required academic fields could not be fully extracted, and the document does not match any sealed record. It may have been altered, or it is not an EduVerify-issued document. Ask the candidate for a QR code instead.");
  };

  return (
    <div>
      <SectionTitle>Verify a credential</SectionTitle>
      <Card>
        <div className="flex gap-2 mb-4">
          <Btn small kind={mode === "qr" ? "primary" : "ghost"} onClick={() => { setMode("qr"); setResult(null); }}>Scan QR code</Btn>
          <Btn small kind={mode === "doc" ? "primary" : "ghost"} onClick={() => { setMode("doc"); setResult(null); }}>Upload document</Btn>
        </div>

        {mode === "qr" ? (
          <>
            {scanning ? (
              <QRScanner
                onScan={(value) => { setTokenIn(value); setScanning(false); verifyToken(value); }}
                onClose={() => setScanning(false)}
              />
            ) : (
              <div className="mb-3">
                <Btn small kind="gold" onClick={() => { setResult(null); setScanning(true); }}>📷 Scan QR with camera</Btn>
                <span className="text-xs ml-2" style={{ color: C.muted }}>opens your device camera — the result appears as soon as a code is read. Or paste the token below.</span>
              </div>
            )}
            <Field label="Verification ID / token — or the hash from a downloaded document's QR seal">
              <input className={inputCls} style={{ ...inputStyle(C), fontFamily: MONO }} value={tokenIn} onChange={(e) => setTokenIn(e.target.value)} placeholder="qr_… or EDUVERIFY-PNG|SHA256:…" />
            </Field>
            <Btn onClick={() => verifyToken()} disabled={!tokenIn || busy}>{busy ? "Checking…" : "Verify"}</Btn>
          </>
        ) : (
          <>
            <Field label="Candidate's SevisPass ID number (optional — cross-checked against the document)">
              <input className={inputCls} style={{ ...inputStyle(C), fontFamily: MONO }} value={idIn} onChange={(e) => setIdIn(e.target.value)} placeholder="SP-1003" />
            </Field>
            <Field label="Upload the document file the candidate sent you (PDF, scan, image)">
              <input type="file" className="text-xs" onChange={async (e) => { const fl = await readFileWithHash(e.target.files && e.target.files[0]); if (fl) setDocFile(fl); e.target.value = ""; }} />
            </Field>
            {docFile && (
              <p className="text-xs mb-3 p-2 rounded flex items-center justify-between gap-2 flex-wrap" style={{ background: C.paper, color: C.inkSoft }}>
                <span>📎 {docFile.name} · SHA-256 <span style={{ fontFamily: MONO }}>{docFile.sha256.slice(0, 14)}…</span></span>
                <Btn small kind="ghost" onClick={() => setDocFile(null)}>Remove</Btn>
              </p>
            )}
            <Field label="Or paste the certificate text">
              <textarea className={inputCls} style={{ ...inputStyle(C), minHeight: 120, fontFamily: MONO, fontSize: 12 }} value={docIn} onChange={(e) => setDocIn(e.target.value)} placeholder="Paste the certificate or transcript text here (Ctrl+V / Cmd+V)…" />
            </Field>
            <p className="text-xs mb-3" style={{ color: C.muted }}>
              We extract the key fields (ID, institution, programme, year, GPA), hash them with SHA-256, and compare against the official record. A match verifies authenticity; a mismatch flags possible forgery.
            </p>
            <Btn onClick={verifyDoc} disabled={(!docIn && !docFile) || busy}>{busy ? "Checking…" : "Verify"}</Btn>
          </>
        )}
      </Card>

      {result && (
        <Card>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="rounded-full flex items-center justify-center shrink-0" style={{ width: 48, height: 48, background: result.ok ? C.greenPale : C.redPale, color: result.ok ? C.green : C.red, fontSize: 24, fontWeight: 700 }}>
              {result.ok ? "✓" : "✕"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm mb-1" style={{ color: result.ok ? C.green : C.red }}>{result.ok ? "Verified" : "Verification failed"}</div>
              <p className="text-sm" style={{ color: C.inkSoft }}>{result.msg}</p>
              {result.extracted && (result.extracted.studentId || result.extracted.institution || result.extracted.program) && (
                <div className="mt-3 p-3 rounded text-xs" style={{ background: C.paper }}>
                  <div className="font-semibold mb-1" style={{ color: C.gray, textTransform: "uppercase", letterSpacing: "0.05em" }}>Academic data extracted from the document</div>
                  <div style={{ fontFamily: MONO, color: C.inkSoft }}>
                    ID: {result.extracted.studentId || "—"} · institution: {result.extracted.institution || "—"} · programme: {result.extracted.program || "—"} · year: {result.extracted.graduationYear || "—"} · GPA: {result.extracted.gpa || "—"}
                  </div>
                  {result.docDataHash && <div className="mt-1 break-all" style={{ fontFamily: MONO, color: C.gray }}>data hash (document): {result.docDataHash}</div>}
                  {result.storedDataHash && <div className="break-all" style={{ fontFamily: MONO, color: result.docDataHash === result.storedDataHash ? C.green : C.red }}>data hash (official record): {result.storedDataHash}</div>}
                  {result.ok && (
                    <div className="mt-1" style={{ color: result.exact ? C.green : C.amber }}>
                      {result.exact ? "✓ The document is also byte-for-byte identical to the sealed original." : "Note: the academic data is authentic, but this copy differs in formatting from the sealed original (e.g. re-saved or reformatted)."}
                    </div>
                  )}
                </div>
              )}
              {result.ok && result.rec && (
                <div className="mt-3 p-3 rounded text-sm" style={{ background: C.paper }}>
                  {[
                    ["Identity", "✓ Verified through SevisPass"],
                    ["Student", `${studentName(result.rec.structured.studentId)} (${formatSevisId(result.rec.structured.studentId)})`],
                    ["Institution", result.rec.structured.institution],
                    ["Level", result.rec.structured.credentialLevel || "—"],
                    ["Award", result.rec.structured.program + (result.rec.structured.completionYear ? ` · ${result.rec.structured.completionYear}` : "")],
                    ["Graduation", result.rec.structured.graduationStatus || "—"],
                    ["Verified by", result.rec.structured.verifiedBy || result.rec.source],
                    ["Credential status", "✓ Authentic and verified"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2 py-0.5">
                      <span className="text-xs font-semibold" style={{ color: C.gray, width: 110, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{k}</span>
                      <span style={{ color: C.ink }}>{v}</span>
                    </div>
                  ))}
                  <div className="mt-2"><FingerprintStrip hash={result.rec.hash} /></div>
                  <div className="text-xs mt-1 break-all" style={{ fontFamily: MONO, color: C.gray }}>{result.rec.hash}</div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <SectionTitle>My verification history</SectionTitle>
      {checks.length === 0 && <Card><p className="text-sm" style={{ color: C.gray }}>No checks yet. Every verification you run is logged here and in the platform audit trail.</p></Card>}
      {checks.map((c, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-2 px-1 text-xs flex-wrap" style={{ borderBottom: `1px solid ${C.line}` }}>
          <span style={{ fontFamily: MONO, color: C.gray }}>{c.t}</span>
          <span style={{ color: C.inkSoft }}>{c.method === "qr_scan" ? "QR scan" : "Document upload"}</span>
          <Badge status={c.result} />
        </div>
      ))}
    </div>
  );
}

export default EmployerView;
