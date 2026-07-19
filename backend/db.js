/* ============================================================
   DATA TIER — SQLite database (better-sqlite3).

   Single source of truth for the backend: users (SevisPass personas),
   institutions (PNG issuer registry), academic_records, plus the two
   runtime tables the auth flow needs — oidc_sessions (state/nonce/CSRF)
   and verification_tokens.

   The schema is created on first import and seeded idempotently
   (INSERT OR IGNORE), so committing backend/eduverify.db for the demo and
   re-running the server both work. Record integrity hashes use Node's
   crypto.createHash('sha256'). Prepared statements are exported as `queries`.
   ============================================================ */
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "eduverify.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* ------------------------------------------------------------------ schema */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id        TEXT PRIMARY KEY,
  role      TEXT NOT NULL,              -- student | institution | admin
  name      TEXT NOT NULL,
  sub       TEXT,
  tier      TEXT,
  inst_id   TEXT                        -- institution staff only
);

CREATE TABLE IF NOT EXISTS institutions (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  kind              TEXT,
  country           TEXT DEFAULT 'PNG',
  is_png            INTEGER DEFAULT 1,
  accreditation_no  TEXT,
  status            TEXT NOT NULL       -- approved | pending
);

CREATE TABLE IF NOT EXISTS academic_records (
  id                 TEXT PRIMARY KEY,
  student_id         TEXT NOT NULL,
  institution_id     TEXT,
  institution_name   TEXT,
  program            TEXT,
  credential_level   TEXT,
  completion_year    TEXT,
  gpa                TEXT,
  class_award        TEXT,
  graduation_status  TEXT DEFAULT 'Graduated',
  hash               TEXT,
  created_at         TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oidc_sessions (
  id             TEXT PRIMARY KEY,      -- sessionId (uuid)
  state          TEXT NOT NULL,         -- CSRF token (uuid)
  nonce          TEXT NOT NULL,         -- replay guard (uuid)
  authenticated  INTEGER DEFAULT 0,
  user_id        TEXT,
  vp_token       TEXT,                  -- verifiable presentation (live mode)
  created_at     TEXT DEFAULT (datetime('now')),
  expires_at     TEXT NOT NULL          -- ISO-8601
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  id          TEXT PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  record_id   TEXT,
  student_id  TEXT,
  hash        TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  expires_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_records_student ON academic_records(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_state  ON oidc_sessions(state);
`);

/* ---------------------------------------------------------------- hashing */
// Deterministic SHA-256 over the record's identifying fields — the same
// integrity primitive the frontend used, now computed server-side.
function hashRecord(r) {
  const canonical = [
    r.student_id, r.institution_id, r.program, r.credential_level,
    r.completion_year, r.gpa, r.class_award, r.graduation_status,
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/* ------------------------------------------------------------------- seed */
const SEED_USERS = [
  { id: "SP-1001", role: "student",     name: "Grace Kila",               sub: "Student · University of Papua New Guinea",           tier: "Trust Tier 2", inst_id: null },
  { id: "SP-1002", role: "student",     name: "David Namah",              sub: "Student · PNG University of Technology",             tier: "Trust Tier 2", inst_id: null },
  { id: "SP-1003", role: "student",     name: "Philemon Kira",            sub: "Student · Divine Word University (DWU20230045)",     tier: "Trust Tier 2", inst_id: null },
  { id: "SP-1004", role: "student",     name: "Maria Toua",               sub: "Student · first sign-in (no records yet)",           tier: "Trust Tier 2", inst_id: null },
  { id: "SP-2001", role: "institution", name: "UPNG Registrar",           sub: "University of Papua New Guinea",                     tier: "Trust Tier 3", inst_id: "inst-upng" },
  { id: "SP-2002", role: "institution", name: "Unitech Registrar",        sub: "PNG University of Technology",                       tier: "Trust Tier 3", inst_id: "inst-unitech" },
  { id: "SP-2003", role: "institution", name: "DWU Registry Office",      sub: "Divine Word University",                             tier: "Trust Tier 3", inst_id: "inst-dwu" },
  { id: "SP-2004", role: "institution", name: "PAU Registry Office",      sub: "Pacific Adventist University (pending approval)",     tier: "Trust Tier 3", inst_id: "inst-pau" },
  { id: "SP-2005", role: "institution", name: "Sogeri NSE Records Office",sub: "Sogeri National School of Excellence — Grade 12 certificates", tier: "Trust Tier 3", inst_id: "inst-sogeri" },
  { id: "SP-2006", role: "institution", name: "POM Tech Registry",        sub: "Port Moresby Technical College — TVET certificates", tier: "Trust Tier 3", inst_id: "inst-pomtech" },
  { id: "SP-3001", role: "admin",       name: "System Administrator",     sub: "Platform admin · DHERST liaison",                    tier: "Trust Tier 3", inst_id: null },
];

const SEED_INSTITUTIONS = [
  { id: "inst-upng",    name: "University of Papua New Guinea",        kind: "University",                  accreditation_no: "DHERST-001", status: "approved" },
  { id: "inst-unitech", name: "PNG University of Technology",          kind: "University",                  accreditation_no: "DHERST-002", status: "approved" },
  { id: "inst-dwu",     name: "Divine Word University",               kind: "University",                  accreditation_no: "DHERST-014", status: "approved" },
  { id: "inst-pau",     name: "Pacific Adventist University",         kind: "University",                  accreditation_no: "DHERST-021", status: "pending"  },
  { id: "inst-sogeri",  name: "Sogeri National School of Excellence", kind: "National School of Excellence", accreditation_no: "NDOE-113", status: "approved" },
  { id: "inst-passam",  name: "Passam National High School",          kind: "High School",                 accreditation_no: "NDOE-078", status: "approved" },
  { id: "inst-pomtech", name: "Port Moresby Technical College",       kind: "TVET / Technical College",    accreditation_no: "NTC-009",  status: "approved" },
  { id: "inst-mtc",     name: "Madang Technical College",             kind: "TVET / Technical College",    accreditation_no: "NTC-017",  status: "approved" },
];

// Lifelong portfolios: Grace (UPNG BSc), David (Unitech BEng), and Philemon's
// four records spanning secondary → TVET → university.
const SEED_RECORDS = [
  { id: "r-1001-upng", student_id: "SP-1001", institution_id: "inst-upng",    institution_name: "University of Papua New Guinea",        program: "BSc Computer Science",              credential_level: "University Degree",   completion_year: "2023", gpa: "3.4", class_award: "Second Class Honours (Division II)" },
  { id: "r-1002-unitech", student_id: "SP-1002", institution_id: "inst-unitech", institution_name: "PNG University of Technology",        program: "BEng Civil Engineering",            credential_level: "University Degree",   completion_year: "2023", gpa: "3.6", class_award: "Second Class Honours (Division I)" },
  { id: "r-1003-passam", student_id: "SP-1003", institution_id: "inst-passam", institution_name: "Passam National High School",           program: "Grade 12 Certificate",              credential_level: "Grade 12 Certificate", completion_year: "2016", gpa: "B",   class_award: "Upper Pass" },
  { id: "r-1003-sogeri", student_id: "SP-1003", institution_id: "inst-sogeri", institution_name: "Sogeri National School of Excellence",  program: "Grade 12 Certificate",              credential_level: "Grade 12 Certificate", completion_year: "2018", gpa: "A",   class_award: "Distinction" },
  { id: "r-1003-mtc",    student_id: "SP-1003", institution_id: "inst-mtc",    institution_name: "Madang Technical College",             program: "Diploma in Information Technology", credential_level: "College Diploma",     completion_year: "2020", gpa: "3.5", class_award: "Merit" },
  { id: "r-1003-dwu",    student_id: "SP-1003", institution_id: "inst-dwu",    institution_name: "Divine Word University",               program: "Bachelor of Information Systems",   credential_level: "University Degree",   completion_year: "2025", gpa: "3.8", class_award: "Credit" },
];

const insUser = db.prepare(
  "INSERT OR IGNORE INTO users (id, role, name, sub, tier, inst_id) VALUES (@id, @role, @name, @sub, @tier, @inst_id)"
);
const insInst = db.prepare(
  "INSERT OR IGNORE INTO institutions (id, name, kind, country, is_png, accreditation_no, status) VALUES (@id, @name, @kind, 'PNG', 1, @accreditation_no, @status)"
);
const insRecord = db.prepare(
  `INSERT OR IGNORE INTO academic_records
     (id, student_id, institution_id, institution_name, program, credential_level, completion_year, gpa, class_award, graduation_status, hash)
   VALUES
     (@id, @student_id, @institution_id, @institution_name, @program, @credential_level, @completion_year, @gpa, @class_award, 'Graduated', @hash)`
);

const seed = db.transaction(() => {
  for (const u of SEED_USERS) insUser.run(u);
  for (const i of SEED_INSTITUTIONS) insInst.run(i);
  for (const r of SEED_RECORDS) insRecord.run({ ...r, hash: hashRecord(r) });
});
seed();

/* ------------------------------------------------- prepared statements API */
const queries = {
  // users
  getUserById: db.prepare("SELECT id, role, name, sub, tier, inst_id AS instId FROM users WHERE id = ?"),
  listUsersByRole: db.prepare("SELECT id, role, name, sub, tier, inst_id AS instId FROM users WHERE role = ?"),

  // institutions
  getAllInstitutions: db.prepare(
    "SELECT id, name, kind, country, is_png AS isPng, accreditation_no AS accreditationNo, status FROM institutions ORDER BY name"
  ),

  // academic records
  getRecordsByStudent: db.prepare(
    `SELECT id, student_id AS studentId, institution_id AS institutionId, institution_name AS institutionName,
            program, credential_level AS credentialLevel, completion_year AS completionYear,
            gpa, class_award AS classAward, graduation_status AS graduationStatus, hash, created_at AS createdAt
       FROM academic_records WHERE student_id = ? ORDER BY completion_year`
  ),

  // oidc sessions
  createSession: db.prepare(
    "INSERT INTO oidc_sessions (id, state, nonce, authenticated, user_id, expires_at) VALUES (@id, @state, @nonce, 0, NULL, @expires_at)"
  ),
  getSession: db.prepare("SELECT * FROM oidc_sessions WHERE id = ?"),
  getSessionByState: db.prepare("SELECT * FROM oidc_sessions WHERE state = ?"),
  authenticateSession: db.prepare("UPDATE oidc_sessions SET authenticated = 1, user_id = @user_id WHERE id = @id"),
  setSessionVpToken: db.prepare("UPDATE oidc_sessions SET vp_token = @vp_token, authenticated = 1, user_id = @user_id WHERE id = @id"),
  deleteSession: db.prepare("DELETE FROM oidc_sessions WHERE id = ?"),
  deleteExpiredSessions: db.prepare("DELETE FROM oidc_sessions WHERE expires_at < @now"),

  // verification tokens
  createVerificationToken: db.prepare(
    "INSERT INTO verification_tokens (id, token, record_id, student_id, hash, expires_at) VALUES (@id, @token, @record_id, @student_id, @hash, @expires_at)"
  ),
  getVerificationToken: db.prepare("SELECT * FROM verification_tokens WHERE token = ?"),
};

module.exports = { db, queries, hashRecord, DB_PATH };
