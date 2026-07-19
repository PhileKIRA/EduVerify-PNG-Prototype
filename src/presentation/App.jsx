import React, { useState, useEffect } from "react";
import { themeFor, ThemeCtx, FONT, MONO } from "./theme";
import { LOGO_EMBLEM } from "../data/assets";
import { PERSONAS, SEED_INSTITUTIONS } from "../data/seedData";
import { seedRegistry } from "../data/repository";
import { saveState, loadState, saveSession, loadSession, clearAll } from "../data/storage";
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
  const [mode, setMode] = useState(() => localStorage.getItem("ev-theme") || "light");
  const C = themeFor(mode);
  const toggleTheme = () => setMode((m) => { const n = m === "light" ? "dark" : "light"; localStorage.setItem("ev-theme", n); return n; });

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

  /* boot: restore persisted data from localStorage; seed only on first run.
     A refresh no longer loses anything — data, audit log, and session survive. */
  useEffect(() => {
    (async () => {
      const saved = loadState();
      if (saved) {
        setEntries(saved.entries || []);
        setRecords(saved.records || []);
        setTokens(saved.tokens || []); // share tokens do not expire in the prototype (testing time limit removed)
        setChecks(saved.checks || []);
        setEvents(saved.events || []);
        if (Array.isArray(saved.institutions) && saved.institutions.length) setInstitutions(saved.institutions);
        if (Array.isArray(saved.users) && saved.users.length) setUsers(saved.users);
        if (saved.profiles && typeof saved.profiles === "object") setProfiles(saved.profiles);
      } else {
        const { entries: seedEntries, records: seedRecords, events: seedEvents } = await seedRegistry();
        setEntries(seedEntries);
        setRecords(seedRecords);
        setEvents(seedEvents);
      }
      const sess = loadSession();
      if (sess) setUser(sess);
      setReady(true);
    })();
  }, []);

  /* persist every change (post-boot) */
  useEffect(() => {
    if (!ready) return;
    saveState({ entries, records, tokens, checks, events, institutions, users, profiles });
  }, [ready, entries, records, tokens, checks, events, institutions, users, profiles]);

  /* persist the signed-in session so a refresh keeps you signed in */
  useEffect(() => {
    if (!ready) return;
    saveSession(user);
  }, [ready, user]);

  /* testing tool: wipe all saved data and reseed the demo registry */
  const resetDemo = () => {
    if (!window.confirm("Reset all demo data? This clears every request, record, token, and audit entry, signs you out, and restores the original seed data.")) return;
    clearAll();
    window.location.reload();
  };

  if (!ready)
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg, fontFamily: FONT, color: C.muted }}>
        Starting EduVerify PNG…
      </div>
    );

  const shell = (content) => (
    <ThemeCtx.Provider value={C}>
      <div className="min-h-screen" style={{ background: C.bg, fontFamily: FONT, color: C.ink }}>
        <header style={{ position: "sticky", top: 0, zIndex: 20, background: C.surface, borderBottom: `1px solid ${C.line}` }}
                className="px-4 sm:px-6 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            {/* transparent logo — no white tile; soft glow on dark for legibility */}
            <img src={LOGO_EMBLEM} alt="EduVerify PNG" className="shrink-0" style={{ width: 40, height: 40, objectFit: "contain", display: "block", filter: C.logoGlow }} />
            <div>
              <div style={{ fontSize: 9, color: C.gold, letterSpacing: "0.16em", fontWeight: 700 }}>PAPUA NEW GUINEA</div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" }}>EduVerify</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={toggleTheme}
              style={{ fontSize: 12, fontWeight: 700, padding: "8px 13px", background: C.surface2, border: `1px solid ${C.lineStrong}`, borderRadius: 999, color: C.ink, cursor: "pointer", fontFamily: FONT }}>
              {mode === "light" ? "Dark mode" : "Light mode"}
            </button>
            {user && (
              <>
                <div className="flex items-center gap-2.5" style={{ background: C.surface2, padding: "5px 6px 5px 13px", borderRadius: 999 }}>
                  <div className="text-right">
                    <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.15, color: C.ink }}>{user.name}</div>
                    <div style={{ fontSize: 10, color: C.faint, fontFamily: MONO }}>{user.id === "GUEST" ? "no account" : "✓ verified"}</div>
                  </div>
                  <div className="flex items-center justify-center"
                       style={{ width: 28, height: 28, borderRadius: 999, background: C.green, color: "#fff", fontSize: 11, fontWeight: 700 }}>
                    {user.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
                  </div>
                </div>
                <Btn kind="ghost" small onClick={() => { setUser(null); setView("landing"); }}>
                  {user.id === "GUEST" ? "Exit" : "Sign out"}
                </Btn>
              </>
            )}
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 pt-6 sm:pt-8">{content}</main>
        <footer className="max-w-4xl mx-auto px-4 sm:px-6 py-6 text-center"
                style={{ borderTop: `1px solid ${C.line}`, color: C.faint, fontFamily: FONT }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.muted }}>
            Developed by Pacman5 · Divine Word University
          </div>
          <div style={{ fontSize: 11.5, marginTop: 4 }}>
            © {new Date().getFullYear()} EduVerify PNG · Phase 1 prototype ·{" "}
            <button onClick={resetDemo}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.muted, textDecoration: "underline", fontSize: 11.5, fontFamily: FONT }}>
              Reset demo data
            </button>
          </div>
        </footer>
      </div>
    </ThemeCtx.Provider>
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

  const props = { user, users, institutions, setInstitutions, entries, setEntries, records, setRecords, tokens, setTokens, checks, setChecks, events, log, profiles, setProfiles };
  if (user.role === "student") return shell(<StudentView {...props} />);
  if (user.role === "institution") return shell(<InstitutionView {...props} />);
  if (user.role === "admin") return shell(<AdminView {...props} />);
  return shell(<EmployerView {...props} />);
}
