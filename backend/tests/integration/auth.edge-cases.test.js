const { makeConfig, makeContext } = require("../helpers/context");

describe("authentication edge cases", () => {
  it("rejects identity retrieval while wallet authentication is pending", async () => {
    const ctx = makeContext();
    try {
      const initiated = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
      await ctx.api.get(`/api/user?session=${initiated.body.sessionId}`).expect(401).expect(({ body }) => {
        expect(body.error.code).toBe("AUTHENTICATION_PENDING");
      });
    } finally { ctx.close(); }
  });

  it("validates simulation input, unknown sessions and expiry", async () => {
    const ctx = makeContext();
    try {
      await ctx.api.post("/api/auth/simulate-scan").send({}).expect(400).expect(({ body }) => expect(body.error.code).toBe("SIMULATION_INPUT_REQUIRED"));
      await ctx.api.post("/api/auth/simulate-scan").send({ sessionId: "missing", userId: "SP-1001" }).expect(404).expect(({ body }) => expect(body.error.code).toBe("AUTH_TRANSACTION_NOT_FOUND"));
      const initiated = await ctx.api.post("/api/auth/initiate").send({}).expect(201);
      ctx.clockState.value += 11 * 60_000;
      await ctx.api.post("/api/auth/simulate-scan").send({ sessionId: initiated.body.sessionId, userId: "SP-1001" }).expect(410).expect(({ body }) => expect(body.error.code).toBe("AUTH_TRANSACTION_EXPIRED"));
    } finally { ctx.close(); }
  });

  it("disables mock-only routes and callback handling in the wrong mode", async () => {
    const live = makeContext({ config: makeConfig({ config: { mockMode: false } }), sevisPassService: { initiateAuthorization: vi.fn().mockResolvedValue({ qrCode: "<svg></svg>", sessionId: "up-live" }) } });
    try {
      await live.api.post("/api/auth/simulate-scan").send({ sessionId: "x", userId: "SP-1001" }).expect(403).expect(({ body }) => expect(body.error.code).toBe("MOCK_AUTH_DISABLED"));
    } finally { live.close(); }

    const mock = makeContext();
    try {
      const result = await mock.api.get("/api/auth/callback?state=x&vp_token=y").expect(303);
      expect(result.headers.location).toContain("error=LIVE_CALLBACK_DISABLED");
    } finally { mock.close(); }
  });

  it("accepts direct upstream QR data and rejects missing QR/request data", async () => {
    const config = makeConfig({ config: { mockMode: false } });
    const direct = makeContext({ config, sevisPassService: { initiateAuthorization: vi.fn().mockResolvedValue({ qrCode: "<svg>direct</svg>", sessionId: "up-direct" }) } });
    try {
      await direct.api.post("/api/auth/initiate").send({}).expect(201).expect(({ body }) => expect(body.qrCode).toBe("<svg>direct</svg>"));
    } finally { direct.close(); }

    const missing = makeContext({ config, sevisPassService: { initiateAuthorization: vi.fn().mockResolvedValue({ accepted: true }) } });
    try {
      await missing.api.post("/api/auth/initiate").send({}).expect(502).expect(({ body }) => expect(body.error.code).toBe("SSO_QR_MISSING"));
    } finally { missing.close(); }
  });

  it("reports a database health failure without leaking internals", async () => {
    const ctx = makeContext();
    try {
      const original = ctx.db.raw.prepare;
      ctx.db.raw.prepare = () => { throw new Error("database path /secret/path unavailable"); };
      await ctx.api.get("/api/health").expect(503).expect(({ body }) => {
        expect(body.services.database).toBe("unhealthy");
        expect(JSON.stringify(body)).not.toContain("/secret/path");
      });
      ctx.db.raw.prepare = original;
    } finally { ctx.close(); }
  });
});
