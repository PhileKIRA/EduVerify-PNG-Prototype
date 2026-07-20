/* ============================================================
   DATA TIER — seed data: demo personas (SevisPass identities) and
   PNG institution registry. In a production system this would be
   replaced by real database tables (users, institutions).
   ============================================================ */

// Demo registrar sign-in password (all seeded registrars share it for the
// prototype). This is the SHA-256 of the peppered password used by
// application/credentials.js — the plaintext is "EduVerify@2026".
const DEMO_REGISTRAR_PASSWORD = "EduVerify@2026";
const DEMO_REGISTRAR_PW_HASH = "47005a6ff385aa264f1711bcdd6e4efa37f80df2a8326ea5f4aff37ab0ad2de0";

const PERSONAS = [
  { id: "SP-1001", role: "student", name: "Grace Kila", sub: "Student · University of Papua New Guinea", tier: "Trust Tier 2" },
  { id: "SP-1002", role: "student", name: "David Namah", sub: "Student · PNG University of Technology", tier: "Trust Tier 2" },
  { id: "SP-1003", role: "student", name: "Philemon Kira", sub: "Student · Divine Word University (DWU20230045)", tier: "Trust Tier 2" },
  { id: "SP-1004", role: "student", name: "Maria Toua", sub: "Student · first sign-in (no records yet)", tier: "Trust Tier 2" },
  { id: "SP-2001", role: "institution", name: "UPNG Registrar", instId: "inst-upng", sub: "University of Papua New Guinea", tier: "Trust Tier 3", username: "upng", passwordHash: DEMO_REGISTRAR_PW_HASH },
  { id: "SP-2002", role: "institution", name: "Unitech Registrar", instId: "inst-unitech", sub: "PNG University of Technology", tier: "Trust Tier 3", username: "unitech", passwordHash: DEMO_REGISTRAR_PW_HASH },
  { id: "SP-2003", role: "institution", name: "DWU Registry Office", instId: "inst-dwu", sub: "Divine Word University", tier: "Trust Tier 3", username: "dwu", passwordHash: DEMO_REGISTRAR_PW_HASH },
  { id: "SP-2004", role: "institution", name: "PAU Registry Office", instId: "inst-pau", sub: "Pacific Adventist University (pending approval)", tier: "Trust Tier 3", username: "pau", passwordHash: DEMO_REGISTRAR_PW_HASH },
  { id: "SP-2005", role: "institution", name: "Sogeri NSE Records Office", instId: "inst-sogeri", sub: "Sogeri National School of Excellence — Grade 12 certificates", tier: "Trust Tier 3", username: "sogeri", passwordHash: DEMO_REGISTRAR_PW_HASH },
  { id: "SP-2006", role: "institution", name: "POM Tech Registry", instId: "inst-pomtech", sub: "Port Moresby Technical College — TVET certificates", tier: "Trust Tier 3", username: "pomtech", passwordHash: DEMO_REGISTRAR_PW_HASH },
  { id: "SP-3001", role: "admin", name: "System Administrator", sub: "Platform admin · DHERST liaison", tier: "Trust Tier 3" },
];

const SEED_INSTITUTIONS = [
  { id: "inst-upng", name: "University of Papua New Guinea", kind: "University", country: "PNG", isPng: true, accreditationNo: "DHERST-001", status: "approved" },
  { id: "inst-unitech", name: "PNG University of Technology", kind: "University", country: "PNG", isPng: true, accreditationNo: "DHERST-002", status: "approved" },
  { id: "inst-dwu", name: "Divine Word University", kind: "University", country: "PNG", isPng: true, accreditationNo: "DHERST-014", status: "approved" },
  { id: "inst-pau", name: "Pacific Adventist University", kind: "University", country: "PNG", isPng: true, accreditationNo: "DHERST-021", status: "pending" },
  { id: "inst-sogeri", name: "Sogeri National School of Excellence", kind: "National School of Excellence", country: "PNG", isPng: true, accreditationNo: "NDOE-113", status: "approved" },
  { id: "inst-passam", name: "Passam National High School", kind: "High School", country: "PNG", isPng: true, accreditationNo: "NDOE-078", status: "approved" },
  { id: "inst-pomtech", name: "Port Moresby Technical College", kind: "TVET / Technical College", country: "PNG", isPng: true, accreditationNo: "NTC-009", status: "approved" },
  { id: "inst-mtc", name: "Madang Technical College", kind: "TVET / Technical College", country: "PNG", isPng: true, accreditationNo: "NTC-017", status: "approved" },
];

/* shared lookup: resolve a SevisPass ID to a display name */
function studentName(id) {
  return (PERSONAS.find((p) => p.id === id) || {}).name || id;
}

export { PERSONAS, SEED_INSTITUTIONS, studentName, DEMO_REGISTRAR_PASSWORD };
