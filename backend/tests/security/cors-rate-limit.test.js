const { makeConfig, makeContext } = require("../helpers/context");

describe("CORS, rate limiting and security boundaries", () => {
  it.each(["http://localhost:5173", "http://127.0.0.1:5173"])("allows configured frontend origin %s", async (origin) => {
    const ctx = makeContext();
    try {
      const result = await ctx.api.options("/api/auth/initiate")
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "POST")
        .expect(204);
      expect(result.headers["access-control-allow-origin"]).toBe(origin);
      expect(result.headers["access-control-allow-credentials"]).toBe("true");
      expect(result.headers["access-control-allow-origin"]).not.toBe("*");
    } finally { ctx.close(); }
  });

  it("rejects an untrusted origin", async () => {
    const ctx = makeContext();
    try {
      const result = await ctx.api.post("/api/auth/initiate").set("Origin", "http://malicious.example").send({}).expect(403);
      expect(result.body.error.code).toBe("CORS_ORIGIN_DENIED");
    } finally { ctx.close(); }
  });

  it("keeps frontend CORS separate from the outgoing SSO Origin", () => {
    const config = makeConfig({
      env: { SSO_REQUEST_ORIGIN: "http://localhost:3001" },
      config: { jwksUri: "", jwtSecret: "test" },
    });
    expect(config.allowedOrigins).toContain("http://localhost:5173");
    expect(config.ssoRequestOrigin).toBe("http://localhost:3001");
  });

  it("rate-limits repeated authentication initiation", async () => {
    const config = makeConfig({ config: { authRateLimitMax: 3, generalRateLimitMax: 1000 } });
    const ctx = makeContext({ config, rateLimitEnabled: true });
    try {
      await ctx.api.post("/api/auth/initiate").send({}).expect(201);
      await ctx.api.post("/api/auth/initiate").send({}).expect(201);
      await ctx.api.post("/api/auth/initiate").send({}).expect(201);
      const result = await ctx.api.post("/api/auth/initiate").send({}).expect(429);
      expect(result.body.error.code).toBe("RATE_LIMITED");
    } finally { ctx.close(); }
  });

  it("ignores prototype-pollution fields rather than changing object prototypes", async () => {
    const ctx = makeContext();
    try {
      await ctx.api.post("/api/auth/initiate").send(JSON.parse('{"__proto__":{"polluted":true}}')).expect(201);
      expect({}.polluted).toBeUndefined();
    } finally { ctx.close(); }
  });
});
