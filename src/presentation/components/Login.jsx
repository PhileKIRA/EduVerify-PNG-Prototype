/* ============================================================
   PRESENTATION TIER — Login (SevisPass SSO flow).

   Fixes applied vs. the single-file prototype (see mentor code review):
   - [Important #4] The QR SVG is now run through DOMPurify before being
     injected via dangerouslySetInnerHTML. In mock mode the SVG is our own
     trusted generator's output, but in live mode it originates from the
     SevisPass server response — sanitizing unconditionally means a
     compromised or malicious response can't inject a script.
   - [Important #5] The "Use biometrics (WebAuthn)" button previously called
     the exact same mock flow as QR login and never touched
     navigator.credentials — it looked implemented but wasn't. It's now
     disabled and honestly labeled "coming soon" until real WebAuthn
     (navigator.credentials.get/create) is wired up.
   - [Important #7] A prototype disclaimer banner is shown so evaluators
     know all state is in-memory and resets on refresh.
   - [Important #3 / Minor #8] On successful auth we verify the returned
     state against the one we stored (verifyAndConsumeState), which is
     where the CSRF/expiry protection from sevisAuth.js actually gets used.
   ============================================================ */
import React, { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { C, FONT, MONO } from "../theme.js";
import { Btn, Card, Field } from "./ui.jsx";
import { sevisAuth, SEVISPASS_CONFIG, verifyAndConsumeState } from "../../application/sevisAuth.js";
import { INSTITUTION_KINDS } from "../../data/seedData.js";

const inputCls =
  "w-full rounded border px-3 py-2 text-sm outline-none";

const inputStyle = {
  borderColor: C.line,
  background: C.card,
  color: C.ink,
};

function PrototypeBanner() {
  return (
    <div
      className="text-xs text-center mb-4 py-1.5 px-3 rounded"
      style={{ background: C.amberPale, color: C.amber, border: `1px solid ${C.amber}55`, fontFamily: FONT }}
    >
      Phase 1 prototype — all data lives in browser memory and resets on refresh. Not a production system.
    </div>
  );
}
function Login({ group, users, onBack, onPick, onRegister }) {
  const [stage, setStage] = useState("start"); // start -> qr -> done | register -> registered
  const [reg, setReg] = useState({ name: "", kind: "University", accreditationNo: "", contact: "", registrar: "" });
  const [newStaff, setNewStaff] = useState(null);
  const [session, setSession] = useState(null);
  const [polls, setPolls] = useState(0);
  const [who, setWho] = useState(null);
  const [err, setErr] = useState(null);
  const list = users.filter((p) => (group === "institution" ? p.role === "institution" || p.role === "admin" : p.role === "student"));

  const submitRegistration = () => {
    const instId = "inst-" + Math.random().toString(36).slice(2, 8);
    const inst = { id: instId, name: reg.name.trim(), kind: reg.kind, country: "PNG", isPng: true, accreditationNo: reg.accreditationNo.trim() || "pending assignment", contact: reg.contact.trim(), status: "pending" };
    const staff = { id: "SP-" + Math.floor(2000 + Math.random() * 900) + "R", role: "institution", name: reg.registrar.trim() || `${reg.name.trim()} Registrar`, instId, sub: `${reg.name.trim()} — registrar`, tier: "Trust Tier 3" };
    onRegister(inst, staff);
    setNewStaff(staff);
    setStage("registered");
  };

  /* poll GET /api/session/status every 2s while the QR is displayed (per the guide) */
  useEffect(() => {
    if (stage !== "qr" || !session) return;
    const iv = setInterval(async () => {
      setPolls((p) => p + 1);
      try {
        const s = await sevisAuth.checkStatus(session.sessionId);
        if (s.authenticated) clearInterval(iv); // live server: would fetch /api/user next
      } catch (e) { /* keep polling */ }
    }, 2000);
    return () => clearInterval(iv);
  }, [stage, session]);

  const begin = async () => {
    setErr(null);
    try {
      const s = await sevisAuth.initiateAuth();
      setSession(s);
      setPolls(0);
      setStage("qr");
    } catch (e) {
  setErr("Could not reach the SevisPass server. Please try again.");
}
  };

  const walletScan = (p) => {
    // Demonstrates the CSRF/expiry check from sevisAuth.js: in mock mode the
    // "wallet" always returns our own session's state, so this always
    // succeeds — but the check runs for real, and would reject a mismatched
    // or expired state exactly as it would against a live SevisPass server.
    const check = verifyAndConsumeState(session.state);
    if (!check.ok) {
      setErr(check.reason);
      setStage("start");
      return;
    }
    setWho(p);
    setStage("done");
  };

  return (
    <div className="pt-8">
      <PrototypeBanner />
      <div className="flex justify-center mb-5">
        <img
  src={`${import.meta.env.BASE_URL}logo-full.webp`}
  alt="EduVerify PNG"
  style={{ width: 190, maxWidth: "58%", height: "auto" }}
/>
      </div>

      {/* step indicator */}
      <div className="flex items-center justify-center gap-2 mb-4 text-xs" style={{ color: C.gray }}>
        {["Start", "Scan with wallet", "Identity verified"].map((s, i) => {
          const idx = ["start", "qr", "done"].indexOf(stage);
          const active = i <= idx;
          return (
            <React.Fragment key={s}>
              <span className="px-2 py-1 rounded font-semibold" style={{ background: active ? C.goldPale : "transparent", color: active ? C.goldDeep : C.gray }}>{i + 1}. {s}</span>
              {i < 2 && <span>—</span>}
            </React.Fragment>
          );
        })}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded px-2 py-1 text-xs font-bold" style={{ background: C.goldPale, color: C.goldDeep, fontFamily: MONO }}>SEVISPASS</div>
            <div className="text-sm font-semibold" style={{ color: C.ink }}>
              {group === "institution" ? "Institution & administrator sign in" : "Student sign in"}
            </div>
          </div>
          <Btn small kind="ghost" onClick={onBack}>← Back</Btn>
        </div>

        {stage === "start" && (
          <div>
            <p className="text-sm mb-4" style={{ color: C.inkSoft }}>
              EduVerify PNG uses your national SevisPass digital identity — you never create a password here.
              You can sign in by <b>scanning a QR code</b> with your SevisPass wallet app, or with <b>biometrics</b> (fingerprint / face ID) if you've registered them.
            </p>
            {err && <p className="text-sm mb-3 p-2 rounded" style={{ background: C.redPale, color: C.red }}>{err}</p>}
            <div className="flex gap-2 flex-wrap">
              <Btn onClick={begin}>Continue with SevisPass</Btn>
              <Btn kind="ghost" disabled title="Not yet implemented in this prototype — see code review">Use biometrics (WebAuthn) — coming soon</Btn>
            </div>
            <p className="text-xs mt-3" style={{ color: C.gray }}>
              Protocol: OIDC4VP (OpenID Connect for Verifiable Presentations). {SEVISPASS_CONFIG.mock ? "Prototype mode — the SevisPass server is simulated." : "Connected to the live SevisPass server via our backend proxy."}
            </p>
            {group === "institution" && (
              <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.line}` }}>
                <p className="text-sm mb-2" style={{ color: C.inkSoft }}><b>New institution?</b> Secondary and high schools, national schools of excellence, TVET and technical colleges, teachers'/nursing/business colleges, and universities must register and be approved by the system administrator to become Authorized Issuers.</p>
                <Btn kind="ghost" onClick={() => setStage("register")}>Register your institution</Btn>
              </div>
            )}
          </div>
        )}

        {stage === "register" && (
          <div>
            <div className="text-sm font-semibold mb-3" style={{ color: C.ink }}>Institution registration</div>
            <Field label="Institution name">
              <input className={inputCls} style={inputStyle} value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} placeholder="e.g. Pacific Institute of Technology" />
            </Field>
            <Field label="Institution type">
              <select className={inputCls} style={inputStyle} value={reg.kind} onChange={(e) => setReg({ ...reg, kind: e.target.value })}>
                {INSTITUTION_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="DHERST accreditation / registration no.">
                <input className={inputCls} style={inputStyle} value={reg.accreditationNo} onChange={(e) => setReg({ ...reg, accreditationNo: e.target.value })} placeholder="e.g. DHERST-034" />
              </Field>
              <Field label="Contact email">
                <input className={inputCls} style={inputStyle} value={reg.contact} onChange={(e) => setReg({ ...reg, contact: e.target.value })} placeholder="registrar@institution.ac.pg" />
              </Field>
            </div>
            <Field label="Registrar / admin user (signs in with SevisPass)">
              <input className={inputCls} style={inputStyle} value={reg.registrar} onChange={(e) => setReg({ ...reg, registrar: e.target.value })} placeholder="e.g. SP-1234" />
            </Field>
            <div className="flex gap-2">
              <Btn kind="gold" disabled={!reg.name.trim()} onClick={submitRegistration}>Submit registration</Btn>
              <Btn kind="ghost" onClick={() => setStage("start")}>Back</Btn>
            </div>
            <p className="text-xs mt-3" style={{ color: C.gray }}>
              Your registration goes to the system administrator's approval queue. Until it is approved, your dashboard shows a pending banner and you cannot verify students or issue records.
            </p>
          </div>
        )}

        {stage === "registered" && newStaff && (
          <div className="flex flex-col items-center text-center py-3">
            <div className="rounded-full flex items-center justify-center mb-3" style={{ width: 56, height: 56, background: C.amberPale, color: C.amber, fontSize: 26, fontWeight: 700 }}>⏳</div>
            <div className="font-bold text-base mb-1" style={{ color: C.ink }}>Registration submitted</div>
            <p className="text-sm mb-1" style={{ color: C.inkSoft }}>{reg.name} is now <b>pending admin approval</b>.</p>
            <div className="text-xs mb-4" style={{ fontFamily: MONO, color: C.gray }}>Registrar account created: {newStaff.name} ({newStaff.id})</div>
            <div className="flex gap-2">
              <Btn kind="gold" onClick={() => onPick(newStaff)}>Sign in as {newStaff.name}</Btn>
              <Btn kind="ghost" onClick={() => { setStage("start"); setReg({ name: "", kind: "University", accreditationNo: "", contact: "", registrar: "" }); }}>Done</Btn>
            </div>
          </div>
        )}

        {stage === "qr" && session && (
          <div className="flex gap-5 flex-wrap items-start">
            {/* SVG QR string injected directly, per the SevisPass guide (innerHTML, never <img src>) */}
            <div className="shrink-0" style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, background: "#fff" }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(session.qrCode, { USE_PROFILES: { svg: true, svgFilters: true } }) }} />
            <div className="flex-1" style={{ minWidth: 220 }}>
              <div className="font-semibold text-sm mb-1" style={{ color: C.ink }}>Scan with your SevisPass wallet</div>
              <p className="text-xs mb-2" style={{ color: C.gray }}>
                Open the SevisPass app on your phone and scan this code. Your wallet verifies the request and presents your credential — no password is ever typed.
              </p>
              <div className="text-xs p-2 rounded mb-3" style={{ background: C.paper, fontFamily: MONO, color: C.inkSoft }}>
                session {session.sessionId} · waiting for wallet{".".repeat((polls % 3) + 1)}<br />
                polled /api/session/status ×{polls}
              </div>
              <div className="text-xs font-semibold mb-2" style={{ color: C.goldDeep, letterSpacing: "0.06em" }}>PROTOTYPE — SIMULATE THE WALLET SCAN</div>
              <div className="grid gap-2">
                {list.map((p) => (
                  <button key={p.id} onClick={() => walletScan(p)} className="text-left rounded px-3 py-2 border flex items-center justify-between hover:opacity-80" style={{ borderColor: C.line, background: "#fff" }}>
                    <div>
                      <div className="font-semibold text-sm" style={{ color: C.ink }}>{p.name}</div>
                      <div className="text-xs" style={{ color: C.gray }}>{p.sub}</div>
                    </div>
                    <div className="text-xs text-right" style={{ fontFamily: MONO, color: C.gray }}>{p.id}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {stage === "done" && who && (
          <div className="flex flex-col items-center text-center py-3">
            <div className="rounded-full flex items-center justify-center mb-3" style={{ width: 56, height: 56, background: C.greenPale, color: C.green, fontSize: 28, fontWeight: 700 }}>✓</div>
            <div className="font-bold text-base mb-1" style={{ color: C.green }}>Identity verified</div>
            <div className="text-sm" style={{ color: C.ink }}>{who.name}</div>
            <div className="text-xs mb-1" style={{ fontFamily: MONO, color: C.gray }}>SevisPass ID: {who.id} · {who.tier}</div>
            <div className="text-xs mb-4" style={{ fontFamily: MONO, color: C.gray }}>session {session.sessionId} · credential presented via OIDC4VP</div>
            <Btn kind="gold" onClick={() => onPick(who)}>Continue to my dashboard</Btn>
          </div>
        )}
      </Card>

      <p className="text-xs px-1" style={{ color: C.gray }}>
        Suggested demo path: <b>Maria Toua</b> shows the first-login experience (request your institution to upload your records). <b>Philemon Kira</b> carries a complete lifelong portfolio — Grade 10 (Passam), Grade 12 (Sogeri NSE), a college diploma (Madang Tech), and a DWU degree — generate his QR code, then exit and open the <b>verification portal</b> (as BPNG's HR officer would) to verify it. Or run the full pipeline: <b>Grace Kila</b> → <b>UPNG Registrar</b> (verify &amp; certify) → <b>David Namah</b> (overseas upload) → <b>System Administrator</b> (approve, plus PAU's pending registration).
      </p>
    </div>
  );
}

/* ============================================================ STUDENT */

export default Login;
