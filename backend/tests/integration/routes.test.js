const { makeContext } = require("../helpers/context");

describe("backend API contract", () => {
  let ctx;
  beforeEach(() => { ctx = makeContext(); });
  afterEach(() => ctx.close());

  it.each(["/health", "/api/health"])("reports health at %s without secrets", async (route) => {
    const result = await ctx.api.get(route).expect(200);
    expect(result.body).toEqual({ ok: true, mode: "mock", services: { database: "healthy", sso: "not-probed" } });
    expect(JSON.stringify(result.body)).not.toContain(ctx.config.clientSecret);
  });

  it("returns the institution registry", async () => {
    const result = await ctx.api.get("/api/institutions").expect(200);
    expect(result.body.institutions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "inst-dwu", name: "Divine Word University" })]));
  });

  it("returns records for a student and an empty list for an unknown student", async () => {
    await ctx.api.get("/api/records/SP-1003").expect(200).expect(({ body }) => expect(body.records).toHaveLength(4));
    await ctx.api.get("/api/records/UNKNOWN").expect(200).expect(({ body }) => expect(body.records).toEqual([]));
  });

  it("serves RFC 9116 security.txt", async () => {
    const result = await ctx.api.get("/.well-known/security.txt").expect(200);
    expect(result.text).toContain("Contact:");
    expect(result.text).toContain("Canonical:");
  });

  it("returns a structured 404 for unknown routes", async () => {
    const result = await ctx.api.get("/api/does-not-exist").expect(404);
    expect(result.body).toEqual({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "No route matches GET /api/does-not-exist." } });
  });

  it("rejects invalid JSON and oversized bodies safely", async () => {
    await ctx.api.post("/api/auth/initiate").set("Content-Type", "application/json").send('{"broken":').expect(400).expect(({ body }) => {
      expect(body.error.code).toBe("INVALID_JSON");
    });
    await ctx.api.post("/api/auth/initiate").send({ payload: "x".repeat(5000) }).expect(413).expect(({ body }) => {
      expect(body.error.code).toBe("REQUEST_TOO_LARGE");
    });
  });

  it("requires session ids for status and user routes", async () => {
    await ctx.api.get("/api/session/status").expect(400).expect(({ body }) => expect(body.error.code).toBe("SESSION_ID_REQUIRED"));
    await ctx.api.get("/api/user").expect(400).expect(({ body }) => expect(body.error.code).toBe("SESSION_ID_REQUIRED"));
  });

  it("keeps stack traces and secrets out of production API errors", async () => {
    const result = await ctx.api.get("/api/session/me").expect(401);
    expect(JSON.stringify(result.body)).not.toMatch(/stack|node_modules|client-secret/i);
  });

  it("sets expected browser security headers", async () => {
    const result = await ctx.api.get("/api/health").expect(200);
    expect(result.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(result.headers["x-content-type-options"]).toBe("nosniff");
    expect(result.headers["x-frame-options"]).toBe("DENY");
    expect(result.headers["referrer-policy"]).toBe("no-referrer");
    expect(result.headers["x-powered-by"]).toBeUndefined();
  });
});
