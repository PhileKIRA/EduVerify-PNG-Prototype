const request = require("supertest");
const { makeConfig, makeContext, signToken } = require("../helpers/context");
const { SsoOriginError, ExternalServiceError } = require("../../src/errors");

describe("live SevisPass authentication simulation", () => {
  function liveContext(extra = {}) {
    const config = makeConfig({ config: { mockMode: false, ...extra.config } });
    return makeContext({
      config,
      sevisPassService: extra.sevisPassService || {
        initiateAuthorization: vi.fn().mockImplementation(() => Promise.resolve({ requestUri: "openid4vp://authorize/request-123", sessionId: `upstream-${Math.random()}` })),
        getSessionStatus: vi.fn().mockResolvedValue({ authenticated: false }),
        getUser: vi.fn(),
      },
      ...extra.options,
    });
  }

  it("completes the full backend authentication flow with a signed token", async () => {
    const ctx = liveContext();
    const agent = request.agent(ctx.app);
    try {
      const initiated = await agent.post("/api/auth/initiate").send({}).expect(201);
      expect(initiated.body).toEqual(expect.objectContaining({ mode: "live", flow: "wallet", qrCode: expect.stringContaining("<svg") }));
      const transaction = ctx.db.getAuthTransaction(initiated.body.sessionId);
      const token = signToken(ctx.config, { nonce: transaction.nonce, sub: "sevis-live-1", name: "Live Citizen" });

      const callback = await agent.post("/api/auth/callback").send({ state: transaction.state, vp_token: token }).expect(303);
      expect(callback.headers.location).toContain("http://localhost:5173/#/auth/complete?session=");
      expect(callback.headers.location).not.toContain(token);
      expect(callback.headers["set-cookie"][0]).toMatch(/HttpOnly/);

      await agent.get(`/api/session/status?session=${transaction.id}`).expect(200).expect(({ body }) => {
        expect(body.authenticated).toBe(true);
        expect(body.userId).toBe("sevis:sevis-live-1");
      });

      const identity = await agent.get(`/api/user?session=${transaction.id}`).expect(200);
      expect(identity.body.user).toEqual(expect.objectContaining({ id: "sevis:sevis-live-1", sub: "sevis-live-1", role: "student", name: "Live Citizen" }));
      await agent.get("/api/session/me").expect(200).expect(({ body }) => {
        expect(body.user.id).toBe("sevis:sevis-live-1");
      });
    } finally {
      ctx.close();
    }
  });

  it.each([
    ["missing state", {}, "STATE_MISSING"],
    ["unknown state", { state: "unknown", vp_token: "x" }, "STATE_INVALID"],
    ["SSO denial", { error: "access_denied", state: "ignored" }, "SSO_ACCESS_DENIED"],
  ])("redirects safely for %s", async (_label, body, code) => {
    const ctx = liveContext();
    try {
      const result = await ctx.api.post("/api/auth/callback").send(body).expect(303);
      expect(result.headers.location).toContain(`error=${code}`);
      expect(result.headers.location).toMatch(/^http:\/\/localhost:5173\/#\/login/);
    } finally { ctx.close(); }
  });

  it("rejects expired state, invalid token, wrong nonce and callback replay", async () => {
    const ctx = liveContext();
    try {
      const expired = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
      const expiredTx = ctx.db.getAuthTransaction(expired.body.sessionId);
      ctx.clockState.value += 11 * 60_000;
      await ctx.api.post("/api/auth/callback").send({ state: expiredTx.state, vp_token: "x" }).expect(303).expect(({ headers }) => {
        expect(headers.location).toContain("error=STATE_EXPIRED");
      });

      ctx.clockState.value = Date.parse("2026-07-19T11:00:00.000Z");
      const invalid = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
      const invalidTx = ctx.db.getAuthTransaction(invalid.body.sessionId);
      await ctx.api.post("/api/auth/callback").send({ state: invalidTx.state, vp_token: "not-a-jwt" }).expect(303).expect(({ headers }) => {
        expect(headers.location).toContain("error=TOKEN_INVALID");
      });

      const nonceCase = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
      const nonceTx = ctx.db.getAuthTransaction(nonceCase.body.sessionId);
      const wrongNonce = signToken(ctx.config, { nonce: "another-nonce", sub: "user" });
      await ctx.api.post("/api/auth/callback").send({ state: nonceTx.state, vp_token: wrongNonce }).expect(303).expect(({ headers }) => {
        expect(headers.location).toContain("error=TOKEN_NONCE_INVALID");
      });

      const replayCase = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
      const replayTx = ctx.db.getAuthTransaction(replayCase.body.sessionId);
      const good = signToken(ctx.config, { nonce: replayTx.nonce, sub: "replay-user" });
      await ctx.api.post("/api/auth/callback").send({ state: replayTx.state, vp_token: good }).expect(303);
      await ctx.api.post("/api/auth/callback").send({ state: replayTx.state, vp_token: good }).expect(303).expect(({ headers }) => {
        expect(headers.location).toContain("error=STATE_REPLAYED");
      });
    } finally { ctx.close(); }
  });


  it("polls the SevisPass session and completes login after wallet approval", async () => {
    const service = {
      initiateAuthorization: vi.fn().mockResolvedValue({ qrCode: "<svg>live</svg>", sessionId: "sevis-session-789" }),
      getSessionStatus: vi.fn()
        .mockResolvedValueOnce({ sessionId: "sevis-session-789", authenticated: false })
        .mockResolvedValueOnce({ sessionId: "sevis-session-789", authenticated: true, hasRedirect: true }),
      getUser: vi.fn().mockResolvedValue({
        user: { sub: "did:sevis:789", name: "Wallet Citizen", email: "wallet@example.test", credentials: [{ type: "SevisPass" }] },
        sessionId: "sevis-session-789",
      }),
    };
    const ctx = liveContext({ sevisPassService: service });
    const agent = request.agent(ctx.app);
    try {
      const initiated = await agent.post("/api/auth/initiate").send({}).expect(201);
      const tx = ctx.db.getAuthTransaction(initiated.body.sessionId);
      expect(tx.upstream_session_id).toBe("sevis-session-789");

      await agent.get(`/api/session/status?session=${tx.id}`).expect(200).expect(({ body }) => {
        expect(body.authenticated).toBe(false);
      });
      const complete = await agent.get(`/api/session/status?session=${tx.id}`).expect(200);
      expect(complete.body).toEqual(expect.objectContaining({ authenticated: true, userId: "sevis:did:sevis:789" }));
      expect(complete.headers["set-cookie"][0]).toMatch(/HttpOnly/);

      const identity = await agent.get(`/api/user?session=${tx.id}`).expect(200);
      expect(identity.body.user).toEqual(expect.objectContaining({ name: "Wallet Citizen", role: "student", sub: "did:sevis:789" }));
      await agent.get("/api/session/me").expect(200);
      expect(service.getSessionStatus).toHaveBeenCalledWith("sevis-session-789");
      expect(service.getUser).toHaveBeenCalledWith("sevis-session-789");
    } finally { ctx.close(); }
  });


  it("namespaces federated subjects so they cannot collide with provisioned admin IDs", async () => {
    const ctx = liveContext();
    try {
      const initiated = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
      const tx = ctx.db.getAuthTransaction(initiated.body.sessionId);
      const token = signToken(ctx.config, { nonce: tx.nonce, sub: "SP-3001", name: "Untrusted Collision" });
      await ctx.api.post("/api/auth/callback").send({ state: tx.state, vp_token: token }).expect(303);
      const identity = await ctx.api.get(`/api/user?session=${tx.id}`).expect(200);
      expect(identity.body.user.id).toBe("sevis:SP-3001");
      expect(identity.body.user.role).toBe("student");
      expect(ctx.db.getUserById("SP-3001").role).toBe("admin");
    } finally { ctx.close(); }
  });

  it("does not permit a client-supplied open redirect", async () => {
    const ctx = liveContext();
    try {
      const initiated = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
      const tx = ctx.db.getAuthTransaction(initiated.body.sessionId);
      const token = signToken(ctx.config, { nonce: tx.nonce });
      const result = await ctx.api.post("/api/auth/callback").send({ state: tx.state, vp_token: token, redirect_uri: "https://evil.example/steal" }).expect(303);
      expect(result.headers.location).toMatch(/^http:\/\/localhost:5173\/#\/auth\/complete/);
      expect(result.headers.location).not.toContain("evil.example");
    } finally { ctx.close(); }
  });

  it("returns actionable safe errors for origin rejection and timeout", async () => {
    for (const error of [
      new SsoOriginError("http://localhost:5173", "http://localhost:3001/api/auth/callback"),
      new ExternalServiceError("SSO_TIMEOUT", "SevisPass did not respond before the request timed out.", { status: 504 }),
    ]) {
      const ctx = liveContext({ sevisPassService: { initiateAuthorization: vi.fn().mockRejectedValue(error) } });
      try {
        const result = await ctx.api.post("/api/auth/initiate").send({}).expect(error.status);
        expect(result.body.error.code).toBe(error.code);
        expect(JSON.stringify(result.body)).not.toContain(ctx.config.clientSecret);
      } finally { ctx.close(); }
    }
  });
});
