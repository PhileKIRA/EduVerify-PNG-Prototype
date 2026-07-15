/* ============================================================
   PRESENTATION TIER — Admin dashboard.
   ============================================================ */
import React, { useState } from "react";
import { C, FONT, MONO } from "../theme.js";
import { Badge, Btn, Card, SectionTitle } from "./ui.jsx";
import { computeRecordHash } from "../../application/crypto.js";
import { now } from "../../application/textUtils.js";
import { PERSONAS } from "../../data/seedData.js";

const inputCls =
  "w-full rounded border px-3 py-2 text-sm outline-none";

const inputStyle = {
  borderColor: C.line,
  background: C.card,
  color: C.ink,
};

function AdminView({ user, institutions, setInstitutions, entries, setEntries, records, setRecords, events, log }) {
  const [tab, setTab] = useState("institutions");
  const pendingInst = institutions.filter((i) => i.status === "pending");
  const reviews = entries.filter((e) => e.status === "pending_admin_review");
  const [source, setSource] = useState({});
  const [reason, setReason] = useState({});
  const [viewInstitution, setViewInstitution] = useState(null);

  const studentName = (id) => (PERSONAS.find((p) => p.id === id) || {}).name || id;

  const approveInst = (i) => {
    setInstitutions((xs) => xs.map((x) => (x.id === i.id ? { ...x, status: "approved" } : x)));
    log(`Admin approved institution registration: ${i.name}.`);
  };
  const rejectInst = (i) => {
    setInstitutions((xs) => xs.map((x) => (x.id === i.id ? { ...x, status: "rejected" } : x)));
    log(`Admin rejected institution registration: ${i.name}.`);
  };

  const viewInst = (i) => {
  setViewInstitution(i);
};

  
  const approveOverseas = async (e) => {
    const src = source[e.id] || "Confirmed via DHERST";
    const structured = { studentId: e.studentId, institution: e.institutionName, country: e.country || "", program: e.program, years: e.years, graduationStatus: "Completed", verifiedBy: src, credentialLevel: e.level || "Overseas Qualification" };
    const hash = await computeRecordHash(structured, e.pendingDoc || "");
    const rec = { id: "r" + Math.random().toString(36).slice(2, 8), entryId: e.id, issuingInstitutionId: "ADMIN", structured, docText: e.pendingDoc || "", hash, hashAt: now(), source: src, type: "overseas_official" };
    setRecords((rs) => [...rs, rec]);
    setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, status: "certified", enrollment: "Completed" } : x)));
    log(`Admin approved overseas qualification for ${studentName(e.studentId)} (${e.institutionName}) — source: ${src}; hash ${hash.slice(0, 12)}…`);
  };
  const rejectOverseas = (e) => {
    const why = reason[e.id] || "Could not be verified with issuing institution";
    setEntries((es) => es.map((x) => (x.id === e.id ? { ...x, status: "rejected", rejectReason: why } : x)));
    log(`Admin rejected overseas qualification for ${studentName(e.studentId)} (${e.institutionName}): ${why}`);
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
          <button key={k} onClick={() => setTab(k)} className="text-sm px-4 py-2 rounded font-semibold" style={{ background: tab === k ? C.ink : "transparent", color: tab === k ? "#fff" : C.ink, border: `1px solid ${tab === k ? C.ink : C.line}` }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "institutions" && (
  <>
    {pendingInst.length === 0 && (
      <Card>
        <p className="text-sm" style={{ color: C.gray }}>
          No pending institution registrations.
        </p>
      </Card>
    )}

    {pendingInst.map((i) => (
      <Card key={i.id}>
        <div className="flex items-center justify-between gap-3 flex-wrap">

          <div>
            <div
              className="font-bold text-sm"
              style={{ color: C.ink }}
            >
              {i.name}
            </div>

            <div
              className="text-xs"
              style={{ color: C.gray }}
            >
              {i.kind || "Institution"} · 
              Accreditation no. {i.accreditationNo} · 
              {i.country}
            </div>
          </div>
<div className="flex gap-2">

          <Btn 
  small 
  kind="blue"
  onClick={() => {
    console.log("VIEW CLICKED", i);
    setViewInstitution(i);
  }}
>
  View
</Btn>
          
            

          </div>

        </div>
      </Card>
    ))}

 {/* VIEW INSTITUTION DETAILS */}

    {viewInstitution && (
      <Card>

        <h2
          className="text-lg font-bold mb-4"
          style={{ color: C.ink }}
        >
          Institution Registration Details
        </h2>


        <p>
          <b>Name:</b> {viewInstitution.name}
        </p>


        <p>
          <b>Type:</b> {viewInstitution.kind}
        </p>


        <p>
          <b>Country:</b> {viewInstitution.country}
        </p>


        <p>
          <b>Accreditation Number:</b> {viewInstitution.accreditationNo}
        </p>


        <p>
          <b>Contact:</b> {viewInstitution.contact}
        </p>


        <p>
          <b>Status:</b> {viewInstitution.status}
        </p>



        <div className="flex gap-2 mt-4">


          <Btn
            small
            kind="green"
            onClick={() => {
              approveInst(viewInstitution);
              setViewInstitution(null);
            }}
          >
            Approve
          </Btn>



          <Btn
            small
            kind="danger"
            onClick={() => {
              rejectInst(viewInstitution);
              setViewInstitution(null);
            }}
          >
            Reject
          </Btn>



          <Btn
            small
            kind="ghost"
            onClick={() => setViewInstitution(null)}
          >
            Close
          </Btn>


        </div>

      </Card>
    )}

    <SectionTitle>
      All institutions
    </SectionTitle>


    {institutions.map((i) => (
      <Card key={i.id}>
        <div className="flex items-center justify-between gap-2 flex-wrap">

          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: C.ink }}
            >
              {i.name}
            </div>

            <div
              className="text-xs"
              style={{ color: C.gray }}
            >
              {i.kind || "Institution"}
            </div>
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
            const anchor = entries.find((x) => x.studentId === e.studentId && x.type === "png" && x.status === "certified");
            return (
              <Card key={e.id}>
                <div className="font-bold text-sm" style={{ color: C.ink }}>{studentName(e.studentId)} <span style={{ fontFamily: MONO, fontWeight: 400, color: C.gray }}>({e.studentId})</span></div>
                <div className="text-sm" style={{ color: C.inkSoft }}>{e.institutionName}{e.country ? `, ${e.country}` : ""} · {e.program} · {e.years}</div>
                <div className="text-xs mt-1" style={{ color: anchor ? C.green : C.red }}>
                  PNG anchor: {anchor ? `certified record at ${anchor.institutionName} ✓` : "none found"}
                </div>
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer" style={{ color: C.gray }}>View uploaded document</summary>
                  <pre className="text-xs mt-2 p-3 rounded overflow-auto" style={{ background: C.paper, fontFamily: MONO, color: C.inkSoft, whiteSpace: "pre-wrap" }}>{e.pendingDoc}</pre>
                </details>
                <div className="grid gap-2 mt-3">
                  <input className={inputCls} style={inputStyle} placeholder='Verification source, e.g. "Confirmed via DHERST" or "Direct — University of Queensland"' value={source[e.id] || ""} onChange={(ev) => setSource({ ...source, [e.id]: ev.target.value })} />
                  <input className={inputCls} style={inputStyle} placeholder="Rejection reason (if rejecting)" value={reason[e.id] || ""} onChange={(ev) => setReason({ ...reason, [e.id]: ev.target.value })} />
                  <div className="flex gap-2">
                    <Btn small kind="gold" onClick={() => approveOverseas(e)}>Approve — hash &amp; certify</Btn>
                    <Btn small kind="danger" onClick={() => rejectOverseas(e)}>Reject</Btn>
                  </div>
                </div>
              </Card>
            );
          })}
        </>
      )}

      {tab === "audit" && (
        <>
          <Card>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm" style={{ color: C.inkSoft }}>Demo tool: simulate an attacker silently editing a stored document in the database. Its hash is not updated, so any later verification of that record fails.</p>
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

/* ============================================================ EMPLOYER */

export default AdminView;
