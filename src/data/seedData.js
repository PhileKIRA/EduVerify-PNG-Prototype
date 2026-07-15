/* ============================================================
   DATA TIER — static seed/reference data.
   In this prototype this is hard-coded; a database-backed build
   would replace these exports with fetch calls to the API tier.
   ============================================================ */

const PERSONAS = [
  { id: "SP-1001", role: "student", name: "Grace Kila", sub: "Student · University of Papua New Guinea", tier: "Trust Tier 2" },
  { id: "SP-1002", role: "student", name: "David Namah", sub: "Student · PNG University of Technology", tier: "Trust Tier 2" },
  { id: "SP-1003", role: "student", name: "Philemon Kira", sub: "Student · Divine Word University (DWU20230045)", tier: "Trust Tier 2" },
  { id: "SP-1004", role: "student", name: "Maria Toua", sub: "Student · first sign-in (no records yet)", tier: "Trust Tier 2" },
  { id: "SP-2001", role: "institution", name: "UPNG Registrar", instId: "inst-upng", sub: "University of Papua New Guinea", tier: "Trust Tier 3" },
  { id: "SP-2002", role: "institution", name: "Unitech Registrar", instId: "inst-unitech", sub: "PNG University of Technology", tier: "Trust Tier 3" },
  { id: "SP-2003", role: "institution", name: "DWU Registry Office", instId: "inst-dwu", sub: "Divine Word University", tier: "Trust Tier 3" },
  { id: "SP-2004", role: "institution", name: "PAU Registry Office", instId: "inst-pau", sub: "Pacific Adventist University (pending approval)", tier: "Trust Tier 3" },
  { id: "SP-2005", role: "institution", name: "Sogeri NSE Records Office", instId: "inst-sogeri", sub: "Sogeri National School of Excellence — Grade 12 certificates", tier: "Trust Tier 3" },
  { id: "SP-2006", role: "institution", name: "POM Tech Registry", instId: "inst-pomtech", sub: "Port Moresby Technical College — TVET certificates", tier: "Trust Tier 3" },
  { id: "SP-3001", role: "admin", name: "System Administrator", sub: "Platform admin · DHERST liaison", tier: "Trust Tier 3" },
];

const CREDENTIAL_LEVELS = ["Grade 10 Certificate", "Grade 12 Certificate", "TVET / Technical Certificate", "College Diploma", "University Degree", "Postgraduate Degree", "Other Certificate"];
const INSTITUTION_KINDS = ["Secondary School", "High School", "National School of Excellence", "TVET / Technical College", "Teachers' College", "Nursing & Health College", "Business College", "University"];

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

export { PERSONAS, CREDENTIAL_LEVELS, INSTITUTION_KINDS, SEED_INSTITUTIONS };
