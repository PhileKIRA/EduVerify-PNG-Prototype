import React, { useState } from "react";
import { MONO, useC } from "../theme";
import { CREDENTIAL_LEVELS, DOCUMENT_TYPES, GRADE_COURSE_OPTIONS } from "../../data/referenceData";
import { copyText, selectAllOnClick } from "../../application/clipboard";
import { buildCertificateHtml, sampleTranscript } from "../../application/certificate";
import { randToken, now, yearRange, validYearRange } from "../../application/utils";
import { readFileWithHash } from "../../application/crypto";
import { Badge, Card, Btn, Field, SectionTitle, Seal, FingerprintStrip, QRCode, Modal, YearRangeSelect, ShareLink, inputCls, inputStyle } from "./ui";

/* ============================================================ STUDENT */
function StudentView({ user, institutions, entries, setEntries, records, tokens, setTokens, checks, log, profiles, setProfiles }) {
  const C = useC();  const myProfile = profiles[user.id] || { email: "", phone: "" };
  const [prof, setProf] = useState(myProfile);
  const [profSaved, setProfSaved] = useState(false);
  const saveProfile = () => {
    setProfiles((p) => ({ ...p, [user.id]: { email: prof.email.trim(), phone: prof.phone.trim() } }));
    setProfSaved(true);
    setTimeout(() => setProfSaved(false), 2000);
    log(`${user.name} updated their profile contact details.`);
  };
  const mine = entries.filter((e) => e.studentId === user.id);
  const hasPngAnchor = mine.some((e) => e.type === "png" && e.status === "certified");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: "overseas", institutionId: "inst-upng", level: "University Degree", name: "", country: "", program: "", startYear: "", endYear: "", doc: "", file: null, notes: "" });
  const [qrFor, setQrFor] = useState(null); // {record, token}
  const [uploadFor, setUploadFor] = useState(null);
  const [docText, setDocText] = useState("");
  const [copied, setCopied] = useState("");

  /* build the shareable message + links for a generated QR credential */
  const shareBits = (q) => {
    const s = q.record.structured;
    const url = `https://eduverify.example.pg/verify?token=${q.token}`; // prototype URL — live deployment serves the real verify page here
    const msg =
      `Verified academic credential — ${user.name} (${user.id})\n` +
      `${s.program} · ${s.institution}${s.completionYear ? ` · ${s.completionYear}` : ""}\n` +
      `Graduation status: ${s.graduationStatus || "—"}\n\n` +
      `Verify instantly on EduVerify PNG: ${url}\n` +
      `Or paste this token in the verification portal: ${q.token}\n` +
      `Record fingerprint (SHA-256): ${q.record.hash.slice(0, 16)}…\n\n` +
      `EduVerify PNG — Trusted academic credentials. Instantly verified.`;
    return { url, msg, s };
  };

  const copyMsg = (text, label) => {
    copyText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  const triggerDownload = (blob, filename) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadOriginal = (record) => {
    triggerDownload(new Blob([record.file.bytes], { type: record.file.type }), record.file.name);
    log(`${user.name} downloaded the original institution-uploaded file for record ${record.id} (byte-for-byte, as sealed).`);
  };

  const downloadRecord = (record) => {
    const html = buildCertificateHtml(user.name, record);
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `EduVerifyPNG_Record_${record.id}_${user.name.replace(/\s+/g, "_")}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    log(`${user.name} downloaded official record ${record.id} — original hash embedded as QR on the document.`);
  };

  const nativeShare = async (q) => {
    const { msg } = shareBits(q);
    if (navigator.share) {
      try { await navigator.share({ title: "EduVerify PNG credential", text: msg }); } catch (e) {}
    } else copyMsg(msg, "share");
  };

  const approvedPng = institutions.filter((i) => i.isPng && i.status === "approved");
  const firstTime = mine.length === 0;
  const emptyRequest = { fullName: user.name, institutionId: "inst-upng", level: "University Degree", docType: DOCUMENT_TYPES[0], program: "", startYear: "", endYear: "", note: "", email: "", phone: "" };
  const [rf, setRf] = useState(emptyRequest);
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const submitRequest = () => {
    const inst = approvedPng.find((i) => i.id === rf.institutionId);
    const id = "e" + Math.random().toString(36).slice(2, 8);
    setEntries((es) => [...es, {
      id, studentId: user.id, institutionId: inst.id, institutionName: inst.name, type: "png",
      level: rf.level, program: rf.program, startYear: rf.startYear, endYear: rf.endYear,
      requesterName: rf.fullName.trim() || user.name, docType: rf.docType, requestNote: rf.note,
      status: "pending_institution_verification",
    }]);
    if (rf.email || rf.phone) setProfiles((p) => ({ ...p, [user.id]: { email: (rf.email || "").trim(), phone: (rf.phone || "").trim() } }));
    log(`${rf.fullName.trim() || user.name} (${user.id}) requested ${inst.name} to upload: ${rf.docType} — ${rf.program}.`);
    setRf(emptyRequest);
    setRequesting(false);
    setRequestSent(true);
    setTimeout(() => setRequestSent(false), 4000);
  };

  /* shared request form — students enter their full name, ID, grade/course and
     the document type they want the institution to upload */
  const requestForm = (compact) => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Your full name">
          <input className={inputCls} style={inputStyle(C)} value={rf.fullName} onChange={(e) => setRf({ ...rf, fullName: e.target.value })} placeholder="e.g. Maria Toua" />
        </Field>
        <Field label="Student ID no. (SevisPass — read-only)">
          <input className={inputCls} style={{ ...inputStyle(C), fontFamily: MONO, opacity: 0.75 }} value={user.id} readOnly />
        </Field>
      </div>
      <Field label="Your institution (schools, colleges, TVET, and universities)">
        <select className={inputCls} style={inputStyle(C)} value={rf.institutionId} onChange={(e) => setRf({ ...rf, institutionId: e.target.value })}>
          {approvedPng.map((i) => <option key={i.id} value={i.id}>{i.name}{i.kind ? ` — ${i.kind}` : ""}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type of document to upload">
          <select className={inputCls} style={inputStyle(C)} value={rf.docType} onChange={(e) => setRf({ ...rf, docType: e.target.value })}>
            {DOCUMENT_TYPES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Credential type">
          <select className={inputCls} style={inputStyle(C)} value={rf.level} onChange={(e) => setRf({ ...rf, level: e.target.value })}>
            {CREDENTIAL_LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Grade or course">
          <select className={inputCls} style={inputStyle(C)} value={rf.program} onChange={(e) => setRf({ ...rf, program: e.target.value })}>
            <option value="">Select grade or course…</option>
            {GRADE_COURSE_OPTIONS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
      </div>
      <YearRangeSelect startYear={rf.startYear} endYear={rf.endYear} onChange={({ startYear, endYear }) => setRf({ ...rf, startYear, endYear })} />
      {!compact && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact email">
            <input className={inputCls} style={inputStyle(C)} value={rf.email} onChange={(e) => setRf({ ...rf, email: e.target.value })} placeholder="you@example.pg" />
          </Field>
          <Field label="Phone">
            <input className={inputCls} style={inputStyle(C)} value={rf.phone} onChange={(e) => setRf({ ...rf, phone: e.target.value })} placeholder="+675 …" />
          </Field>
        </div>
      )}
      <Field label="Message to the registrar (optional)">
        <input className={inputCls} style={inputStyle(C)} value={rf.note} onChange={(e) => setRf({ ...rf, note: e.target.value })} placeholder="e.g. Former student ID UPNG-22-0451, completed Semester 2 2025" />
      </Field>
      <Btn kind="gold" disabled={!rf.program || !rf.fullName.trim() || !validYearRange(rf.startYear, rf.endYear)} onClick={submitRequest}>Send request to my institution</Btn>
      <p className="text-xs mt-3" style={{ color: C.muted }}>
        Sent to your registrar's queue, matched to your SevisPass identity ({user.id}). Once the institution uploads and seals the requested record, it appears here automatically.
      </p>
    </>
  );

  /* overseas qualification submission — saved as an Overseas Review request and
     sent straight to the Administrator Dashboard -> Overseas Reviews (status: Pending).
     PNG records are requested from the institution via "Request academic records". */
  const addEntry = () => {
    const id = "e" + Math.random().toString(36).slice(2, 8);
    setEntries((es) => [...es, {
      id, studentId: user.id, institutionId: null, institutionName: form.name, country: form.country,
      type: "overseas", level: form.level, program: form.program,
      startYear: form.startYear, endYear: form.endYear,
      pendingDoc: form.doc.trim() || null, pendingFile: form.file || null, notes: form.notes.trim() || null,
      submittedAt: now(), status: "pending_admin_review",
    }]);
    log(`${user.name} submitted overseas qualification for review: ${form.name} (${form.country}) — ${form.program}, ${form.startYear}–${form.endYear}. Pending admin review.`);
    setAdding(false);
    setForm({ type: "overseas", institutionId: "inst-upng", level: "University Degree", name: "", country: "", program: "", startYear: "", endYear: "", doc: "", file: null, notes: "" });
  };

  const genQR = (record) => {
    const token = randToken();
    /* testing time limit removed — tokens stay valid until the demo data is reset */
    setTokens((t) => [...t, { token, recordId: record.id, expiresAt: null }]);
    setQrFor({ record, token });
    log(`QR token issued for record ${record.id}.`);
  };

  const submitOverseasDoc = (entry) => {
    setEntries((es) => es.map((e) => (e.id === entry.id ? { ...e, status: "pending_admin_review", pendingDoc: docText, submittedAt: now() } : e)));
    log(`${user.name} uploaded overseas document for ${entry.institutionName} — pending admin review.`);
    setUploadFor(null);
    setDocText("");
  };

  /* ---------- first login: the student must request their university to upload records ---------- */
  if (firstTime)
    return (
      <div>
        <SectionTitle>Welcome to EduVerify PNG, {user.name.split(" ")[0]}!</SectionTitle>
        <Card>
          <p className="text-sm mb-4" style={{ color: C.inkSoft }}>
            Your SevisPass identity is verified, but your profile is empty. You never upload your own grades — your first step is to <b>ask your institution to verify your enrollment and upload your official records</b>.
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {["Request", "Registrar verifies", "Records sealed", "View & share"].map((s, i) => (
              <React.Fragment key={s}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 13px" }}>{s}</span>
                {i < 3 && <span style={{ color: C.gold, fontWeight: 800 }}>→</span>}
              </React.Fragment>
            ))}
          </div>
          {requestForm(false)}
        </Card>
      </div>
    );

  return (
    <div>
      <SectionTitle>My profile</SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <div><div className="text-xs" style={{ color: C.gray }}>Full name (from SevisPass)</div><div className="font-semibold" style={{ color: C.ink }}>{user.name}</div></div>
          <div><div className="text-xs" style={{ color: C.gray }}>ID number (read-only)</div><div style={{ fontFamily: MONO, color: C.ink }}>{user.id}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact email (provided by you)">
            <input className={inputCls} style={inputStyle(C)} value={prof.email} onChange={(e) => setProf({ ...prof, email: e.target.value })} placeholder="you@example.pg" />
          </Field>
          <Field label="Phone (provided by you)">
            <input className={inputCls} style={inputStyle(C)} value={prof.phone} onChange={(e) => setProf({ ...prof, phone: e.target.value })} placeholder="+675 …" />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Btn small onClick={saveProfile}>{profSaved ? "✓ Saved" : "Save contact details"}</Btn>
          <span className="text-xs" style={{ color: C.gray }}>You manage your own contact details; academic records come only from your institutions.</span>
        </div>
      </Card>

      <SectionTitle>Request academic records</SectionTitle>
      <Card>
        <p className="text-sm mb-3" style={{ color: C.inkSoft }}>
          Need a transcript, certificate, or statement of results on your profile? Send a request — your institution receives it, verifies your enrollment, and uploads the sealed official record.
        </p>
        {requestSent && (
          <p className="text-xs mb-3 p-3 rounded font-semibold" style={{ background: C.greenPale, color: C.green }}>
            ✓ Request sent — it now appears in your institution's registrar queue and below under "My academic records".
          </p>
        )}
        {requesting ? (
          <>
            {requestForm(true)}
            <div className="mt-2"><Btn small kind="ghost" onClick={() => setRequesting(false)}>Cancel</Btn></div>
          </>
        ) : (
          <Btn kind="gold" onClick={() => { setRf(emptyRequest); setRequesting(true); }}>Request a record upload</Btn>
        )}
      </Card>

      <SectionTitle>Overseas institution</SectionTitle>
      <Card>
        <p className="text-sm mb-3" style={{ color: C.inkSoft }}>
          Studied abroad? Submit your overseas institution and qualification here — it goes straight to the system administrator's Overseas Reviews queue, is checked against the issuing institution (via DHERST), and is approved or rejected. If rejected, the reason appears on this page. PNG records aren't added here; request those from your institution above.
        </p>
        {adding ? (
          <>
            <Field label="Institution name"><input className={inputCls} style={inputStyle(C)} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. University of Queensland" /></Field>
            <Field label="Country"><input className={inputCls} style={inputStyle(C)} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="e.g. Australia" /></Field>
            <Field label="Credential type">
              <select className={inputCls} style={inputStyle(C)} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                {CREDENTIAL_LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Program / certificate"><input className={inputCls} style={inputStyle(C)} value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} placeholder="e.g. BSc Computer Science" /></Field>
            <YearRangeSelect startYear={form.startYear} endYear={form.endYear} onChange={({ startYear, endYear }) => setForm({ ...form, startYear, endYear })} />
            <Field label="Official academic document — upload a file (PDF, image, or Word) and/or paste the text">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" className={inputCls} style={inputStyle(C)}
                onChange={async (e) => {
                  const picked = e.target.files && e.target.files[0];
                  setForm({ ...form, file: picked ? await readFileWithHash(picked) : null });
                }} />
              {form.file && (
                <div className="text-xs mt-1 p-2 rounded flex items-center justify-between gap-2 flex-wrap" style={{ background: C.greenPale, color: C.green }}>
                  <span>📎 {form.file.name} · {(form.file.size / 1024).toFixed(1)} KB — fingerprinted (SHA-256 {form.file.sha256.slice(0, 12)}…)</span>
                  <Btn small kind="ghost" onClick={() => setForm({ ...form, file: null })}>Remove</Btn>
                </div>
              )}
              <textarea className={inputCls} rows={4} style={{ ...inputStyle(C), fontFamily: MONO, fontSize: 12, marginTop: 8 }} value={form.doc} onChange={(e) => setForm({ ...form, doc: e.target.value })} placeholder="Optionally paste the text of your overseas transcript or certificate here…" />
            </Field>
            <Field label="Additional notes (optional)">
              <input className={inputCls} style={inputStyle(C)} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything the administrator should know, e.g. former names, exchange programme details" />
            </Field>
            <div className="flex gap-2">
              <Btn onClick={addEntry} disabled={!form.program || !form.name || !validYearRange(form.startYear, form.endYear)}>Submit for admin review</Btn>
              <Btn kind="ghost" onClick={() => setAdding(false)}>Cancel</Btn>
            </div>
            {!hasPngAnchor && (
              <p className="text-xs mt-2" style={{ color: C.amber }}>Note: you have no certified PNG record yet (identity anchor) — the administrator will see this during review.</p>
            )}
          </>
        ) : (
          <Btn onClick={() => setAdding(true)}>Add institution</Btn>
        )}
      </Card>

      <SectionTitle>My academic records</SectionTitle>
      <p className="text-xs mb-3 px-1" style={{ color: C.muted }}>
        You claim a qualification here — your institution verifies it and uploads the official record. Students can't self-upload grades.
      </p>

      {mine.length === 0 && <Card><p className="text-sm" style={{ color: C.gray }}>No entries yet. Add your first institution to begin.</p></Card>}

      {[...mine].sort((a, b) => {
        const ra = CREDENTIAL_LEVELS.indexOf(a.level), rb = CREDENTIAL_LEVELS.indexOf(b.level);
        return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
      }).map((e) => {
        const record = records.find((r) => r.entryId === e.id);
        const overseasLocked = e.type === "overseas" && e.status === "awaiting_upload" && !hasPngAnchor;
        return (
          <Card key={e.id}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                {e.level && <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded mb-1" style={{ background: C.goldPale, color: C.goldDeep }}>{e.level}</span>}
                <div className="font-bold text-sm" style={{ color: C.ink }}>{e.institutionName}{e.country ? ` · ${e.country}` : ""}</div>
                <div className="text-sm" style={{ color: C.inkSoft }}>{e.program}{yearRange(e) ? ` · ${yearRange(e)}` : ""}</div>
                <div className="text-xs mt-1" style={{ color: C.gray }}>{e.type === "png" ? "PNG institution" : "Overseas institution"}</div>
                <div className="text-xs mt-1 font-semibold" style={{ color: e.enrollment ? C.green : C.gray }}>
                  Enrollment status: {e.enrollment || "not yet verified by institution"}
                </div>
              </div>
              <Badge status={overseasLocked ? "locked" : e.status} />
            </div>

            {e.status === "pending_institution_verification" && (
              <p className="text-xs mt-3 p-3 rounded" style={{ background: C.amberPale, color: C.amber }}>
                Request sent to {e.institutionName}{e.docType ? ` for: ${e.docType}` : ""}. The registrar will verify your enrollment, then upload and seal your official records — they'll appear here automatically.
              </p>
            )}

            {e.status === "rejected" && (
              <p className="text-sm mt-3 p-3 rounded" style={{ background: C.redPale, color: C.red }}>Rejected: {e.rejectReason || "no reason recorded"}. Submit a new entry with corrected details if you wish to try again.</p>
            )}

            {e.type === "overseas" && e.status === "awaiting_upload" && (
              <div className="mt-3">
                {overseasLocked ? (
                  <p className="text-xs p-3 rounded" style={{ background: "#EEECE6", color: C.gray }}>
                    Upload locked. A PNG institution must first verify you and certify an official record — that certified record is the identity anchor required before overseas documents can be submitted.
                  </p>
                ) : uploadFor === e.id ? (
                  <div>
                    <Field label="Overseas document (paste text of degree/transcript)">
                      <textarea className={inputCls} style={{ ...inputStyle(C), minHeight: 110, fontFamily: MONO, fontSize: 12 }} value={docText} onChange={(ev) => setDocText(ev.target.value)} />
                    </Field>
                    <div className="flex gap-2">
                      <Btn small kind="ghost" onClick={() => setDocText(sampleTranscript(user.name, user.id, e.institutionName, e.program, "2025", "6.2/7.0"))}>Use sample document</Btn>
                      <Btn small onClick={() => submitOverseasDoc(e)} disabled={!docText}>Submit for admin review</Btn>
                      <Btn small kind="ghost" onClick={() => setUploadFor(null)}>Cancel</Btn>
                    </div>
                  </div>
                ) : (
                  <Btn small kind="gold" onClick={() => setUploadFor(e.id)}>Upload overseas document</Btn>
                )}
              </div>
            )}

            {record && e.status === "certified" && (
              <div className="mt-4 flex gap-4 items-start flex-wrap" style={{ background: C.surface2, borderRadius: 14, padding: 16 }}>
                <Seal hash={record.hash} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: C.faint, marginBottom: 6 }}>Record fingerprint (SHA-256)</div>
                  <FingerprintStrip hash={record.hash} />
                  <div className="text-xs mt-1 break-all" style={{ fontFamily: MONO, color: C.inkSoft }}>{record.hash}</div>
                  <div className="text-xs mt-1" style={{ color: C.gray }}>Certified {record.hashAt} · {record.source}</div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Btn small kind="gold" onClick={() => genQR(record)}>Share credential — generate QR</Btn>
                    <Btn small onClick={() => downloadRecord(record)}>Download record (hash QR)</Btn>
                    {record.file && <Btn small kind="ghost" onClick={() => downloadOriginal(record)}>Download attached file ({record.file.name})</Btn>}
                    <Btn small kind="ghost" onClick={() => { copyText(record.docText); setCopied("cert:" + record.id); setTimeout(() => setCopied(""), 2000); }}>{copied === "cert:" + record.id ? "✓ Copied!" : "Copy certificate text"}</Btn>
                  </div>
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer" style={{ color: C.gray }}>View certificate document (click text to select all)</summary>
                    <pre onClick={selectAllOnClick} title="Click to select all, then Ctrl+C / Cmd+C" className="text-xs mt-2 p-3 rounded overflow-auto cursor-pointer" style={{ background: C.paper, fontFamily: MONO, color: C.inkSoft, whiteSpace: "pre-wrap" }}>{record.docText}</pre>
                  </details>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {qrFor && (() => {
        const { url, msg, s } = shareBits(qrFor);
        const emailHref = `mailto:?subject=${encodeURIComponent(`Verified academic credential — ${user.name}`)}&body=${encodeURIComponent(msg)}`;
        const linkedInHref =
          `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME` +
          `&name=${encodeURIComponent(s.program)}` +
          `&organizationName=${encodeURIComponent(s.institution)}` +
          (s.completionYear ? `&issueYear=${encodeURIComponent(s.completionYear)}` : "") +
          `&certUrl=${encodeURIComponent(url)}&certId=${encodeURIComponent(qrFor.token)}`;
        const waHref = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        return (
          <Modal onClose={() => setQrFor(null)} maxWidth={680}>
            <div className="flex items-start justify-between">
              <SectionTitle>Share this credential</SectionTitle>
              <Btn small kind="ghost" onClick={() => setQrFor(null)}>Close</Btn>
            </div>
            <div className="text-sm -mt-2 mb-3" style={{ color: C.inkSoft }}>{s.program} · {s.institution}</div>
            <div className="flex gap-5 items-start flex-wrap">
              <div className="flex flex-col items-center gap-1">
                <QRCode value={qrFor.token} size={168} />
                <span className="text-xs" style={{ color: C.muted }}>Scannable — encodes the token</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm mb-2" style={{ color: C.inkSoft }}>Sharing is your consent for the recipient to verify this credential. Only a secure token is shared — never your records — and you can revoke access at any time by resetting the demo data.</p>
                <div className="text-xs mb-1" style={{ color: C.gray }}>Verification ID (token)</div>
                <div className="text-xs p-2 rounded break-all" style={{ background: C.paper, fontFamily: MONO, color: C.ink }}>{qrFor.token}</div>

                <div className="text-xs font-semibold mt-4 mb-2" style={{ color: C.goldDeep, letterSpacing: "0.08em" }}>SHARE TO</div>
                <div className="flex gap-2 flex-wrap">
                  <ShareLink href={linkedInHref}>in LinkedIn — Add to profile</ShareLink>
                  <ShareLink href={emailHref}>✉ Email</ShareLink>
                  <ShareLink href={waHref}>WhatsApp</ShareLink>
                  <ShareLink onClick={(e) => { e.preventDefault(); copyMsg(msg, "message"); }}>{copied === "message" ? "✓ Copied!" : "Copy share message"}</ShareLink>
                  <ShareLink onClick={(e) => { e.preventDefault(); copyMsg(qrFor.token, "token"); }}>{copied === "token" ? "✓ Copied!" : "Copy token"}</ShareLink>
                  <ShareLink onClick={(e) => { e.preventDefault(); downloadRecord(qrFor.record); }}>⬇ Download record (hash QR embedded)</ShareLink>
                  {typeof navigator !== "undefined" && navigator.share && (
                    <ShareLink onClick={(e) => { e.preventDefault(); nativeShare(qrFor); }}>Share…</ShareLink>
                  )}
                </div>
                <p className="text-xs mt-3" style={{ color: C.gray }}>
                  LinkedIn opens the "Add license &amp; certification" form pre-filled with this qualification and its verification link. Email and WhatsApp open a ready-made message. Prototype note: the verification link points at the future live domain — for this demo, recipients paste the token into the verification portal instead.
                </p>
              </div>
            </div>
          </Modal>
        );
      })()}

      <SectionTitle>Verification history</SectionTitle>
      {(() => {
        const myChecks = checks.filter((c) => {
          const r = records.find((x) => x.id === c.recordId);
          return r && r.structured.studentId === user.id;
        });
        if (myChecks.length === 0)
          return <Card><p className="text-sm" style={{ color: C.gray }}>No one has verified your credentials yet. When an employer or scholarship provider checks a record you shared, it appears here.</p></Card>;
        return myChecks.map((c, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2 px-1 text-xs flex-wrap" style={{ borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontFamily: MONO, color: C.gray }}>{c.t}</span>
            <span style={{ color: C.inkSoft }}>{c.by} · {c.method === "qr_scan" ? "QR scan" : "Document upload"}</span>
            <Badge status={c.result} />
          </div>
        ));
      })()}
    </div>
  );
}

export default StudentView;
