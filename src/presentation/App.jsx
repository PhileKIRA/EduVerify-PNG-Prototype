/* ============================================================
   PRESENTATION TIER — application root: session state, seed
   demo data, and role-based routing between the four dashboards.
   ============================================================ */
import React, { useState, useEffect } from "react";
import { C, FONT, MONO } from "./theme.js";
import { Btn } from "./components/ui.jsx";
import Landing from "./components/Landing.jsx";
import Login from "./components/Login.jsx";
import StudentView from "./components/StudentView.jsx";
import InstitutionView from "./components/InstitutionView.jsx";
import AdminView from "./components/AdminView.jsx";
import EmployerView from "./components/EmployerView.jsx";
import { computeRecordHash } from "../application/crypto.js";
import { sampleTranscript } from "../application/certificate.js";
import { now } from "../application/textUtils.js";
import { sevisAuth } from "../application/sevisAuth.js";
import { PERSONAS, SEED_INSTITUTIONS } from "../data/seedData.js";
import VerifyView from "./VerifyView.jsx";

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [view, setView] = useState("landing"); // landing | login
  const [loginGroup, setLoginGroup] = useState("student");
  const [users, setUsers] = useState(PERSONAS);
  const [profiles, setProfiles] = useState({}); // student-provided contact details, keyed by SevisPass ID

  const [institutions, setInstitutions] = useState(SEED_INSTITUTIONS);
  const [entries, setEntries] = useState([]);
  const [records, setRecords] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [checks, setChecks] = useState([]);
  const [events, setEvents] = useState([]);

  const log = (text) => setEvents((e) => [{ t: now(), text }, ...e]);

  /* seed: lifelong portfolios — Philemon carries records from Grade 10 through
     his university degree; David's certified record unlocks the overseas gate */
  useEffect(() => {
    (async () => {
      const mk = async (recId, entry, x) => {
        const structured = {
          studentId: entry.studentId,
          institution: entry.institutionName,
          program: entry.program,
          completionYear: x.year,
          gpa: x.gpa,
          classAward: x.award,
          graduationStatus: "Graduated",
          verifiedBy: entry.institutionName,
          credentialLevel: entry.level,
        };
        const docText = sampleTranscript(x.student, entry.studentId, entry.institutionName, entry.program, x.year, x.gpa);
        const hash = await computeRecordHash(structured, docText);
        return { id: recId, entryId: entry.id, issuingInstitutionId: entry.institutionId, structured, docText, hash, hashAt: now(), source: "PNG institution — official record", type: "png_official" };
      };

      const e1 = { id: "e1", studentId: "SP-1001", institutionId: "inst-upng", institutionName: "University of Papua New Guinea", type: "png", level: "University Degree", program: "BSc Computer Science", years: "2020–2023", status: "pending_institution_verification" };
      const e2 = { id: "e2", studentId: "SP-1002", institutionId: "inst-unitech", institutionName: "PNG University of Technology", type: "png", level: "University Degree", program: "BEng Civil Engineering", years: "2019–2023", status: "certified", enrollment: "Graduated" };
      const e3 = { id: "e3", studentId: "SP-1002", institutionId: null, institutionName: "University of Queensland", country: "Australia", type: "overseas", level: "Postgraduate Degree", program: "MEng Structural Engineering", years: "2024–2025", status: "awaiting_upload" };
      const e4 = { id: "e4", studentId: "SP-1003", institutionId: "inst-dwu", institutionName: "Divine Word University", type: "png", level: "University Degree", program: "Bachelor of Information Systems", years: "2021–2025", status: "certified", enrollment: "Graduated" };
      const e5 = { id: "e5", studentId: "SP-1003", institutionId: "inst-passam", institutionName: "Passam National High School", type: "png", level: "Grade 10 Certificate", program: "Grade 10 Certificate", years: "2016", status: "certified", enrollment: "Graduated" };
      const e6 = { id: "e6", studentId: "SP-1003", institutionId: "inst-sogeri", institutionName: "Sogeri National School of Excellence", type: "png", level: "Grade 12 Certificate", program: "Grade 12 Certificate", years: "2018", status: "certified", enrollment: "Graduated" };
      const e7 = { id: "e7", studentId: "SP-1003", institutionId: "inst-mtc", institutionName: "Madang Technical College", type: "png", level: "College Diploma", program: "Diploma in Information Technology", years: "2019–2020", status: "certified", enrollment: "Graduated" };

      const r1 = await mk("r1", e2, { student: "David Namah", year: "2023", gpa: "3.6", award: "Second Class Honours (Division I)" });
      const r2 = await mk("r2", e4, { student: "Philemon Kira", year: "2025", gpa: "3.8", award: "Credit" });
      const r3 = await mk("r3", e5, { student: "Philemon Kira", year: "2016", gpa: "B", award: "Upper Pass" });
      const r4 = await mk("r4", e6, { student: "Philemon Kira", year: "2018", gpa: "A", award: "Distinction" });
      const r5 = await mk("r5", e7, { student: "Philemon Kira", year: "2020", gpa: "3.5", award: "Merit" });

      setEntries([e1, e2, e3, e4, e5, e6, e7]);
      setRecords([r1, r2, r3, r4, r5]);
      setEvents([{ t: now(), text: "EduVerify PNG registry initialised — 5 records sealed across secondary, TVET/college, and university levels." }]);
      setReady(true);
    })();
  }, []);

  if (!ready)
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.paper, fontFamily: FONT, color: C.gray }}>
        Starting EduVerify PNG…
      </div>
    );

  const shell = (content) => (
    <div className="min-h-screen" style={{ background: C.paper, fontFamily: FONT }}>
      <header style={{ background: C.ink, borderBottom: `3px solid ${C.gold}` }} className="px-5 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="rounded-full shrink-0 flex items-center justify-center" style={{ width: 44, height: 44, background: "#fff", overflow: "hidden" }}>
            <img
  src={`${import.meta.env.BASE_URL}logo-emblem.webp`}
  alt="EduVerify PNG emblem"
  style={{
    width: 38,
    height: 38,
    objectFit: "contain"
  }}
/>
          </div>
          <div>
            <div className="text-xs" style={{ color: C.gold, letterSpacing: "0.18em", fontFamily: MONO }}>PAPUA NEW GUINEA</div>
            <div className="text-white font-bold text-base leading-tight">EduVerify PNG <span className="font-normal" style={{ color: "#B7B0A3", fontSize: 12 }}>· Academic Credential Verification</span></div>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-white text-sm font-semibold">{user.name}</div>
              <div className="text-xs" style={{ color: "#B7B0A3", fontFamily: MONO }}>{user.id === "GUEST" ? "Verification portal · no account" : `${user.id} · ✓ SevisPass verified · ${user.tier || ""}`}</div>
            </div>
            <Btn kind="gold" small onClick={() => { sevisAuth.logout(); setUser(null); setView("landing"); }}>{user.id === "GUEST" ? "Exit portal" : "Sign out"}</Btn>
          </div>
        )}
      </header>
      <main className="max-w-4xl mx-auto px-4 pb-16">{content}</main>
    </div>
  );

  if (!user) {
    if (view === "login")
      return shell(
        <Login
          group={loginGroup}
          users={users}
          onBack={() => setView("landing")}
          onPick={(p) => { setUser(p); log(`${p.name} signed in via SevisPass (mock) — identity verified, ${p.tier}.`); }}
          onRegister={(inst, staff) => {
            setInstitutions((xs) => [...xs, inst]);
            setUsers((us) => [...us, staff]);
            log(`Institution registration submitted: ${inst.name} (accreditation no. ${inst.accreditationNo}) — pending admin approval.`);
          }}
        />
      );
    return shell(
      <Landing
        onStudents={() => { setLoginGroup("student"); setView("login"); }}
        onInstitutions={() => { setLoginGroup("institution"); setView("login"); }}
        onVerify={() => { setUser({ id: "GUEST", role: "employer", name: "Credential Verifier", tier: "" }); log("A verifier opened the public verification portal."); }}
      />
    );
  }

  const props = { user, institutions, setInstitutions, entries, setEntries, records, setRecords, tokens, setTokens, checks, setChecks, events, log, profiles, setProfiles };
  const params = new URLSearchParams(window.location.search);

const verifyToken = params.get("token");


if (verifyToken) {
 return shell(
   <VerifyView
     token={verifyToken}
     {...props}
   />
 );
}
  if (user.role === "student") return shell(<StudentView {...props} />);
  if (user.role === "institution") return shell(<InstitutionView {...props} />);
  if (user.role === "admin") return shell(<AdminView {...props} />);
  return shell(<EmployerView {...props} />);
}

/* ============================================================ LANDING */

