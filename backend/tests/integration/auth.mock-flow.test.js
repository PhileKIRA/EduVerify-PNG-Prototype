const request = require("supertest");
const { makeContext } = require("../helpers/context");

describe("mock authentication end-to-end", () => {
  let ctx;
  beforeEach(() => { ctx = makeContext(); });
  afterEach(() => ctx.close());

  it("runs initiate → wallet scan → poll → identity → protected session → logout", async () => {
    const agent = request.agent(ctx.app);
    const initiated = await agent.post("/api/auth/initiate").send({}).expect(201);
    expect(initiated.body).toEqual(expect.objectContaining({
      mode: "mock",
      sessionId: expect.any(String),
      state: expect.any(String),
      qrCode: expect.stringContaining("<svg"),
    }));

    await agent.post("/api/auth/simulate-scan").send({ sessionId: initiated.body.sessionId, userId: "SP-1003" }).expect(200);

    const status = await agent.get(`/api/session/status?session=${encodeURIComponent(initiated.body.sessionId)}`).expect(200);
    expect(status.body).toEqual({ status: "authenticated", authenticated: true, userId: "SP-1003", redirectUrl: "http://localhost:5173/#/auth/complete" });

    const identity = await agent.get(`/api/user?session=${encodeURIComponent(initiated.body.sessionId)}`).expect(200);
    expect(identity.body.state).toBe(initiated.body.state);
    expect(identity.body.user).toEqual(expect.objectContaining({ id: "SP-1003", role: "student", name: "Philemon Kira" }));
    expect(identity.headers["set-cookie"][0]).toMatch(/eduverify_session=.*HttpOnly/i);
    expect(identity.headers["set-cookie"][0]).toMatch(/SameSite=Lax/i);
    expect(identity.headers["set-cookie"][0]).not.toMatch(/Secure/i);

    const me = await agent.get("/api/session/me").expect(200);
    expect(me.body.user.id).toBe("SP-1003");

    await agent.post("/api/auth/logout").send({}).expect(200);
    await agent.get("/api/session/me").expect(401).expect(({ body }) => {
      expect(body.error.code).toBe("SESSION_REQUIRED");
    });
  });

  it("generates unique state and nonce values", async () => {
    const first = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
    const second = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
    expect(first.body.state).not.toBe(second.body.state);
    expect(ctx.db.getAuthTransaction(first.body.sessionId).nonce).not.toBe(ctx.db.getAuthTransaction(second.body.sessionId).nonce);
  });

  it("reports pending, expired and unknown QR transactions", async () => {
    const initiated = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
    await ctx.api.get(`/api/session/status?session=${initiated.body.sessionId}`).expect(200).expect(({ body }) => {
      expect(body.status).toBe("pending");
    });
    ctx.clockState.value += 11 * 60_000;
    await ctx.api.get(`/api/session/status?session=${initiated.body.sessionId}`).expect(410).expect(({ body }) => {
      expect(body.status).toBe("expired");
    });
    await ctx.api.get("/api/session/status?session=unknown").expect(404).expect(({ body }) => {
      expect(body.status).toBe("not_found");
    });
  });

  it("prevents a simulated transaction from being claimed twice or by an unknown user", async () => {
    const initiated = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
    await ctx.api.post("/api/auth/simulate-scan").send({ sessionId: initiated.body.sessionId, userId: "missing" }).expect(404);
    await ctx.api.post("/api/auth/simulate-scan").send({ sessionId: initiated.body.sessionId, userId: "SP-1001" }).expect(200);
    await ctx.api.post("/api/auth/simulate-scan").send({ sessionId: initiated.body.sessionId, userId: "SP-1002" }).expect(409);
  });

  it("makes the identity handoff single-use", async () => {
    const initiated = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
    await ctx.api.post("/api/auth/simulate-scan").send({ sessionId: initiated.body.sessionId, userId: "SP-1001" }).expect(200);
    await ctx.api.get(`/api/user?session=${initiated.body.sessionId}`).expect(200);
    await ctx.api.get(`/api/user?session=${initiated.body.sessionId}`).expect(409).expect(({ body }) => {
      expect(body.error.code).toBe("AUTH_TRANSACTION_CONSUMED");
    });
  });
});
