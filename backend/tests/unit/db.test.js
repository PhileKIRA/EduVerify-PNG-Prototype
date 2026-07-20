const { createDatabase, hashRecord } = require("../../src/db");

describe("database repository", () => {
  let db;
  beforeEach(() => { db = createDatabase({ dbPath: ":memory:", seed: true }); });
  afterEach(() => db.close());

  it("initializes required tables and seed data", () => {
    const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining(["users", "institutions", "academic_records", "auth_transactions", "app_sessions"]));
    expect(db.getUserById("SP-1003").name).toBe("Philemon Kira");
    expect(db.listInstitutions().length).toBeGreaterThan(0);
    expect(db.getRecordsByStudent("SP-1003")).toHaveLength(4);
  });

  it("creates, expires, completes and consumes an authentication transaction", () => {
    const transaction = {
      id: "tx-1",
      state: "state-1",
      nonce: "nonce-1",
      createdAt: "2026-07-19T10:00:00.000Z",
      expiresAt: "2026-07-19T10:10:00.000Z",
    };
    db.createAuthTransaction(transaction);
    expect(db.getAuthTransactionByState("state-1").status).toBe("pending");

    const completed = db.completeAuthentication({
      transactionId: "tx-1",
      claims: { sub: "external-1", name: "External User", email: "e@example.test", nonce: "nonce-1" },
      appSessionId: "app-session-1",
      now: "2026-07-19T10:01:00.000Z",
      sessionExpiresAt: "2026-07-19T18:01:00.000Z",
    });
    expect(completed.transaction.status).toBe("authenticated");
    expect(db.getUserById("sevis:external-1").role).toBe("student");
    expect(db.getUserById("sevis:external-1").sub).toBe("external-1");
    expect(db.getAppSession("app-session-1").user_id).toBe("sevis:external-1");
    expect(db.consumeAuthTransaction("tx-1", "2026-07-19T10:02:00.000Z")).toBe(true);
    expect(db.consumeAuthTransaction("tx-1", "2026-07-19T10:03:00.000Z")).toBe(false);
  });

  it("prevents duplicate state and callback replay", () => {
    const input = { id: "a", state: "same", nonce: "n1", createdAt: "2026-07-19T10:00:00Z", expiresAt: "2026-07-19T10:10:00Z" };
    db.createAuthTransaction(input);
    expect(() => db.createAuthTransaction({ ...input, id: "b", nonce: "n2" })).toThrow();
    const args = {
      transactionId: "a",
      claims: { sub: "user-a", name: "A" },
      appSessionId: "app-a",
      now: "2026-07-19T10:01:00Z",
      sessionExpiresAt: "2026-07-19T18:00:00Z",
    };
    expect(db.completeAuthentication(args)).not.toBeNull();
    expect(db.completeAuthentication({ ...args, appSessionId: "app-b" })).toBeNull();
  });

  it("expires pending transactions and revokes app sessions", () => {
    db.createAuthTransaction({ id: "expired", state: "expired-state", nonce: "n", createdAt: "2026-07-19T09:00:00Z", expiresAt: "2026-07-19T09:10:00Z" });
    expect(db.expireTransactions("2026-07-19T10:00:00Z")).toBe(1);
    expect(db.getAuthTransaction("expired").status).toBe("expired");

    db.createAuthTransaction({ id: "active", state: "active-state", nonce: "n", createdAt: "2026-07-19T10:00:00Z", expiresAt: "2026-07-19T10:10:00Z" });
    db.completeAuthentication({ transactionId: "active", claims: { sub: "u", name: "U" }, appSessionId: "sid", now: "2026-07-19T10:01:00Z", sessionExpiresAt: "2026-07-19T18:00:00Z" });
    expect(db.revokeAppSession("sid", "2026-07-19T10:02:00Z")).toBe(true);
    expect(db.getAppSession("sid").revoked_at).toBeTruthy();
  });

  it("produces deterministic record hashes", () => {
    const record = { studentId: "s", institutionId: "i", program: "p", credentialLevel: "c", completionYear: "2026", gpa: "4", classAward: "HD" };
    expect(hashRecord(record)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRecord(record)).toBe(hashRecord({ ...record }));
  });
});
