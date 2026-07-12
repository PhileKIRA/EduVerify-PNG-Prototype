import React from "react";
import { C, MONO } from "../theme";
import { LOGO_FULL } from "../../data/assets";
import { Card, Btn } from "./ui";

/* ============================================================ LANDING */
function Landing({ onStudents, onInstitutions, onVerify }) {
  const steps = ["Login via SevisPass", "Profile created", "Institution verifies", "Records stored & hashed", "Generate QR code", "Employer verifies", "Verified result"];
  const fns = [
    { title: "For Students", desc: "Sign in with your SevisPass identity, build your academic profile, and access records verified by your institution. Generate a secure QR code whenever you need to share your credentials for a job, scholarship, or further study — you stay in control of who verifies you.", cta: "Student sign in", act: onStudents },
    { title: "For Institutions", desc: "Schools, colleges, TVET institutions, and universities are the trusted source of academic data. Verify that a student is genuinely yours, then upload their official records — the system seals each record with a SHA-256 hash so any later alteration is instantly detectable.", cta: "Institution sign in", act: onInstitutions },
    { title: "Verify a Credential", desc: "Employers, scholarship providers, and other organisations: scan a candidate's QR code or upload the certificate they gave you. Get an instant, authoritative answer — no account and no phone calls to the university required.", cta: "Open verification portal", act: onVerify },
  ];
  return (
    <div className="pt-8">
      <div className="flex flex-col items-center text-center mb-8">
        <img src={LOGO_FULL} alt="EduVerify PNG — Trusted academic credentials. Instantly verified." style={{ width: 260, maxWidth: "75%", height: "auto" }} />
        <p className="text-sm mt-4 max-w-xl" style={{ color: C.inkSoft }}>
          EduVerify PNG is a national academic credential service built on Papua New Guinea's <b>SevisPass</b> digital identity infrastructure —
          covering the entire education sector, from <b>Grade 10 and Grade 12 certificates</b> issued by secondary and high schools and national
          schools of excellence, through <b>TVET and technical certificates and college diplomas</b>, to <b>university degrees</b> and verified
          overseas qualifications. Institutions — not students — upload official records, each record is cryptographically sealed, and anyone
          the student chooses to share with can verify a qualification in seconds instead of weeks.
        </p>
      </div>

      <Card>
        <div className="text-xs font-semibold mb-3" style={{ color: C.goldDeep, letterSpacing: "0.1em", fontFamily: MONO }}>HOW IT WORKS</div>
        <div className="flex flex-wrap items-center gap-2">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <span className="text-xs font-semibold px-3 py-2 rounded" style={{ background: C.paper, color: C.ink, border: `1px solid ${C.line}` }}>{s}</span>
              {i < steps.length - 1 && <span style={{ color: C.gold, fontWeight: 700 }}>→</span>}
            </React.Fragment>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: C.gray }}>
          Why it can be trusted: your identity comes from SevisPass (one person, one verified identity), your records come only from accredited
          institutions, and every certified record carries a tamper-evident hash. Verification is consent-based — nothing is shared until the
          student generates and hands over a QR code or their certificate.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 mt-2">
        {fns.map((f) => (
          <Card key={f.title} className="flex flex-col">
            <div className="font-bold text-base mb-2" style={{ color: C.ink }}>{f.title}</div>
            <p className="text-sm flex-1 mb-4" style={{ color: C.inkSoft }}>{f.desc}</p>
            <Btn kind={f.title === "Verify a Credential" ? "gold" : "primary"} onClick={f.act}>{f.cta}</Btn>
          </Card>
        ))}
      </div>

      <p className="text-xs px-1 mt-4" style={{ color: C.gray }}>
        When to use EduVerify PNG: students — any time you apply for a job, scholarship, or admission and need to prove your qualifications;
        institutions — whenever a student claims a qualification with you or when issuing records for graduates; verifiers — before accepting any
        academic certificate at face value. Prototype note: SevisPass sign-in is simulated for this demonstration.
      </p>
    </div>
  );
}

export default Landing;
