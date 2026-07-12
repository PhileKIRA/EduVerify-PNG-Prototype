import React, { useState, useEffect } from "react";
import { C, FONT, MONO } from "./theme";
import { LOGO_EMBLEM } from "../data/assets";
import { PERSONAS, SEED_INSTITUTIONS } from "../data/seedData";
import { seedRegistry } from "../data/repository";
import { now } from "../application/utils";
import { Btn } from "./components/ui";
import Landing from "./components/Landing";
import Login from "./components/Login";
import StudentView from "./components/StudentView";
import InstitutionView from "./components/InstitutionView";
import AdminView from "./components/AdminView";
import EmployerView from "./components/EmployerView";

/* ============================================================ MAIN APP
   Presentation-tier root: owns UI/session state only. All persisted data
   (records, hashing, seeding) is fetched through the data tier via
   seedRegistry(), and all business logic lives in the application tier —
   this component just renders views and wires their callbacks together.
   ============================================================ */
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
      const { entries: seedEntries, records: seedRecords, events: seedEvents } = await seedRegistry();
      setEntries(seedEntries);
      setRecords(seedRecords);
      setEvents(seedEvents);
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
            <img src={LOGO_EMBLEM} alt="EduVerify PNG emblem" style={{ width: 38, height: 38, objectFit: "contain" }} />
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
            <Btn kind="gold" small onClick={() => { setUser(null); setView("landing"); }}>{user.id === "GUEST" ? "Exit portal" : "Sign out"}</Btn>
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
  if (user.role === "student") return shell(<StudentView {...props} />);
  if (user.role === "institution") return shell(<InstitutionView {...props} />);
  if (user.role === "admin") return shell(<AdminView {...props} />);
  return shell(<EmployerView {...props} />);
}
