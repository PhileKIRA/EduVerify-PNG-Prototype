import React, { useState } from "react";
import { MONO, useC } from "../theme";
import { studentName } from "../../data/seedData";
import { computeRecordHash } from "../../application/crypto";
import { now, yearRange } from "../../application/utils";
import { Badge, Card, Btn, SectionTitle, Modal, inputCls, inputStyle } from "./ui";

/* ============================================================ ADMIN */
function AdminView({ user, users = [], institutions, setInstitutions, entries, setEntries, records, setRecords, events, log }) {
  const C = useC();  const [tab, setTab] = useState("institutions");
  const pendingInst = institutions.filter((i) => i.status === "pending");
  const reviews = entries.filter((e) => e.status === "pending_admin_review");
  const [source, setSource] = useState({});
  const [reason, setReason] = useState({});
  const [viewInst, setViewInst] = useState(null);   // institution registration being viewed
  const [viewReview, setViewReview] = useState(null); // overseas review being viewed

  const approveInst = (i) => {
    setInstitutions((xs) => xs.map((x) => (x.id === i.id ? { ...x, status: "approved" } : x)));
    log(`Admin approved institution registration: ${i.name}.`);
    setViewInst(null);
  };
  const rejectInst = (i) => {
    setInstitutions((xs) => xs.map((x) => (x.id === i.id ? { ...x, status: "rejected" } : x)));
    log(`Admin rejected institution registration: ${i.name}.`);
    setViewInst(null);
  };

  const approveOverseas = async (e) => {
    const src = source[e.id] || "Confirmed via DHERST";
    const structured = { studentId: e.studentId, institution: e.institutionName, country: e.country || "", program: e.program, startYear: e.startYear || "", endYear: e.endYear || "", years: yearRange(e), graduationStatus: "Completed", verifiedBy: src, credentialLevel: e.level || "Overseas Qualification" };
    if (e.pendingFile) { structured.documentFileName = e.pendingFile.name; structured.documentSha256 = e.pendingFile.sha256; } // seal the uploaded file's fingerprint
    const hash = await computeRecordHash(structured, e.pendingDoc || "");
    const rec = { id: "r" + Math.random().toString(36).slice(2, 8), entryId: e.id, issuingInstitutionId: "ADMIN", structured, docText: e.pendingDoc || "", file: e.pendingFile || null, hash, hashAt: now(), source: src, type: "overseas_official" };
    setRecords((rs) => [...rs, rec]);
    setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, status: "certified", enrollment: "Completed", decidedAt: now() } : x)));
    log(`Admin approved overseas qualification for ${studentName(e.studentId)} (${e.institutionName}) — source: ${src}; hash ${hash.slice(0, 12)}…`);
    setViewReview(null);
  };
  const rejectOverseas = (e) => {
    const why = (reason[e.id] || "").trim();
    if (!why) return; // a rejection reason is required
    setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, status: "rejected", rejectReason: why, decidedAt: now() } : x)));
    log(`Admin rejected overseas qualification for ${studentName(e.studentId)} (${e.institutionName}): ${why}`);
    setViewReview(null);
  };

  /* demo tool: alter a stored record's document without re-hashing to show integrity failure */
  const tamper = () => {
    setRecords((rs) => rs.map((r, i) => (i === 0 ? { ...r, docText: r.docText + "\n[ALTERED BY ATTACKER]" } : r)));
    log("DEMO: stored document for the first record was altered in the database WITHOUT updating its hash. Verification of that record will now fail.");
  };

  const tabs = [["institutions", `Institutions (${pendingInst.length})`], ["overseas", `Overseas reviews (${reviews.length})`], ["audit", "Audit log"]];

  return (
    <div>
      <SectionTitle>Administrator dashboard</SectionTitle>
      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map(([k, label]) => (
          <Btn key={k} small kind={tab === k ? "primary" : "ghost"} onClick={() => setTab(k)}>{label}</Btn>
        ))}
      </div>

      {tab === "institutions" && (
        <>
          {pendingInst.length === 0 && <Card><p className="text-sm" style={{ color: C.gray }}>No pending institution registrations.</p></Card>}
          {pendingInst.map((i) => {
            const staff = users.find((u) => u.role === "institution" && u.instId === i.id);
            const open = viewInst === i.id;
            return (
              <Card key={i.id}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold text-sm" style={{ color: C.ink }}>{i.name}</div>
                    <div className="text-xs" style={{ color: C.gray }}>{i.kind || "Institution"} · awaiting review</div>
                  </div>
                  <Btn small onClick={() => setViewInst(open ? null : i.id)}>{open ? "Hide form" : "View"}</Btn>
                </div>
                {open && (
                  <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.line}` }}>
                    <div className="text-xs font-semibold mb-3" style={{ color: C.goldDeep, letterSpacing: "0.06em" }}>INSTITUTION REGISTRATION FORM</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      {[["Institution name", i.name], ["Institution type", i.kind || "Institution"], ["DHERST accreditation / registration no.", i.accreditationNo], ["Country", i.country], ["Contact email", i.contact || "—"], ["Registrar / admin account", staff ? `${staff.name} (${staff.id})` : "—"]].map(([label, value]) => (
                        <div key={label}>
                          <div className="text-xs" style={{ color: C.gray }}>{label}</div>
                          <div className="font-semibold" style={{ color: C.ink }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs mt-3" style={{ color: C.muted }}>Approving makes this institution an Authorized Issuer able to verify students and seal official records.</p>
                    <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: `1px dashed ${C.line}` }}>
                      <Btn small kind="green" onClick={() => approveInst(i)}>Approve</Btn>
                      <Btn small kind="danger" onClick={() => rejectInst(i)}>Reject</Btn>
                      <Btn small kind="ghost" onClick={() => setViewInst(null)}>Close</Btn>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
          <SectionTitle>All institutions</SectionTitle>
          {institutions.map((i) => (
            <Card key={i.id}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-sm font-semibold" style={{ color: C.ink }}>{i.name}</div>
                  <div className="text-xs" style={{ color: C.gray }}>{i.kind || "Institution"}</div>
                </div>
                <Badge status={i.status} />
              </div>
            </Card>
          ))}
        </>
      )}

      {tab === "overseas" && (
        <>
          {reviews.length === 0 && <Card><p className="text-sm" style={{ color: C.gray }}>No overseas qualifications awaiting review.</p></Card>}
          {reviews.map((e) => {
            const open = viewReview === e.id;
            return (
              <Card key={e.id}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="grid gap-0.5">
                    <div className="font-bold text-sm" style={{ color: C.ink }}>{studentName(e.studentId)} <span style={{ fontFamily: MONO, fontWeight: 400, color: C.gray }}>({e.studentId})</span></div>
                    <div className="text-sm" style={{ color: C.inkSoft }}>{e.institutionName}{e.country ? `, ${e.country}` : ""}</div>
                    <div className="text-xs" style={{ color: C.gray }}>
                      {e.program || "—"}{e.level ? ` (${e.level})` : ""} · {e.startYear || "?"} – {e.endYear || "?"}{e.submittedAt ? ` · submitted ${e.submittedAt}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status="pending" />
                    <Btn small onClick={() => setViewReview(e.id)}>View</Btn>
                  </div>
                </div>
                {open && (() => {
                  const anchor = entries.find((x) => x.studentId === e.studentId && x.type === "png" && x.status === "certified");
                  const reasonText = (reason[e.id] || "").trim();
                  return (
                    <Modal onClose={() => setViewReview(null)} maxWidth={720}>
                      <div className="flex items-start justify-between gap-3">
                        <SectionTitle>Overseas qualification review</SectionTitle>
                        <Badge status="pending" />
                      </div>
                      <div className="text-xs font-semibold mb-3" style={{ color: C.goldDeep, letterSpacing: "0.06em" }}>COMPLETE SUBMITTED FORM</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        {[
                          ["Student name", studentName(e.studentId)],
                          ["Student ID (SevisPass)", e.studentId],
                          ["Institution name", e.institutionName],
                          ["Country", e.country || "—"],
                          ["Qualification", e.program || "—"],
                          ["Credential type", e.level || "—"],
                          ["Starting year", e.startYear || (e.years || "—")],
                          ["Ending year", e.endYear || "—"],
                          ["Submission date", e.submittedAt || "—"],
                          ["PNG identity anchor", anchor ? `Certified record at ${anchor.institutionName} ✓` : "None found ✗"],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <div className="text-xs" style={{ color: C.gray }}>{label}</div>
                            <div className="font-semibold" style={{ color: label === "PNG identity anchor" ? (anchor ? C.green : C.red) : C.ink }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      {e.notes && <div className="text-xs mt-3 italic" style={{ color: C.inkSoft }}>Additional notes from the student: "{e.notes}"</div>}
                      <details className="mt-3" open={Boolean(e.pendingDoc || e.pendingFile)}>
                        <summary className="text-xs cursor-pointer" style={{ color: C.gray }}>Uploaded document</summary>
                        {e.pendingFile && (
                          <div className="text-xs mt-2 p-2 rounded flex items-center justify-between gap-2 flex-wrap" style={{ background: C.paper, color: C.inkSoft }}>
                            <span>📎 {e.pendingFile.name} · {(e.pendingFile.size / 1024).toFixed(1)} KB · SHA-256 <span style={{ fontFamily: MONO }}>{e.pendingFile.sha256.slice(0, 16)}…</span></span>
                            <Btn small kind="ghost" onClick={() => {
                              const a = document.createElement("a");
                              a.href = URL.createObjectURL(new Blob([e.pendingFile.bytes], { type: e.pendingFile.type }));
                              a.download = e.pendingFile.name; a.click(); URL.revokeObjectURL(a.href);
                            }}>Download file</Btn>
                          </div>
                        )}
                        {e.pendingDoc ? (
                          <pre className="text-xs mt-2 p-3 rounded overflow-auto" style={{ background: C.paper, fontFamily: MONO, color: C.inkSoft, whiteSpace: "pre-wrap", maxHeight: 240 }}>{e.pendingDoc}</pre>
                        ) : (!e.pendingFile && (
                          <p className="text-xs mt-2" style={{ color: C.muted }}>No document was attached to this submission.</p>
                        ))}
                      </details>
                      <div className="grid gap-2 mt-4">
                        <input className={inputCls} style={inputStyle(C)} placeholder='Verification source (for approval), e.g. "Confirmed via DHERST" or "Direct — University of Queensland"' value={source[e.id] || ""} onChange={(ev) => setSource({ ...source, [e.id]: ev.target.value })} />
                        <input className={inputCls} style={inputStyle(C)} placeholder="Rejection reason (required to reject — shown to the student)" value={reason[e.id] || ""} onChange={(ev) => setReason({ ...reason, [e.id]: ev.target.value })} />
                        {!reasonText && <p className="text-xs" style={{ color: C.muted }}>To reject, first enter a rejection reason — it will be saved and shown on the student's dashboard.</p>}
                      </div>
                      <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: `1px dashed ${C.line}` }}>
                        <Btn small kind="gold" onClick={() => approveOverseas(e)}>Approve — hash &amp; certify</Btn>
                        <Btn small kind="danger" disabled={!reasonText} onClick={() => rejectOverseas(e)}>Reject</Btn>
                        <Btn small kind="ghost" onClick={() => setViewReview(null)}>Close</Btn>
                      </div>
                    </Modal>
                  );
                })()}
              </Card>
            );
          })}
        </>
      )}

      {tab === "audit" && (
        <>
          <Card>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm" style={{ color: C.inkSoft }}>Demo tool: simulate an attacker silently editing a stored document — its hash isn't updated, so verification of that record then fails.</p>
              <Btn small kind="danger" onClick={tamper} disabled={records.length === 0}>Simulate DB tampering</Btn>
            </div>
          </Card>
          {events.map((ev, i) => (
            <div key={i} className="flex gap-3 py-2 px-1 text-xs" style={{ borderBottom: `1px solid ${C.line}` }}>
              <span style={{ fontFamily: MONO, color: C.gray, whiteSpace: "nowrap" }}>{ev.t}</span>
              <span style={{ color: C.inkSoft }}>{ev.text}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default AdminView;
