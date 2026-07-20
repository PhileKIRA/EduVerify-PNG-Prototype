const request = require("supertest");
const { makeConfig, makeContext } = require("../helpers/context");

describe("application session security", () => {
  async function login(ctx, userId = "SP-1001") {
    const agent = request.agent(ctx.app);
    const initiated = await agent.post("/api/auth/initiate").send({}).expect(201);
    await agent.post("/api/auth/simulate-scan").send({ sessionId: initiated.body.sessionId, userId }).expect(200);
    const identity = await agent.get(`/api/user?session=${initiated.body.sessionId}`).expect(200);
    return { agent, identity, initiated };
  }

  it("uses Secure cookies in production-style HTTPS configuration", async () => {
    const config = makeConfig({ config: { cookieSecure: true } });
    const ctx = makeContext({ config });
    try {
      const { identity } = await login(ctx);
      expect(identity.headers["set-cookie"][0]).toMatch(/Secure/i);
      expect(identity.headers["set-cookie"][0]).toMatch(/HttpOnly/i);
      expect(identity.headers["set-cookie"][0]).toMatch(/SameSite=Lax/i);
    } finally { ctx.close(); }
  });

  it("rejects expired sessions", async () => {
    const ctx = makeContext();
    try {
      const { agent } = await login(ctx);
      ctx.clockState.value += 481 * 60_000;
      await agent.get("/api/session/me").expect(401).expect(({ body }) => expect(body.error.code).toBe("SESSION_REQUIRED"));
    } finally { ctx.close(); }
  });

  it("rotates to a newly generated session identifier and ignores attacker cookies", async () => {
    const ctx = makeContext();
    try {
      const attackerCookie = "eduverify_session=attacker-fixed-id";
      const initiated = await ctx.api.post("/api/auth/initiate").set("Cookie", attackerCookie).send({}).expect(201);
      await ctx.api.post("/api/auth/simulate-scan").send({ sessionId: initiated.body.sessionId, userId: "SP-1002" }).expect(200);
      const identity = await ctx.api.get(`/api/user?session=${initiated.body.sessionId}`).set("Cookie", attackerCookie).expect(200);
      expect(identity.headers["set-cookie"][0]).not.toContain("attacker-fixed-id");
    } finally { ctx.close(); }
  });
});
