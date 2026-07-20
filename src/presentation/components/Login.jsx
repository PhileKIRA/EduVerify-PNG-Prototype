import React, { useState, useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { MONO, useC } from "../theme";
import { LOGO_FULL } from "../../data/assets";
import { INSTITUTION_KINDS } from "../../data/referenceData";
import { sevisAuth, SEVISPASS_CONFIG, consumeAuthReturn } from "../../application/sevisAuth";
import { hashPassword, verifyPassword, normalizeUsername, isPasswordAcceptable } from "../../application/credentials";
import { DEMO_REGISTRAR_PASSWORD } from "../../data/seedData";
import { Card, Btn, Field, inputCls, inputStyle } from "./ui";

/* ============================================================ LOGIN */
function Login({ group, users, institutions, onBack, onPick, onRegister }) {
  const C = useC();  const [stage, setStage] = useState("start"); // start -> qr -> done | register -> registered
  const [reg, setReg] = useState({ name: "", kind: "University", accreditationNo: "", contact: "", registrar: "", registrarUid: "", username: "", password: "", confirm: "" });
  const [cred, setCred] = useState({ username: "", password: "" }); // registrar username/password sign-in
  const [showPw, setShowPw] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [newStaff, setNewStaff] = useState(null);
  const [session, setSession] = useState(null);
  const [polls, setPolls] = useState(0);
  const [who, setWho] = useState(null);
  const [err, setErr] = useState(null);
  const [starting, setStarting] = useState(false);
  const completionStartedRef = useRef(false);
  const initiationInFlightRef = useRef(false);
  // In the institution group, show only those registrars whose institution has
  // been APPROVED — a pending registrar cannot sign in yet (mirrors the
  // backend's UID-based role resolution). The system administrator does NOT
  // sign in here: admins use the dedicated username/password login reached by
  // clicking the EduVerify logo.
  const approvedInstIds = new Set((institutions || []).filter((i) => i.status === "approved").map((i) => i.id));
  const list = users.filter((p) => {
    if (group !== "institution") return p.role === "student";
    if (p.role === "institution") return !p.instId || approvedInstIds.has(p.instId);
    return false;
  });

  const submitRegistration = async () => {
    const instId = "inst-" + Math.random().toString(36).slice(2, 8);
    const uid = reg.registrarUid.trim();
    const username = normalizeUsername(reg.username);
    const passwordHash = await hashPassword(reg.password);
    const registrarName = reg.registrar.trim() || `${reg.name.trim()} Registrar`;
    const inst = { id: instId, name: reg.name.trim(), kind: reg.kind, country: "PNG", isPng: true, accreditationNo: reg.accreditationNo.trim() || "pending assignment", contact: reg.contact.trim(), status: "pending", registrarUid: uid, registrarName, registrarUsername: username };
    // The registrar signs in with the username and password created here. The
    // password is stored only as a hash. (A SevisPass UID may still be recorded
    // for SevisPass-linked deployments and admin reassignment, but is optional.)
    const staff = { id: uid ? `sevis:${uid}` : `reg:${instId}`, role: "institution", name: registrarName, instId, sub: uid || `reg:${instId}`, tier: "Registrar — username sign-in", username, passwordHash };
    onRegister(inst, staff);
    setNewStaff(staff);
    setStage("registered");
  };

  /* Registrar sign-in with the username/password created at registration.
     Validates the credential, then confirms the institution has been approved
     before entering the dashboard. */
  const credentialLogin = async () => {
    setErr(null);
    const username = normalizeUsername(cred.username);
    const password = cred.password;
    if (!username || !password) { setErr("Enter your registrar username and password."); return; }
    setSigningIn(true);
    try {
      const staff = (users || []).find((u) => u.role === "institution" && normalizeUsername(u.username) === username && u.username);
      const ok = staff ? await verifyPassword(password, staff.passwordHash) : false;
      if (!staff || !ok) { setErr("Incorrect username or password. Check the credentials created when your institution was registered."); return; }
      const inst = (institutions || []).find((i) => i.id === staff.instId);
      if (!inst || inst.status !== "approved") {
        setErr("This institution is still pending administrator approval. You'll be able to sign in once it's approved.");
        return;
      }
      onPick(staff);
    } finally {
      setSigningIn(false);
    }
  };

  const usernameTaken = Boolean(reg.username.trim()) && (users || []).some((u) => u.role === "institution" && normalizeUsername(u.username) === normalizeUsername(reg.username));
  const canSubmitRegistration = Boolean(
    reg.name.trim() &&
    reg.username.trim() &&
    !usernameTaken &&
    isPasswordAcceptable(reg.password) &&
    reg.password === reg.confirm
  );

  /* poll GET /api/session/status every 2s while the QR is displayed (per the guide).
     Once the backend reports the wallet has authenticated, fetch the verified
     identity (which also runs the CSRF state check) and advance to "done". */
  /* If the SSO just redirected the browser back (standard-OIDC flow), resume:
     jump to the polling stage with the completed session, or surface the error. */
  useEffect(() => {
    const ret = consumeAuthReturn();
    if (!ret) return;
    if (ret.error) { setErr(`SevisPass sign-in failed: ${ret.error}`); setStage("start"); return; }
    setSession({ sessionId: ret.sessionId, mode: "live", flow: "resumed" });
    setPolls(0);
    setStage("qr");
  }, []);

  useEffect(() => {
    if (stage !== "qr" || !session?.sessionId) return;

    let stopped = false;
    let timer = null;
    let consecutiveErrors = 0;
    completionStartedRef.current = false;

    const schedule = () => {
      if (!stopped) timer = window.setTimeout(poll, 1500);
    };

    const poll = async () => {
      if (stopped || completionStartedRef.current) return;
      setPolls((p) => p + 1);

      try {
        const status = await sevisAuth.checkStatus(session.sessionId);
        consecutiveErrors = 0;

        if (["expired", "denied", "rejected", "failed", "cancelled", "canceled"].includes(String(status.status).toLowerCase())) {
          throw new Error(`SevisPass login ${status.status}. Start a new login.`);
        }

        if (!status.authenticated) {
          schedule();
          return;
        }

        completionStartedRef.current = true;
        setErr(null);

        // Fetching /api/user consumes the one-time login transaction and sets
        // the application-session cookie. Then verify that cookie before
        // navigating away from the QR screen.
        const user = await sevisAuth.getUser(session.sessionId);
        await sevisAuth.getCurrentSession();
        if (stopped) return;

        setWho(user);
        setStage("done");
        onPick(user);
      } catch (e) {
        completionStartedRef.current = false;
        consecutiveErrors += 1;
        const terminal = /expired|denied|rejected|failed|cancelled|state mismatch|consumed/i.test(e?.message || "");
        if (terminal || consecutiveErrors >= 8) {
          setErr(e?.message || "Sign-in could not be verified. Please start a new login.");
          setStage("start");
          return;
        }
        // A temporary status/API failure must not permanently stop polling.
        // This is important on slow or intermittent staging connections.
        setErr("Wallet approved? Still waiting for SevisPass confirmation…");
        schedule();
      }
    };

    poll(); // do not wait two seconds before the first status check
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [stage, session?.sessionId, onPick]);

  const begin = async () => {
    if (initiationInFlightRef.current) return;
    initiationInFlightRef.current = true;
    setStarting(true);
    setErr(null);
    completionStartedRef.current = false;
    try {
      const s = await sevisAuth.initiateAuth();
      setSession(s);
      setPolls(0);
      setStage("qr");
    } catch (e) {
      const detail = e?.code === "SSO_ORIGIN_NOT_ALLOWED"
        ? "This application's origin is not registered with SevisPass. Ask the SSO administrator to update the client allowlist."
        : (e?.message || "Could not reach the SevisPass server. Please try again.");
      setErr(detail);
    } finally {
      initiationInFlightRef.current = false;
      setStarting(false);
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
            <div className="rounded px-2 py-1 text-xs font-bold" style={{ background: C.goldPale, color: C.goldDeep, fontFamily: MONO }}>{group === "institution" ? "REGISTRAR" : "SEVISPASS"}</div>
            <div className="text-sm font-semibold" style={{ color: C.ink }}>
              {group === "institution" ? "Institution sign in" : "Student sign in"}
            </div>
          </div>
          <Btn small kind="ghost" onClick={onBack}>← Back</Btn>
        </div>

        {stage === "start" && group === "institution" && (
          <div>
            <p className="text-sm mb-4" style={{ color: C.inkSoft }}>
              Registrars sign in with the <b>username and password</b> created when the institution was registered. SevisPass and biometric sign-in are reserved for students and are unavailable here.
            </p>
            {err && <p className="text-sm mb-3 p-2 rounded" style={{ background: C.redPale, color: C.red }}>{err}</p>}

            <Field label="Registrar username">
              <input
                className={inputCls}
                style={inputStyle(C)}
                value={cred.username}
                autoComplete="username"
                onChange={(e) => setCred({ ...cred, username: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter" && cred.username.trim() && cred.password) credentialLogin(); }}
                placeholder="e.g. upng"
              />
            </Field>
            <Field label="Password">
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  style={inputStyle(C)}
                  type={showPw ? "text" : "password"}
                  value={cred.password}
                  autoComplete="current-password"
                  onChange={(e) => setCred({ ...cred, password: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter" && cred.username.trim() && cred.password) credentialLogin(); }}
                  placeholder="••••••••••••"
                />
                <Btn small kind="ghost" onClick={() => setShowPw((s) => !s)}>{showPw ? "Hide" : "Show"}</Btn>
              </div>
            </Field>

            <div className="flex gap-2 flex-wrap mt-1">
              <Btn kind="gold" disabled={signingIn || !cred.username.trim() || !cred.password} onClick={credentialLogin}>
                {signingIn ? "Signing in…" : "Sign in"}
              </Btn>
            </div>

            {/* SevisPass / biometric sign-in disabled for institutions */}
            <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.line}` }}>
              <div className="text-xs mb-2" style={{ color: C.gray }}>Other methods (unavailable for institutions)</div>
              <div className="flex gap-2 flex-wrap">
                <Btn disabled>Continue with SevisPass</Btn>
                <Btn kind="ghost" disabled>Use biometrics (WebAuthn)</Btn>
              </div>
            </div>

            <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.line}` }}>
              <p className="text-sm mb-2" style={{ color: C.inkSoft }}><b>New institution?</b> Secondary and high schools, national schools of excellence, TVET and technical colleges, teachers'/nursing/business colleges, and universities must register and be approved by the system administrator to become Authorized Issuers. You'll create your registrar username and password during registration.</p>
              <Btn kind="ghost" onClick={() => { setErr(null); setStage("register"); }}>Register your institution</Btn>
            </div>
          </div>
        )}

        {stage === "start" && group !== "institution" && (
          <div>
            <p className="text-sm mb-4" style={{ color: C.inkSoft }}>
              EduVerify PNG uses your national SevisPass digital identity — you never create a password here.
              You can sign in by <b>scanning a QR code</b> with your SevisPass wallet app, or with <b>biometrics</b> (fingerprint / face ID) if you've registered them.
            </p>
            {err && <p className="text-sm mb-3 p-2 rounded" style={{ background: C.redPale, color: C.red }}>{err}</p>}
            <div className="flex gap-2 flex-wrap">
              <Btn onClick={begin} disabled={starting}>{starting ? "Starting SevisPass…" : "Continue with SevisPass"}</Btn>
              <Btn kind="ghost" onClick={begin} disabled={starting}>Use biometrics (WebAuthn)</Btn>
            </div>
            <p className="text-xs mt-3" style={{ color: C.gray }}>
              Protocol: OIDC4VP (OpenID Connect for Verifiable Presentations). The backend decides mock vs. live staging (backend/.env).
            </p>
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
            <Field label="Registrar name (the person or office)">
              <input className={inputCls} style={inputStyle(C)} value={reg.registrar} onChange={(e) => setReg({ ...reg, registrar: e.target.value })} placeholder="e.g. PIT Registry Office" />
            </Field>

            <div className="mt-1 mb-1 text-xs font-semibold" style={{ color: C.goldDeep, letterSpacing: "0.06em" }}>CREATE REGISTRAR SIGN-IN</div>
            <Field label="Registrar username">
              <input className={inputCls} style={inputStyle(C)} value={reg.username} autoComplete="off" onChange={(e) => setReg({ ...reg, username: e.target.value })} placeholder="e.g. pit-registry" />
              <p className="text-xs mt-1" style={{ color: C.muted }}>Used to sign in. Not case-sensitive; must be unique.</p>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Password">
                <input className={inputCls} style={inputStyle(C)} type="password" value={reg.password} autoComplete="new-password" onChange={(e) => setReg({ ...reg, password: e.target.value })} placeholder="at least 6 characters" />
              </Field>
              <Field label="Confirm password">
                <input className={inputCls} style={inputStyle(C)} type="password" value={reg.confirm} autoComplete="new-password" onChange={(e) => setReg({ ...reg, confirm: e.target.value })} placeholder="re-enter password" />
              </Field>
            </div>
            {reg.username.trim() && (users || []).some((u) => u.role === "institution" && normalizeUsername(u.username) === normalizeUsername(reg.username)) && (
              <p className="text-xs mb-2" style={{ color: C.red }}>That username is already taken — choose another.</p>
            )}
            {reg.password && !isPasswordAcceptable(reg.password) && (
              <p className="text-xs mb-2" style={{ color: C.amber }}>Password must be at least 6 characters.</p>
            )}
            {reg.confirm && reg.password !== reg.confirm && (
              <p className="text-xs mb-2" style={{ color: C.red }}>Passwords do not match.</p>
            )}

            <Field label="Registrar's SevisPass UID (optional)">
              <input className={inputCls} style={inputStyle(C)} value={reg.registrarUid} onChange={(e) => setReg({ ...reg, registrarUid: e.target.value })} placeholder="only for SevisPass-linked deployments" />
              <p className="text-xs mt-1" style={{ color: C.muted }}>Optional. Registrars sign in with the username and password above; a SevisPass UID is only needed for SevisPass-linked deployments.</p>
            </Field>
            <div className="flex gap-2">
              <Btn kind="gold" disabled={!canSubmitRegistration} onClick={submitRegistration}>Submit registration</Btn>
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
            <div className="text-xs mb-1" style={{ fontFamily: MONO, color: C.gray }}>Registrar account created: {newStaff.name}</div>
            <div className="text-xs mb-4 px-3 py-2 rounded" style={{ fontFamily: MONO, background: C.paper, color: C.inkSoft }}>
              Sign-in username: <b>{newStaff.username}</b><br />
              Use the password you just set to sign in.
            </div>
            <p className="text-xs mb-4" style={{ color: C.muted, maxWidth: 360 }}>
              Once the administrator approves your institution, sign in with this username and password. Until then, sign-in is blocked.
            </p>
            <div className="flex gap-2">
              <Btn kind="gold" onClick={() => { setCred({ username: newStaff.username || "", password: "" }); setErr(null); setStage("start"); }}>Go to sign in</Btn>
              <Btn kind="ghost" onClick={() => { setStage("start"); setCred({ username: "", password: "" }); setReg({ name: "", kind: "University", accreditationNo: "", contact: "", registrar: "", registrarUid: "", username: "", password: "", confirm: "" }); }}>Done</Btn>
            </div>
          </div>
        )}

        {stage === "qr" && session && (
          <div className="flex gap-5 flex-wrap items-start">
            {/* SVG QR string injected directly, per the SevisPass guide (innerHTML, never <img src>) */}
            {session.qrCode ? (
              <div className="shrink-0" style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, background: "#fff" }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(session.qrCode, { USE_PROFILES: { svg: true, svgFilters: true } }) }} />
            ) : (
              <div className="shrink-0 flex items-center justify-center" style={{ border: `1px solid ${C.line}`, borderRadius: 8, width: 236, height: 236, background: C.surface2, color: C.muted, fontSize: 13 }}>Verifying…</div>
            )}
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
                <div className="grid gap-2">
                  {session.flow === "redirect" && (
                    <>
                      <Btn kind="gold" onClick={() => window.location.assign(session.authorizeUrl)}>Continue to the official SevisPass sign-in →</Btn>
                      <p className="text-xs" style={{ color: C.muted }}>
                        You'll be taken to the SevisPass staging page to sign in with your <b>Staging SevisWallet</b>, then returned here automatically. Or scan the QR with your phone to open the same page there.
                      </p>
                    </>
                  )}
                  {session.flow === "resumed" && (
                    <p className="text-xs p-3 rounded" style={{ background: C.goldPale, color: C.goldDeep }}>Completing your SevisPass sign-in…</p>
                  )}
                  <div className="text-xs p-3 rounded" style={{ background: C.goldPale, color: C.goldDeep }}>
                    <b>LIVE — SevisPass staging.</b> {session.flow === "redirect" ? "Sign in on the official SevisPass page — no password is ever typed into EduVerify." : "Open the Staging SevisWallet app on your phone and scan the QR code. Once your wallet presents your credential, this page continues automatically."} Live staging identities sign in to the student portal; institution and administrator dashboards use provisioned accounts.
                  </div>
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
        Suggested demo path: <b>Maria Toua</b> shows the first-login experience (request your institution to upload your records). <b>Philemon Kira</b> carries a complete lifelong portfolio — Grade 10 (Passam), Grade 12 (Sogeri NSE), a college diploma (Madang Tech), and a DWU degree — generate his QR code, then exit and open the <b>verification portal</b> (as BPNG's HR officer would) to verify it. Or run the full pipeline: <b>Grace Kila</b> → <b>UPNG Registrar</b> (verify &amp; certify) → <b>David Namah</b> (overseas submission — already pending) → <b>System Administrator</b> (approve, plus PAU's pending registration — click the EduVerify logo in the header to open the admin login).
      </p>
      {group === "institution" && (
        <p className="text-xs px-1 mt-2" style={{ color: C.gray }}>
          Demo registrar logins (username · password <b>{DEMO_REGISTRAR_PASSWORD}</b>): <span style={{ fontFamily: MONO }}>upng</span>, <span style={{ fontFamily: MONO }}>unitech</span>, <span style={{ fontFamily: MONO }}>dwu</span>, <span style={{ fontFamily: MONO }}>sogeri</span>, <span style={{ fontFamily: MONO }}>pomtech</span> (approved) and <span style={{ fontFamily: MONO }}>pau</span> (still pending approval).
        </p>
      )}
    </div>
  );
}

export default Login;
