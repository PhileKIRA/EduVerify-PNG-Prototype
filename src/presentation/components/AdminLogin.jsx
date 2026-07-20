import React, { useState } from "react";
import { MONO, useC } from "../theme";
import { LOGO_FULL } from "../../data/assets";
import { Card, Btn, Field, inputCls, inputStyle } from "./ui";

/* ============================================================ ADMIN LOGIN
   The system administrator signs in to the backend with a username and
   password — administrators do NOT verify through SevisPass. This page is
   deliberately unlisted: it is reached only by clicking the EduVerify logo
   in the header.

   Default credentials (prototype):
     username: admin
     password: EduVerify@2026

   In production these would be replaced by a server-side credential check
   (hashed password + MFA); for the Phase 1 prototype they are validated
   locally against the constants below.
   ============================================================ */
const ADMIN_CREDENTIALS = {
  username: "admin",
  password: "EduVerify@2026",
};

function AdminLogin({ users, onBack, onPick }) {
  const C = useC();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState(null);
  const [checking, setChecking] = useState(false);

  const submit = () => {
    setErr(null);
    setChecking(true);
    // Small delay so the button state reads as a real credential check.
    window.setTimeout(() => {
      setChecking(false);
      if (username.trim() === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        const admin =
          (users || []).find((p) => p.role === "admin") ||
          { id: "SP-3001", role: "admin", name: "System Administrator", sub: "Platform admin · DHERST liaison", tier: "Trust Tier 3" };
        onPick(admin);
      } else {
        setErr("Incorrect username or password. Check your credentials and try again.");
      }
    }, 350);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && username.trim() && password) submit();
  };

  return (
    <div className="pt-8" style={{ maxWidth: 460, margin: "0 auto" }}>
      <div className="flex justify-center mb-5">
        <img src={LOGO_FULL} alt="EduVerify PNG" style={{ width: 190, maxWidth: "58%", height: "auto", display: "block", filter: C.logoGlow }} />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded px-2 py-1 text-xs font-bold" style={{ background: C.goldPale, color: C.goldDeep, fontFamily: MONO }}>ADMIN</div>
            <div className="text-sm font-semibold" style={{ color: C.ink }}>Administrator sign in</div>
          </div>
          <Btn small kind="ghost" onClick={onBack}>← Back</Btn>
        </div>

        <p className="text-sm mb-4" style={{ color: C.inkSoft }}>
          Backend access for the system administrator. Administrators sign in with a <b>username and password</b> — no SevisPass verification is required for this account.
        </p>

        {err && <p className="text-sm mb-3 p-2 rounded" style={{ background: C.redPale, color: C.red }}>{err}</p>}

        <Field label="Username">
          <input
            className={inputCls}
            style={inputStyle(C)}
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="admin"
          />
        </Field>
        <Field label="Password">
          <div className="flex gap-2">
            <input
              className={inputCls}
              style={inputStyle(C)}
              type={showPw ? "text" : "password"}
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="••••••••••••"
            />
            <Btn small kind="ghost" onClick={() => setShowPw((s) => !s)}>{showPw ? "Hide" : "Show"}</Btn>
          </div>
        </Field>

        <div className="flex gap-2 mt-1">
          <Btn kind="gold" disabled={!username.trim() || !password || checking} onClick={submit}>
            {checking ? "Checking…" : "Sign in to backend"}
          </Btn>
        </div>

        <div className="text-xs mt-4 p-2 rounded" style={{ background: C.paper, fontFamily: MONO, color: C.gray }}>
          Prototype default — username: admin · password: EduVerify@2026
        </div>
      </Card>

      <p className="text-xs px-1" style={{ color: C.gray }}>
        This page is not linked from the public landing page. It opens only when the EduVerify logo in the header is clicked, keeping administrator access out of the student and institution sign-in flows.
      </p>
    </div>
  );
}

export default AdminLogin;
