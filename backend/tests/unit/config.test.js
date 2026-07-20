const { loadConfig, safeConfigSummary, parseOrigin } = require("../../src/config");

const BASE = {
  NODE_ENV: "development",
  MOCK_MODE: "false",
  OIDC4VP_SERVER_URL: "https://sso.stage.example",
  CLIENT_ID: "client-id",
  CLIENT_SECRET: "super-secret",
  CALLBACK_URL: "http://localhost:3001/api/auth/callback",
  SSO_REQUEST_ORIGIN: "http://localhost:5173",
  APP_ORIGIN: "http://localhost:5173",
  AUTH_SUCCESS_URL: "http://localhost:5173/#/auth/complete",
  AUTH_FAILURE_URL: "http://localhost:5173/#/login",
  ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
};

describe("configuration", () => {
  for (const key of ["CLIENT_SECRET", "CLIENT_ID", "CALLBACK_URL", "SSO_REQUEST_ORIGIN", "OIDC4VP_SERVER_URL"]) {
    it(`rejects missing ${key} in live mode`, () => {
      expect(() => loadConfig({ ...BASE, [key]: "" })).toThrow(/missing required configuration/i);
    });
  }

  it("rejects malformed callback URLs", () => {
    expect(() => loadConfig({ ...BASE, CALLBACK_URL: "not-a-url" })).toThrow(/valid absolute URL/i);
  });

  it.each([
    "http://localhost:5173/",
    "http://localhost:5173/path",
    "http://localhost:5173?x=1",
    "http://localhost:5173/#fragment",
  ])("rejects non-origin SSO_REQUEST_ORIGIN %s", (origin) => {
    expect(() => loadConfig({ ...BASE, SSO_REQUEST_ORIGIN: origin })).toThrow(/scheme, hostname and port/i);
  });

  it("accepts exact localhost origins in development", () => {
    const config = loadConfig(BASE);
    expect(config.ssoRequestOrigin).toBe("http://localhost:5173");
    expect(config.callbackUrl).toBe("http://localhost:3001/api/auth/callback");
  });

  it("parses and de-duplicates comma-separated allowed origins", () => {
    const config = loadConfig({ ...BASE, ALLOWED_ORIGINS: "http://localhost:5173, http://127.0.0.1:5173,http://localhost:5173" });
    expect(config.allowedOrigins).toEqual(["http://localhost:5173", "http://127.0.0.1:5173"]);
  });

  it("rejects HTTP callback and redirects in production", () => {
    expect(() => loadConfig({ ...BASE, NODE_ENV: "production" })).toThrow(/HTTPS in production/i);
  });

  it("permits an explicit insecure production override", () => {
    const config = loadConfig({ ...BASE, NODE_ENV: "production", ALLOW_INSECURE_HTTP: "true" });
    expect(config.isProduction).toBe(true);
  });

  it("rejects non-local HTTP URLs without an override", () => {
    expect(() => loadConfig({ ...BASE, CALLBACK_URL: "http://example.test/api/auth/callback" })).toThrow(/HTTP only for localhost/i);
  });

  it("validates booleans and positive integers", () => {
    expect(() => loadConfig({ ...BASE, COOKIE_SECURE: "perhaps" })).toThrow(/Invalid boolean/i);
    expect(() => loadConfig({ ...BASE, STATE_EXPIRY_MINUTES: "0" })).toThrow(/positive integer/i);
  });

  it("allows mock mode without live credentials", () => {
    const config = loadConfig({ MOCK_MODE: "true", APP_ORIGIN: "http://localhost:5173" });
    expect(config.mockMode).toBe(true);
    expect(config.ssoRequestOrigin).toBe("http://localhost:5173");
  });

  it("returns a safe summary without the client secret", () => {
    const config = loadConfig(BASE);
    const summary = safeConfigSummary(config);
    expect(JSON.stringify(summary)).not.toContain(BASE.CLIENT_SECRET);
    expect(summary.requestOrigin).toBe(BASE.SSO_REQUEST_ORIGIN);
  });

  it("parseOrigin rejects credentials in a URL", () => {
    expect(() => parseOrigin("http://user:pass@localhost:5173", "ORIGIN")).toThrow();
  });
});
