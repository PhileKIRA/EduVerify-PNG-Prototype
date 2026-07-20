import React from "react";
import { useC } from "../theme";
import { Btn } from "./ui";

/* ============================================================ LANDING
   Studio direction: hero-led, airy. Branding lives in the header lockup, so
   the hero leads with a headline (no logo block). "How it works" is a light
   chip row, not a bordered card. Copy is trimmed to one idea per element. */
function Landing({ onStudents, onInstitutions, onVerify }) {
  const C = useC();
  const steps = ["Sign in", "Institution verifies", "Record sealed", "Share QR", "Verified"];
  const roles = [
    { icon: "🎓", tile: C.goldPale, title: "For Students",
      desc: "Sign in with SevisPass, build your profile, and share a secure QR for any job or application — you decide who can verify you.",
      cta: "Student sign in", act: onStudents, kind: "primary" },
    { icon: "🏛️", tile: C.surface2, title: "For Institutions",
      desc: "Confirm a student is yours, then upload their official records. Each is sealed with a SHA-256 hash, so any later change is detectable.",
      cta: "Institution sign in", act: onInstitutions, kind: "primary" },
    { icon: "🔎", tile: C.greenPale, title: "Verify a Credential",
      desc: "Scan a candidate's QR or upload their certificate for an instant, authoritative answer — no account, no phone calls.",
      cta: "Open verification portal", act: onVerify, kind: "gold" },
  ];

  return (
    <div>
      {/* Hero — headline-led, no logo */}
      <div className="flex flex-col items-center text-center" style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(28px, 6.2vw, 46px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.06, color: C.ink, textWrap: "balance", margin: 0 }}>
          Trusted academic credentials, instantly verified.
        </h1>
        <p style={{ fontSize: "clamp(14px, 2.2vw, 16px)", color: C.muted, maxWidth: 600, marginTop: 16, lineHeight: 1.5 }}>
          Papua New Guinea's national credential service, built on SevisPass. Institutions seal each record with a tamper-evident hash — and you choose who can verify it.
        </p>
      </div>

      {/* How it works — light chip row, no card */}
      <div className="flex flex-wrap items-center justify-center gap-2" style={{ maxWidth: 760, margin: "48px auto 0" }}>
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 999, padding: "8px 14px" }}>{s}</span>
            {i < steps.length - 1 && <span style={{ color: C.gold, fontWeight: 800 }}>→</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Role cards — airy 3-up */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, maxWidth: 1000, margin: "52px auto 0" }}>
        {roles.map((r) => (
          <div key={r.title} style={{ display: "flex", flexDirection: "column", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: 26, boxShadow: C.shadow }}>
            <div className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, background: r.tile, fontSize: 19, marginBottom: 16 }}>{r.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 10 }}>{r.title}</div>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.5, flex: 1, marginBottom: 20 }}>{r.desc}</p>
            <div><Btn kind={r.kind} onClick={r.act}>{r.cta}</Btn></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Landing;
