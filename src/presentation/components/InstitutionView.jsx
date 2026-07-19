import React, { useState } from "react";
import { MONO, useC } from "../theme";
import { CREDENTIAL_LEVELS } from "../../data/referenceData";
import { PERSONAS, studentName } from "../../data/seedData";
import { computeRecordHash, readFileWithHash } from "../../application/crypto";
import { sampleTranscript } from "../../application/certificate";
import { now, yearRange, validYearRange } from "../../application/utils";
import { Badge, Card, Btn, Field, SectionTitle, Seal, inputCls, inputStyle, YearRangeSelect } from "./ui";

/* ============================================================ INSTITUTION */
function InstitutionView({ user, institutions, entries, setEntries, records, setRecords, tokens, setTokens, log }) {
  const C = useC();  const inst = institutions.find((i) => i.id === user.instId);
  const queue = entries.filter((e) => e.institutionId === inst.id && e.status === "pending_institution_verification");
  const verified = entries.filter((e) => e.institutionId === inst.id && e.status === "png_verified");
  const history = records.filter((r) => r.issuingInstitutionId === inst.id);
  const [certFor, setCertFor] = useState(null);
  const [viewFor, setViewFor] = useState(null); // request being viewed in full before a decision
  const [f, setF] = useState({ gpa: "", award: "", year: "", grad: "Graduated", courses: "", doc: "", file: null });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState(null); // { student } | { notFound: true } | null
  const [enroll, setEnroll] = useState({ program: "", startYear: "", endYear: "", level: "University Degree" });
  const [editFor, setEditFor] = useState(null);
  const [ef, setEf] = useState({ program: "", gpa: "", award: "", year: "", grad: "Graduated", courses: "", doc: "", file: null });
  const [confirmDel, setConfirmDel] = useState(null);

  const startEdit = (r) => {
    setEditFor(r.id);
    setEf({ program: r.structured.program || "", gpa: r.structured.gpa || "", award: r.structured.classAward || "", year: r.structured.completionYear || "", grad: r.structured.graduationStatus || "Graduated", courses: r.structured.coursesCompleted || "", doc: r.docText, file: r.file || null });
  };

  const saveEdit = async (r) => {
    setBusy(true);
    const structured = { ...r.structured, program: ef.program, gpa: ef.gpa, classAward: ef.award, completionYear: ef.year, graduationStatus: ef.grad, coursesCompleted: ef.courses };
    delete structured.documentFileName;
    delete structured.documentSha256;
    if (ef.file) { structured.documentFileName = ef.file.name; structured.documentSha256 = ef.file.sha256; }
    const hash = await computeRecordHash(structured, ef.doc);
    setRecords((rs) => rs.map((x) => (x.id === r.id ? { ...x, structured, docText: ef.doc, file: ef.file || null, hash, hashAt: now() } : x)));
    setEntries((es) => es.map((x) => (x.id === r.entryId ? { ...x, program: ef.program, enrollment: ef.grad } : x)));
    log(`${inst.name} edited record ${r.id} for ${studentName(r.structured.studentId)} — record re-sealed with a new SHA-256 hash.`);
    setEditFor(null);
    setBusy(false);
  };

  const deleteRecord = (r) => {
    setRecords((rs) => rs.filter((x) => x.id !== r.id));
    setTokens((ts) => ts.filter((t) => t.recordId !== r.id)); // revoke any shared QR tokens
    setEntries((es) => es.map((x) => (x.id === r.entryId ? { ...x, status: "png_verified", enrollment: "Active — enrolled" } : x)));
    log(`${inst.name} deleted record ${r.id} for ${studentName(r.structured.studentId)} — QR tokens revoked, entry returned to "awaiting transcript".`);
    setConfirmDel(null);
  };

  const runSearch = () => {
    const id = q.trim().toUpperCase();
    const student = PERSONAS.find((p) => p.role === "student" && p.id.toUpperCase() === id);
    setSearched(student ? { student } : { notFound: true });
    setEnroll({ program: "", startYear: "", endYear: "", level: "University Degree" });
  };

  const createEnrollment = (student) => {
    const id = "e" + Math.random().toString(36).slice(2, 8);
    setEntries((es) => [...es, { id, studentId: student.id, institutionId: inst.id, institutionName: inst.name, type: "png", level: enroll.level, program: enroll.program, startYear: enroll.startYear, endYear: enroll.endYear, status: "png_verified", enrollment: "Active — enrolled" }]);
    log(`${inst.name} registered and verified enrollment for ${student.name} (${student.id}) — ${enroll.program}.`);
    setEnroll({ program: "", startYear: "", endYear: "", level: "University Degree" });
  };

  const actionFor = (e) => {
    if (e.status === "pending_institution_verification") return <Btn small kind="green" onClick={() => verify(e)}>Verify enrollment</Btn>;
    if (e.status === "png_verified") return <Btn small kind="gold" onClick={() => { setCertFor(e.id); setF({ gpa: "", award: "", year: "", grad: "Graduated", courses: "", doc: "", file: null }); }}>Upload transcript &amp; GPA</Btn>;
    return null;
  };


  if (inst.status !== "approved")
    return (
      <Card>
        <Badge status="pending" />
        <p className="text-sm mt-3" style={{ color: C.inkSoft }}>
          {inst.name} is awaiting admin approval (registration no. {inst.accreditationNo}). The dashboard unlocks once it's approved.
        </p>
      </Card>
    );

  const verify = (e) => {
    setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, status: "png_verified", enrollment: "Active — enrolled" } : x)));
    log(`${inst.name} verified enrollment for ${studentName(e.studentId)} (${e.studentId}).`);
  };

  const approveGrad = async (r) => {
    const structured = { ...r.structured, graduationStatus: "Graduated" };
    const hash = await computeRecordHash(structured, r.docText);
    setRecords((rs) => rs.map((x) => (x.id === r.id ? { ...x, structured, hash, hashAt: now() } : x)));
    setEntries((es) => es.map((x) => (x.id === r.entryId ? { ...x, enrollment: "Graduated" } : x)));
    log(`${inst.name} approved graduation for ${studentName(r.structured.studentId)} — record ${r.id} re-sealed with a new hash.`);
  };

  const certify = async (e) => {
    setBusy(true);
    const structured = {
      studentId: e.studentId,
      institution: inst.name,
      program: e.program,
      completionYear: f.year,
      gpa: f.gpa,
      classAward: f.award,
      graduationStatus: f.grad,
      verifiedBy: inst.name,
      credentialLevel: e.level || "",
      coursesCompleted: f.courses,
      startYear: e.startYear || "",
      endYear: e.endYear || "",
    };
    if (e.docType) structured.documentType = e.docType; // the document the student requested
    if (f.file) { structured.documentFileName = f.file.name; structured.documentSha256 = f.file.sha256; }
    const hash = await computeRecordHash(structured, f.doc);
    const rec = { id: "r" + Math.random().toString(36).slice(2, 8), entryId: e.id, issuingInstitutionId: inst.id, structured, docText: f.doc, file: f.file || null, hash, hashAt: now(), source: "PNG institution — official record", type: "png_official" };
    setRecords((rs) => [...rs, rec]);
    setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, status: "certified", enrollment: f.grad } : x)));
    log(`${inst.name} certified record ${rec.id} for ${studentName(e.studentId)} — hash ${hash.slice(0, 12)}…`);
    setCertFor(null);
    setF({ gpa: "", award: "", year: "", grad: "Graduated", courses: "", doc: "", file: null });
    setBusy(false);
  };

  const entryRow = (e, action) => (
    <Card key={e.id}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-bold text-sm" style={{ color: C.ink }}>{studentName(e.studentId)} <span style={{ fontFamily: MONO, color: C.gray, fontWeight: 400 }}>({e.studentId})</span></div>
          {e.requesterName && e.requesterName !== studentName(e.studentId) && (
            <div className="text-xs" style={{ color: C.amber }}>Name entered on request: {e.requesterName} — confirm it matches the SevisPass identity above</div>
          )}
          <div className="text-sm" style={{ color: C.inkSoft }}>{e.program}{yearRange(e) ? ` · ${yearRange(e)}` : ""}</div>
          {e.docType && (
            <div className="text-xs mt-1 font-semibold" style={{ color: C.goldDeep }}>
              📄 Requested document: {e.docType}
            </div>
          )}
          <div className="text-xs mt-1" style={{ color: e.enrollment ? C.green : C.gray }}>Enrollment: {e.enrollment || "not yet verified"}</div>
          {e.requestNote && <div className="text-xs mt-1 italic" style={{ color: C.inkSoft }}>Student note: "{e.requestNote}"</div>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge status={e.status} />
          <Btn small kind="ghost" onClick={() => setViewFor(viewFor === e.id ? null : e.id)}>{viewFor === e.id ? "Hide request" : "View request"}</Btn>
          {action}
        </div>
      </div>
      {viewFor === e.id && (
        <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.line}` }}>
          <div className="text-xs font-semibold mb-3" style={{ color: C.goldDeep, letterSpacing: "0.06em" }}>STUDENT REQUEST — FULL DETAILS</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[["Full name (entered by student)", e.requesterName || studentName(e.studentId)], ["SevisPass identity", `${studentName(e.studentId)} (${e.studentId})`], ["Student ID no.", e.studentId], ["Type of document requested", e.docType || "—"], ["Grade or course", e.program || "—"], ["Credential type", e.level || "—"], ["Starting year", e.startYear || (e.years || "—")], ["Ending year", e.endYear || "—"], ["Enrollment status", e.enrollment || "not yet verified"]].map(([label, value]) => (
            <div key={label}>
              <div className="text-xs" style={{ color: C.gray }}>{label}</div>
              <div className="font-semibold" style={{ color: C.ink }}>{value}</div>
            </div>
            ))}
          </div>
          {e.requestNote && <div className="text-xs mt-3 italic" style={{ color: C.inkSoft }}>Message to the registrar: "{e.requestNote}"</div>}
          <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: `1px dashed ${C.line}` }}>
            {action}
            <Btn small kind="ghost" onClick={() => setViewFor(null)}>Close</Btn>
          </div>
        </div>
      )}
      {certFor === e.id && (
        <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.line}` }}>
          {e.docType && <p className="text-xs mb-3 p-2 rounded font-semibold" style={{ background: C.goldPale, color: C.goldDeep }}>Student requested: {e.docType}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="GPA"><input className={inputCls} style={inputStyle(C)} value={f.gpa} onChange={(ev) => setF({ ...f, gpa: ev.target.value })} placeholder="3.4" /></Field>
            <Field label="Class / award"><input className={inputCls} style={inputStyle(C)} value={f.award} onChange={(ev) => setF({ ...f, award: ev.target.value })} placeholder="First Class Honours" /></Field>
            <Field label="Completion year"><input className={inputCls} style={inputStyle(C)} value={f.year} onChange={(ev) => setF({ ...f, year: ev.target.value })} placeholder="2023" /></Field>
            <Field label="Courses completed (comma-separated)">
              <input className={inputCls} style={inputStyle(C)} value={f.courses} onChange={(ev) => setF({ ...f, courses: ev.target.value })} placeholder="e.g. Programming I, Databases, Networks, Systems Analysis" />
            </Field>
            <Field label="Graduation status">
              <select className={inputCls} style={inputStyle(C)} value={f.grad} onChange={(ev) => setF({ ...f, grad: ev.target.value })}>
                <option>Graduated</option>
                <option>Enrolled — active</option>
                <option>Completed — award pending</option>
              </select>
            </Field>
          </div>
          <Field label="Transcript / certificate text (the official document)">
            <textarea className={inputCls} style={{ ...inputStyle(C), minHeight: 110, fontFamily: MONO, fontSize: 12 }} value={f.doc} onChange={(ev) => setF({ ...f, doc: ev.target.value })} />
          </Field>
          <Field label="Attach official document file (PDF, scan, image — its SHA-256 fingerprint is sealed into the record)">
            <input type="file" className="text-xs" onChange={async (ev) => { const fl = await readFileWithHash(ev.target.files && ev.target.files[0]); if (fl) setF((p) => ({ ...p, file: fl })); ev.target.value = ""; }} />
          </Field>
          {f.file && (
            <p className="text-xs mb-3 p-2 rounded flex items-center justify-between gap-2 flex-wrap" style={{ background: C.goldPale, color: C.goldDeep }}>
              <span>📎 {f.file.name} ({Math.max(1, Math.round(f.file.size / 1024))} KB) · SHA-256 <span style={{ fontFamily: MONO }}>{f.file.sha256.slice(0, 14)}…</span></span>
              <Btn small kind="ghost" onClick={() => setF((p) => ({ ...p, file: null }))}>Remove</Btn>
            </p>
          )}
          <div className="flex gap-2">
            <Btn small kind="ghost" onClick={() => setF({ ...f, doc: sampleTranscript(studentName(e.studentId), e.studentId, inst.name, e.program, f.year || "2023", f.gpa || "3.4") })}>Generate sample document</Btn>
            <Btn small kind="gold" disabled={!f.doc || busy} onClick={() => certify(e)}>{busy ? "Hashing…" : "Hash & certify record"}</Btn>
            <Btn small kind="ghost" onClick={() => setCertFor(null)}>Cancel</Btn>
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <div>
      <SectionTitle>{inst.name} — registrar dashboard</SectionTitle>
      <p className="text-xs -mt-2 mb-2 px-1" style={{ color: C.gray }}>{inst.kind || "Institution"} · Authorized Issuer{inst.status === "approved" ? "" : " (pending)"} · accreditation no. {inst.accreditationNo}</p>

      <SectionTitle>Search student by SevisPass ID</SectionTitle>
      <Card>
        <div className="flex gap-2 flex-wrap">
          <input className={inputCls + " flex-1"} style={{ ...inputStyle(C), fontFamily: MONO, minWidth: 180 }} value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="e.g. SP-1003" onKeyDown={(ev) => ev.key === "Enter" && runSearch()} />
          <Btn onClick={runSearch} disabled={!q.trim()}>Search</Btn>
        </div>
        {searched && searched.notFound && <p className="text-sm mt-3" style={{ color: C.red }}>No student found with that SevisPass ID.</p>}
        {searched && searched.student && (() => {
          const s = searched.student;
          const theirEntries = entries.filter((e) => e.studentId === s.id && e.institutionId === inst.id);
          return (
            <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.line}` }}>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <div className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, background: C.greenPale, color: C.green, fontWeight: 700 }}>✓</div>
                <div>
                  <div className="font-bold text-sm" style={{ color: C.ink }}>Student found: {s.name}</div>
                  <div className="text-xs" style={{ fontFamily: MONO, color: C.gray }}>{s.id} · identity verified via SevisPass · {s.tier}</div>
                </div>
              </div>
              {theirEntries.length > 0 ? (
                theirEntries.map((e) => entryRow(e, actionFor(e)))
              ) : (
                <div>
                  <p className="text-sm mb-3" style={{ color: C.inkSoft }}>No enrollment at {inst.name} on file. Register this student:</p>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Credential type">
                      <select className={inputCls} style={inputStyle(C)} value={enroll.level} onChange={(ev) => setEnroll({ ...enroll, level: ev.target.value })}>
                        {CREDENTIAL_LEVELS.map((l) => <option key={l}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Program"><input className={inputCls} style={inputStyle(C)} value={enroll.program} onChange={(ev) => setEnroll({ ...enroll, program: ev.target.value })} placeholder="e.g. Grade 12 Certificate" /></Field>
                  </div>
                  <YearRangeSelect startYear={enroll.startYear} endYear={enroll.endYear} onChange={({ startYear, endYear }) => setEnroll({ ...enroll, startYear, endYear })} />
                  <Btn small kind="green" disabled={!enroll.program || !validYearRange(enroll.startYear, enroll.endYear)} onClick={() => createEnrollment(s)}>Register &amp; verify enrollment</Btn>
                </div>
              )}
            </div>
          );
        })()}
      </Card>

      <SectionTitle>Record upload requests from students ({queue.length})</SectionTitle>
      {queue.length === 0 && <Card><p className="text-sm" style={{ color: C.gray }}>Queue is empty. When a student requests a document upload (transcript, certificate, statement of results…), it appears here with their name, ID, grade/course, and the document type they need.</p></Card>}
      {queue.map((e) => entryRow(e, <Btn small kind="green" onClick={() => verify(e)}>Verify enrollment</Btn>))}

      <SectionTitle>Enrolled — awaiting transcript &amp; GPA ({verified.length})</SectionTitle>
      {verified.length === 0 && <Card><p className="text-sm" style={{ color: C.gray }}>No verified students awaiting a record upload.</p></Card>}
      {verified.map((e) => entryRow(e, <Btn small kind="gold" onClick={() => { setCertFor(e.id); setF({ gpa: "", award: "", year: "", grad: "Graduated", courses: "", doc: "", file: null }); }}>Upload transcript &amp; GPA</Btn>))}

      <SectionTitle>Certified record history ({history.length})</SectionTitle>
      {history.map((r) => (
        <Card key={r.id}>
          <div className="flex items-center gap-4 flex-wrap">
            <Seal hash={r.hash} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm" style={{ color: C.ink }}>{studentName(r.structured.studentId)} · {r.structured.program}</div>
              <div className="text-xs" style={{ color: r.structured.graduationStatus === "Graduated" ? C.green : C.amber }}>Graduation: {r.structured.graduationStatus || "—"}</div>
              {r.file && <div className="text-xs" style={{ color: C.inkSoft }}>📎 {r.file.name} · sealed fingerprint {r.file.sha256.slice(0, 12)}…</div>}
              <div className="text-xs break-all" style={{ fontFamily: MONO, color: C.gray }}>{r.hash}</div>
              <div className="text-xs" style={{ color: C.gray }}>Sealed {r.hashAt}</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {r.structured.graduationStatus !== "Graduated" && (
                <Btn small kind="green" onClick={() => approveGrad(r)}>Approve graduation</Btn>
              )}
              <Btn small kind="ghost" onClick={() => (editFor === r.id ? setEditFor(null) : startEdit(r))}>{editFor === r.id ? "Cancel edit" : "Edit record"}</Btn>
              {confirmDel === r.id ? (
                <>
                  <Btn small kind="danger" onClick={() => deleteRecord(r)}>Confirm delete</Btn>
                  <Btn small kind="ghost" onClick={() => setConfirmDel(null)}>Keep</Btn>
                </>
              ) : (
                <Btn small kind="danger" onClick={() => { setConfirmDel(r.id); setEditFor(null); }}>Delete</Btn>
              )}
            </div>
          </div>
          {confirmDel === r.id && (
            <p className="text-xs mt-3 p-2 rounded" style={{ background: C.redPale, color: C.red }}>
              Deleting revokes all QR tokens for this record and returns the student's entry to "awaiting transcript". This is permanent.
            </p>
          )}
          {editFor === r.id && (
            <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.line}` }}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Program"><input className={inputCls} style={inputStyle(C)} value={ef.program} onChange={(ev) => setEf({ ...ef, program: ev.target.value })} /></Field>
                <Field label="GPA"><input className={inputCls} style={inputStyle(C)} value={ef.gpa} onChange={(ev) => setEf({ ...ef, gpa: ev.target.value })} /></Field>
                <Field label="Class / award"><input className={inputCls} style={inputStyle(C)} value={ef.award} onChange={(ev) => setEf({ ...ef, award: ev.target.value })} /></Field>
                <Field label="Completion year"><input className={inputCls} style={inputStyle(C)} value={ef.year} onChange={(ev) => setEf({ ...ef, year: ev.target.value })} /></Field>
              </div>
              <Field label="Courses completed (comma-separated)">
                <input className={inputCls} style={inputStyle(C)} value={ef.courses} onChange={(ev) => setEf({ ...ef, courses: ev.target.value })} />
              </Field>
              <Field label="Graduation status">
                <select className={inputCls} style={inputStyle(C)} value={ef.grad} onChange={(ev) => setEf({ ...ef, grad: ev.target.value })}>
                  <option>Graduated</option>
                  <option>Enrolled — active</option>
                  <option>Completed — award pending</option>
                </select>
              </Field>
              <Field label="Transcript / certificate text">
                <textarea className={inputCls} style={{ ...inputStyle(C), minHeight: 110, fontFamily: MONO, fontSize: 12 }} value={ef.doc} onChange={(ev) => setEf({ ...ef, doc: ev.target.value })} />
              </Field>
              <Field label="Attached document file">
                <input type="file" className="text-xs" onChange={async (ev) => { const fl = await readFileWithHash(ev.target.files && ev.target.files[0]); if (fl) setEf((p) => ({ ...p, file: fl })); ev.target.value = ""; }} />
              </Field>
              {ef.file && (
                <p className="text-xs mb-3 p-2 rounded flex items-center justify-between gap-2 flex-wrap" style={{ background: C.goldPale, color: C.goldDeep }}>
                  <span>📎 {ef.file.name} ({Math.max(1, Math.round(ef.file.size / 1024))} KB) · SHA-256 <span style={{ fontFamily: MONO }}>{ef.file.sha256.slice(0, 14)}…</span></span>
                  <Btn small kind="ghost" onClick={() => setEf((p) => ({ ...p, file: null }))}>Remove</Btn>
                </p>
              )}
              <p className="text-xs mb-2" style={{ color: C.amber }}>Saving re-seals this record with a new SHA-256 hash and a new timestamp. Copies of the old document will no longer verify.</p>
              <Btn small kind="gold" disabled={!ef.doc || busy} onClick={() => saveEdit(r)}>{busy ? "Re-sealing…" : "Save & re-seal record"}</Btn>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export default InstitutionView;
