import React, { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { MONO, useC } from "../theme";
import { LOGO_FULL } from "../../data/assets";
import { INSTITUTION_KINDS } from "../../data/referenceData";
import { sevisAuth, SEVISPASS_CONFIG } from "../../application/sevisAuth";
import { Card, Btn, Field, inputCls, inputStyle } from "./ui";

/* ============================================================ LOGIN */
function Login({ group, users, onBack, onPick, onRegister }) {
  const C = useC();  const [stage, setStage] = useState("start"); // start -> qr -> done | register -> registered
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

  /* poll GET /api/session/status every 2s while the QR is displayed (per the guide).
     Once the backend reports the wallet has authenticated, fetch the verified
     identity (which also runs the CSRF state check) and advance to "done". */
  useEffect(() => {
    if (stage !== "qr" || !session) return;
    let stopped = false;
    const iv = setInterval(async () => {
      setPolls((p) => p + 1);
      try {
        const s = await sevisAuth.checkStatus(session.sessionId);
        if (s.authenticated) {
          clearInterval(iv);
          if (stopped) return;
          const user = await sevisAuth.getUser(session.sessionId);
          setWho(user);
          setStage("done");
        }
      } catch (e) {
        clearInterval(iv);
        setErr("Sign-in could not be verified. Please try again.");
      }
    }, 2000);
    return () => { stopped = true; clearInterval(iv); };
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

  /* Simulate the wallet scan: tell the backend which persona presented their
     credential, then let the status poller pick it up, fetch the verified user
     (with the CSRF check) and advance to "done". */
  const walletScan = async (p) => {
    setErr(null);
    try {
      await sevisAuth.simulateScan(session.sessionId, p.id, p);
    } catch (e) {
      setErr("Could not complete the wallet scan. Please try again.");
    }
  };

  return (
    <div className="pt-8">
      <div className="flex justify-center mb-5">
        {/* transparent everywhere; on dark, a soft light glow (no box) lifts the
            logo's dark wordmark off the background */}
        <img src={LOGO_FULL} alt="EduVerify PNG" style={{ width: 190, maxWidth: "58%", height: "auto", display: "block", filter: C.logoGlow }} />
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
              <Btn kind="ghost" onClick={begin}>Use biometrics (WebAuthn)</Btn>
            </div>
            <p className="text-xs mt-3" style={{ color: C.gray }}>
              Protocol: OIDC4VP (OpenID Connect for Verifiable Presentations). The backend decides mock vs. live staging (backend/.env).
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
              <input className={inputCls} style={inputStyle(C)} value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} placeholder="e.g. Pacific Institute of Technology" />
            </Field>
            <Field label="Institution type">
              <select className={inputCls} style={inputStyle(C)} value={reg.kind} onChange={(e) => setReg({ ...reg, kind: e.target.value })}>
                {INSTITUTION_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="DHERST accreditation / registration no.">
                <input className={inputCls} style={inputStyle(C)} value={reg.accreditationNo} onChange={(e) => setReg({ ...reg, accreditationNo: e.target.value })} placeholder="e.g. DHERST-034" />
              </Field>
              <Field label="Contact email">
                <input className={inputCls} style={inputStyle(C)} value={reg.contact} onChange={(e) => setReg({ ...reg, contact: e.target.value })} placeholder="registrar@institution.ac.pg" />
              </Field>
            </div>
            <Field label="Registrar / admin user (signs in with SevisPass)">
              <input className={inputCls} style={inputStyle(C)} value={reg.registrar} onChange={(e) => setReg({ ...reg, registrar: e.target.value })} placeholder="e.g. PIT Registry Office" />
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
              {session.mode === "live" ? (
                <div className="text-xs p-3 rounded" style={{ background: C.goldPale, color: C.goldDeep }}>
                  <b>LIVE — SevisPass staging.</b> Open the <b>Staging SevisWallet</b> app on your phone and scan the QR code. Once your wallet presents your credential, this page continues automatically. (Make sure you registered a staging account in the staging wallet app.) Live staging identities sign in to the student portal; institution and administrator dashboards use provisioned accounts.
                </div>
              ) : (
                <>
                  <div className="text-xs font-semibold mb-2" style={{ color: C.goldDeep, letterSpacing: "0.06em" }}>PROTOTYPE — SIMULATE THE WALLET SCAN</div>
                  <div className="grid gap-2">
                    {list.map((p) => (
                      <button key={p.id} onClick={() => walletScan(p)} className="text-left px-3 py-2.5 border flex items-center justify-between hover:opacity-80" style={{ borderColor: C.lineStrong, background: C.surface2, borderRadius: 12 }}>
                        <div>
                          <div className="font-semibold text-sm" style={{ color: C.ink }}>{p.name}</div>
                          <div className="text-xs" style={{ color: C.muted }}>{p.sub}</div>
                        </div>
                        <div className="text-xs text-right" style={{ fontFamily: MONO, color: C.muted }}>{p.id}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
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
        Suggested demo path: <b>Maria Toua</b> shows the first-login experience (request your institution to upload your records). <b>Philemon Kira</b> carries a complete lifelong portfolio — Grade 10 (Passam), Grade 12 (Sogeri NSE), a college diploma (Madang Tech), and a DWU degree — generate his QR code, then exit and open the <b>verification portal</b> (as BPNG's HR officer would) to verify it. Or run the full pipeline: <b>Grace Kila</b> → <b>UPNG Registrar</b> (verify &amp; certify) → <b>David Namah</b> (overseas submission — already pending) → <b>System Administrator</b> (approve, plus PAU's pending registration).
      </p>
    </div>
  );
}

export default Login;
