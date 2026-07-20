const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_DB_PATH = path.join(__dirname, "..", "eduverify.db");

const SEED_USERS = [
  { id: "SP-1001", role: "student", name: "Grace Kila", sub: "Student · University of Papua New Guinea", tier: "Trust Tier 2", instId: null, email: null },
  { id: "SP-1002", role: "student", name: "David Namah", sub: "Student · PNG University of Technology", tier: "Trust Tier 2", instId: null, email: null },
  { id: "SP-1003", role: "student", name: "Philemon Kira", sub: "Student · Divine Word University (DWU20230045)", tier: "Trust Tier 2", instId: null, email: null },
  { id: "SP-1004", role: "student", name: "Maria Toua", sub: "Student · first sign-in (no records yet)", tier: "Trust Tier 2", instId: null, email: null },
  { id: "SP-2001", role: "institution", name: "UPNG Registrar", sub: "University of Papua New Guinea", tier: "Trust Tier 3", instId: "inst-upng", email: null },
  { id: "SP-2002", role: "institution", name: "Unitech Registrar", sub: "PNG University of Technology", tier: "Trust Tier 3", instId: "inst-unitech", email: null },
  { id: "SP-2003", role: "institution", name: "DWU Registry Office", sub: "Divine Word University", tier: "Trust Tier 3", instId: "inst-dwu", email: null },
  { id: "SP-2004", role: "institution", name: "PAU Registry Office", sub: "Pacific Adventist University (pending approval)", tier: "Trust Tier 3", instId: "inst-pau", email: null },
  { id: "SP-2005", role: "institution", name: "Sogeri NSE Records Office", sub: "Sogeri National School of Excellence — Grade 12 certificates", tier: "Trust Tier 3", instId: "inst-sogeri", email: null },
  { id: "SP-2006", role: "institution", name: "POM Tech Registry", sub: "Port Moresby Technical College — TVET certificates", tier: "Trust Tier 3", instId: "inst-pomtech", email: null },
  { id: "SP-3001", role: "admin", name: "System Administrator", sub: "Platform admin · DHERST liaison", tier: "Trust Tier 3", instId: null, email: null },
];

const SEED_INSTITUTIONS = [
  { id: "inst-upng", name: "University of Papua New Guinea", kind: "University", accreditationNo: "DHERST-001", status: "approved" },
  { id: "inst-unitech", name: "PNG University of Technology", kind: "University", accreditationNo: "DHERST-002", status: "approved" },
  { id: "inst-dwu", name: "Divine Word University", kind: "University", accreditationNo: "DHERST-014", status: "approved" },
  { id: "inst-pau", name: "Pacific Adventist University", kind: "University", accreditationNo: "DHERST-021", status: "pending" },
  { id: "inst-sogeri", name: "Sogeri National School of Excellence", kind: "National School of Excellence", accreditationNo: "NDOE-113", status: "approved" },
  { id: "inst-passam", name: "Passam National High School", kind: "High School", accreditationNo: "NDOE-078", status: "approved" },
  { id: "inst-pomtech", name: "Port Moresby Technical College", kind: "TVET / Technical College", accreditationNo: "NTC-009", status: "approved" },
  { id: "inst-mtc", name: "Madang Technical College", kind: "TVET / Technical College", accreditationNo: "NTC-017", status: "approved" },
];

const SEED_RECORDS = [
  { id: "r-1001-upng", studentId: "SP-1001", institutionId: "inst-upng", institutionName: "University of Papua New Guinea", program: "BSc Computer Science", credentialLevel: "University Degree", completionYear: "2023", gpa: "3.4", classAward: "Second Class Honours (Division II)" },
  { id: "r-1002-unitech", studentId: "SP-1002", institutionId: "inst-unitech", institutionName: "PNG University of Technology", program: "BEng Civil Engineering", credentialLevel: "University Degree", completionYear: "2023", gpa: "3.6", classAward: "Second Class Honours (Division I)" },
  { id: "r-1003-passam", studentId: "SP-1003", institutionId: "inst-passam", institutionName: "Passam National High School", program: "Grade 12 Certificate", credentialLevel: "Grade 12 Certificate", completionYear: "2016", gpa: "B", classAward: "Upper Pass" },
  { id: "r-1003-sogeri", studentId: "SP-1003", institutionId: "inst-sogeri", institutionName: "Sogeri National School of Excellence", program: "Grade 12 Certificate", credentialLevel: "Grade 12 Certificate", completionYear: "2018", gpa: "A", classAward: "Distinction" },
  { id: "r-1003-mtc", studentId: "SP-1003", institutionId: "inst-mtc", institutionName: "Madang Technical College", program: "Diploma in Information Technology", credentialLevel: "College Diploma", completionYear: "2020", gpa: "3.5", classAward: "Merit" },
  { id: "r-1003-dwu", studentId: "SP-1003", institutionId: "inst-dwu", institutionName: "Divine Word University", program: "Bachelor of Information Systems", credentialLevel: "University Degree", completionYear: "2025", gpa: "3.8", classAward: "Credit" },
];

function hashRecord(record) {
  const canonical = [
    record.studentId,
    record.institutionId,
    record.program,
    record.credentialLevel,
    record.completionYear,
    record.gpa,
    record.classAward,
    record.graduationStatus || "Graduated",
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function plain(row) {
  return row ? { ...row } : row;
}

function createDatabase({ dbPath = DEFAULT_DB_PATH, seed = true } = {}) {
  const resolvedDbPath = dbPath === ":memory:" || path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(__dirname, "..", dbPath);
  const sqlite = new DatabaseSync(resolvedDbPath);
  sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      sub TEXT,
      email TEXT,
      tier TEXT,
      inst_id TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS institutions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT,
      country TEXT DEFAULT 'PNG',
      is_png INTEGER DEFAULT 1,
      accreditation_no TEXT,
      status TEXT NOT NULL,
      registrar_uid TEXT,
      registrar_name TEXT,
      contact TEXT
    );

    CREATE TABLE IF NOT EXISTS academic_records (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      institution_id TEXT,
      institution_name TEXT,
      program TEXT,
      credential_level TEXT,
      completion_year TEXT,
      gpa TEXT,
      class_award TEXT,
      graduation_status TEXT DEFAULT 'Graduated',
      hash TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auth_transactions (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL UNIQUE,
      nonce TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      user_id TEXT,
      claims_json TEXT,
      app_session_id TEXT,
      upstream_session_id TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      completed_at TEXT,
      consumed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS app_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      claims_json TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS verification_tokens (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      record_id TEXT,
      student_id TEXT,
      hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_records_student ON academic_records(student_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_state ON auth_transactions(state);
    CREATE INDEX IF NOT EXISTS idx_auth_expiry ON auth_transactions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_app_session_expiry ON app_sessions(expires_at);
  `);

  // Existing development databases may predate upstream-session polling.
  // Add the column in place so users do not need to delete eduverify.db.
  const authColumns = sqlite.prepare("PRAGMA table_info(auth_transactions)").all();
  if (!authColumns.some((column) => column.name === "upstream_session_id")) {
    sqlite.exec("ALTER TABLE auth_transactions ADD COLUMN upstream_session_id TEXT");
  }
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_upstream_session ON auth_transactions(upstream_session_id) WHERE upstream_session_id IS NOT NULL");

  // Institutions may predate registrar-UID binding. Add the columns in place so
  // existing eduverify.db files keep working without a manual delete.
  const instColumns = sqlite.prepare("PRAGMA table_info(institutions)").all();
  for (const col of ["registrar_uid", "registrar_name", "contact"]) {
    if (!instColumns.some((c) => c.name === col)) {
      sqlite.exec(`ALTER TABLE institutions ADD COLUMN ${col} TEXT`);
    }
  }

  const statements = {
    insertUser: sqlite.prepare(`
      INSERT OR IGNORE INTO users (id, role, name, sub, email, tier, inst_id)
      VALUES ($id, $role, $name, $sub, $email, $tier, $instId)
    `),
    upsertExternalUser: sqlite.prepare(`
      INSERT INTO users (id, role, name, sub, email, tier, inst_id, updated_at)
      VALUES ($id, 'student', $name, $sub, $email, $tier, NULL, $updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        sub = excluded.sub,
        email = excluded.email,
        updated_at = excluded.updated_at
    `),
    insertInstitution: sqlite.prepare(`
      INSERT OR IGNORE INTO institutions (id, name, kind, country, is_png, accreditation_no, status)
      VALUES ($id, $name, $kind, 'PNG', 1, $accreditationNo, $status)
    `),
    insertRecord: sqlite.prepare(`
      INSERT OR IGNORE INTO academic_records
        (id, student_id, institution_id, institution_name, program, credential_level, completion_year, gpa, class_award, graduation_status, hash)
      VALUES
        ($id, $studentId, $institutionId, $institutionName, $program, $credentialLevel, $completionYear, $gpa, $classAward, 'Graduated', $hash)
    `),
    getUser: sqlite.prepare("SELECT id, role, name, sub, email, tier, inst_id AS instId FROM users WHERE id = ?"),
    getUserBySub: sqlite.prepare("SELECT id, role, name, sub, email, tier, inst_id AS instId FROM users WHERE sub = ?"),
    listInstitutions: sqlite.prepare("SELECT id, name, kind, country, is_png AS isPng, accreditation_no AS accreditationNo, status, registrar_uid AS registrarUid, registrar_name AS registrarName, contact FROM institutions ORDER BY name"),
    getInstitutionById: sqlite.prepare("SELECT id, name, kind, country, is_png AS isPng, accreditation_no AS accreditationNo, status, registrar_uid AS registrarUid, registrar_name AS registrarName, contact FROM institutions WHERE id = ?"),
    getInstitutionByRegistrarUid: sqlite.prepare("SELECT id, name, kind, status, registrar_uid AS registrarUid, registrar_name AS registrarName FROM institutions WHERE registrar_uid = ?"),
    registerInstitution: sqlite.prepare(`
      INSERT INTO institutions (id, name, kind, country, is_png, accreditation_no, status, registrar_uid, registrar_name, contact)
      VALUES ($id, $name, $kind, 'PNG', 1, $accreditationNo, 'pending', $registrarUid, $registrarName, $contact)
    `),
    setInstitutionStatus: sqlite.prepare("UPDATE institutions SET status = $status WHERE id = $id"),
    setInstitutionRegistrar: sqlite.prepare("UPDATE institutions SET registrar_uid = $registrarUid, registrar_name = $registrarName WHERE id = $id"),
    demoteRegistrarsForInstitution: sqlite.prepare("UPDATE users SET role = 'student', inst_id = NULL, updated_at = $updatedAt WHERE role = 'institution' AND inst_id = $instId"),
    assignRole: sqlite.prepare(`
      INSERT INTO users (id, role, name, sub, email, tier, inst_id, updated_at)
      VALUES ($id, $role, $name, $sub, $email, $tier, $instId, $updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        role = excluded.role, inst_id = excluded.inst_id,
        name = excluded.name, tier = excluded.tier, updated_at = excluded.updated_at
    `),
    listRecords: sqlite.prepare(`
      SELECT id, student_id AS studentId, institution_id AS institutionId, institution_name AS institutionName,
             program, credential_level AS credentialLevel, completion_year AS completionYear,
             gpa, class_award AS classAward, graduation_status AS graduationStatus, hash, created_at AS createdAt
      FROM academic_records WHERE student_id = ? ORDER BY completion_year
    `),
    createAuth: sqlite.prepare(`
      INSERT INTO auth_transactions (id, state, nonce, status, created_at, expires_at)
      VALUES ($id, $state, $nonce, 'pending', $createdAt, $expiresAt)
    `),
    getAuthById: sqlite.prepare("SELECT * FROM auth_transactions WHERE id = ?"),
    getAuthByState: sqlite.prepare("SELECT * FROM auth_transactions WHERE state = ?"),
    setUpstreamSession: sqlite.prepare(`
      UPDATE auth_transactions SET upstream_session_id = $upstreamSessionId
      WHERE id = $id AND status = 'pending'
    `),
    expireAuth: sqlite.prepare("UPDATE auth_transactions SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?"),
    completeAuth: sqlite.prepare(`
      UPDATE auth_transactions
      SET status = 'authenticated', user_id = $userId, claims_json = $claimsJson,
          app_session_id = $appSessionId, completed_at = $completedAt
      WHERE id = $id AND status = 'pending'
    `),
    consumeAuth: sqlite.prepare(`
      UPDATE auth_transactions SET status = 'consumed', consumed_at = $consumedAt
      WHERE id = $id AND status = 'authenticated'
    `),
    createAppSession: sqlite.prepare(`
      INSERT INTO app_sessions (id, user_id, claims_json, created_at, expires_at)
      VALUES ($id, $userId, $claimsJson, $createdAt, $expiresAt)
    `),
    getAppSession: sqlite.prepare("SELECT * FROM app_sessions WHERE id = ?"),
    revokeAppSession: sqlite.prepare("UPDATE app_sessions SET revoked_at = $revokedAt WHERE id = $id AND revoked_at IS NULL"),
    purgeExpiredAuth: sqlite.prepare("DELETE FROM auth_transactions WHERE expires_at < ? AND status IN ('pending','expired','consumed')"),
    purgeExpiredAppSessions: sqlite.prepare("DELETE FROM app_sessions WHERE expires_at < ? OR revoked_at IS NOT NULL"),
  };

  if (seed) {
    sqlite.exec("BEGIN");
    try {
      for (const user of SEED_USERS) statements.insertUser.run({
        $id: user.id, $role: user.role, $name: user.name, $sub: user.sub,
        $email: user.email, $tier: user.tier, $instId: user.instId,
      });
      for (const institution of SEED_INSTITUTIONS) statements.insertInstitution.run({
        $id: institution.id, $name: institution.name, $kind: institution.kind,
        $accreditationNo: institution.accreditationNo, $status: institution.status,
      });
      for (const record of SEED_RECORDS) statements.insertRecord.run({
        $id: record.id, $studentId: record.studentId, $institutionId: record.institutionId,
        $institutionName: record.institutionName, $program: record.program,
        $credentialLevel: record.credentialLevel, $completionYear: record.completionYear,
        $gpa: record.gpa, $classAward: record.classAward, $hash: hashRecord(record),
      });
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  const repository = {
    dbPath: resolvedDbPath,
    getUserById(id) { return plain(statements.getUser.get(id)); },
    getUserBySub(sub) { return sub ? plain(statements.getUserBySub.get(sub)) : null; },
    listInstitutions() { return statements.listInstitutions.all().map(plain); },
    getInstitutionById(id) { return id ? plain(statements.getInstitutionById.get(id)) : null; },
    getInstitutionByRegistrarUid(uid) { return uid ? plain(statements.getInstitutionByRegistrarUid.get(uid)) : null; },
    registerInstitution(inst) {
      statements.registerInstitution.run({
        $id: inst.id, $name: inst.name, $kind: inst.kind || null,
        $accreditationNo: inst.accreditationNo || null,
        $registrarUid: inst.registrarUid, $registrarName: inst.registrarName || null,
        $contact: inst.contact || null,
      });
      return this.getInstitutionById(inst.id);
    },
    setInstitutionStatus(id, status) {
      statements.setInstitutionStatus.run({ $id: id, $status: status });
      return this.getInstitutionById(id);
    },
    /* Reassign the registrar responsible for an institution: demote any current
       registrar of this institution back to student, rebind the institution to
       the new SevisPass UID, and provision the new registrar account so that
       person's next login resolves to this institution's portal. */
    reassignRegistrar(id, { uid, name, tier, updatedAt } = {}) {
      const at = updatedAt || new Date().toISOString();
      statements.demoteRegistrarsForInstitution.run({ $instId: id, $updatedAt: at });
      statements.setInstitutionRegistrar.run({ $id: id, $registrarUid: uid, $registrarName: name || null });
      statements.assignRole.run({
        $id: `sevis:${uid}`, $role: "institution", $name: name || "SevisPass User",
        $sub: uid, $email: null, $tier: tier || "SevisPass — verified registrar",
        $instId: id, $updatedAt: at,
      });
      return this.getInstitutionById(id);
    },
    assignRole(rec) {
      statements.assignRole.run({
        $id: rec.id, $role: rec.role, $name: rec.name || "SevisPass User",
        $sub: rec.sub, $email: rec.email || null, $tier: rec.tier || null,
        $instId: rec.instId || null, $updatedAt: rec.updatedAt || new Date().toISOString(),
      });
      return this.getUserById(rec.id);
    },
    getRecordsByStudent(studentId) { return statements.listRecords.all(studentId).map(plain); },
    createAuthTransaction(transaction) {
      statements.createAuth.run({
        $id: transaction.id, $state: transaction.state, $nonce: transaction.nonce,
        $createdAt: transaction.createdAt, $expiresAt: transaction.expiresAt,
      });
      return this.getAuthTransaction(transaction.id);
    },
    getAuthTransaction(id) { return plain(statements.getAuthById.get(id)); },
    getAuthTransactionByState(state) { return plain(statements.getAuthByState.get(state)); },
    setUpstreamSessionId(id, upstreamSessionId) {
      return statements.setUpstreamSession.run({ $id: id, $upstreamSessionId: upstreamSessionId }).changes === 1;
    },
    expireTransactions(now) { return statements.expireAuth.run(now).changes; },
    purgeExpired(now) {
      return {
        authTransactions: statements.purgeExpiredAuth.run(now).changes,
        appSessions: statements.purgeExpiredAppSessions.run(now).changes,
      };
    },
    completeAuthentication({ transactionId, claims, appSessionId, now, sessionExpiresAt, localUserId }) {
      const claimsJson = JSON.stringify(claims);
      // Federated subjects are namespaced so an external subject can never
      // collide with a provisioned registrar/admin ID such as SP-3001.
      const userId = localUserId || `sevis:${claims.sub}`;
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const current = plain(statements.getAuthById.get(transactionId));
        if (!current || current.status !== "pending" || Date.parse(current.expires_at) <= Date.parse(now)) {
          sqlite.exec("ROLLBACK");
          return null;
        }
        statements.upsertExternalUser.run({
          $id: userId,
          $name: claims.name || "SevisPass User",
          $sub: claims.sub,
          $email: claims.email || null,
          $tier: "SevisPass — verified citizen",
          $updatedAt: now,
        });
        statements.createAppSession.run({
          $id: appSessionId, $userId: userId, $claimsJson: claimsJson,
          $createdAt: now, $expiresAt: sessionExpiresAt,
        });
        const result = statements.completeAuth.run({
          $id: transactionId, $userId: userId, $claimsJson: claimsJson,
          $appSessionId: appSessionId, $completedAt: now,
        });
        if (result.changes !== 1) throw new Error("Authentication transaction was already completed.");
        sqlite.exec("COMMIT");
        return { transaction: this.getAuthTransaction(transactionId), appSession: this.getAppSession(appSessionId) };
      } catch (error) {
        try { sqlite.exec("ROLLBACK"); } catch {}
        throw error;
      }
    },
    completeMockAuthentication({ transactionId, userId, appSessionId, now, sessionExpiresAt }) {
      const user = this.getUserById(userId);
      if (!user) return null;
      return this.completeAuthentication({
        transactionId,
        claims: { sub: user.id, name: user.name, email: user.email || undefined, role: user.role, tier: user.tier, instId: user.instId },
        appSessionId,
        now,
        sessionExpiresAt,
        localUserId: userId,
      });
    },
    consumeAuthTransaction(id, now) { return statements.consumeAuth.run({ $id: id, $consumedAt: now }).changes === 1; },
    getAppSession(id) { return plain(statements.getAppSession.get(id)); },
    revokeAppSession(id, now) { return statements.revokeAppSession.run({ $id: id, $revokedAt: now }).changes === 1; },
    close() { sqlite.close(); },
    raw: sqlite,
  };

  return repository;
}

module.exports = { createDatabase, hashRecord, DEFAULT_DB_PATH };
