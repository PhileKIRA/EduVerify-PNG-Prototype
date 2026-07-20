const { createSevisPassService } = require("../../src/services/sevispass.service");
const { makeConfig, silentLogger } = require("../helpers/context");

function response(body, status = 200, headers = { "Content-Type": "application/json" }) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}

describe("SevisPass authorization service", () => {
  it("sends the confirmed header-credential protocol and exact origin", async () => {
    const config = makeConfig({ config: { mockMode: false } });
    const fetchImpl = vi.fn().mockResolvedValue(response({ requestUri: "openid4vp://request/123", sessionId: "up-123" }));
    const service = createSevisPassService({ config, fetchImpl, logger: silentLogger() });

    const result = await service.initiateAuthorization({ state: "state-1", nonce: "nonce-1" });
    expect(result.requestUri).toBe("openid4vp://request/123");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://sso.test.example/api/auth/third-party/authorize");
    expect(options.method).toBe("POST");
    expect(options.headers.Origin).toBe("http://localhost:5173");
    expect(options.headers["X-Client-ID"]).toBe(config.clientId);
    expect(options.headers["X-Client-Secret"]).toBe(config.clientSecret);
    expect(JSON.parse(options.body)).toEqual({
      callback_url: "http://localhost:3001/api/auth/callback",
      state: "state-1",
      nonce: "nonce-1",
    });
  });

  it("polls upstream status and retrieves the verified user with server-side credentials", async () => {
    const config = makeConfig({ config: { mockMode: false } });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ sessionId: "up-123", authenticated: true, hasRedirect: true }))
      .mockResolvedValueOnce(response({ user: { sub: "did:sevis:123", name: "Citizen" }, sessionId: "up-123" }));
    const service = createSevisPassService({ config, fetchImpl, logger: silentLogger() });

    const status = await service.getSessionStatus("up-123");
    const user = await service.getUser("up-123");
    expect(status.authenticated).toBe(true);
    expect(user.user.sub).toBe("did:sevis:123");

    const [statusUrl, statusOptions] = fetchImpl.mock.calls[0];
    expect(statusUrl).toBe("https://sso.test.example/api/session/status?session=up-123");
    expect(statusOptions.method).toBe("GET");
    expect(statusOptions.headers.Origin).toBe(config.ssoRequestOrigin);
    expect(statusOptions.headers["X-Client-ID"]).toBe(config.clientId);
    expect(statusOptions.headers["X-Client-Secret"]).toBe(config.clientSecret);

    const [userUrl] = fetchImpl.mock.calls[1];
    expect(userUrl).toBe("https://sso.test.example/api/user?session=up-123");
  });

  it("maps Origin not allowed without retrying another credential format", async () => {
    const config = makeConfig({ config: { mockMode: false } });
    const fetchImpl = vi.fn().mockResolvedValue(response({ error: "Forbidden", message: "Origin not allowed" }, 403));
    const service = createSevisPassService({ config, fetchImpl, logger: silentLogger() });
    await expect(service.initiateAuthorization({ state: "s", nonce: "n" })).rejects.toMatchObject({ code: "SSO_ORIGIN_NOT_ALLOWED", status: 502 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, { error: "invalid_client", message: "Client credentials rejected" }, "SSO_CREDENTIALS_REJECTED"],
    [403, { message: "Invalid client credentials" }, "SSO_CREDENTIALS_REJECTED"],
    [429, { message: "Too many requests" }, "SSO_RATE_LIMITED"],
    [500, { message: "server error" }, "SSO_AUTHORIZE_FAILED"],
    [404, { message: "not found" }, "SSO_AUTHORIZE_FAILED"],
    [400, { message: "bad request" }, "SSO_AUTHORIZE_FAILED"],
  ])("maps HTTP %s safely", async (status, body, code) => {
    const config = makeConfig({ config: { mockMode: false } });
    const service = createSevisPassService({ config, fetchImpl: vi.fn().mockResolvedValue(response(body, status)), logger: silentLogger() });
    await expect(service.initiateAuthorization({ state: "s", nonce: "n" })).rejects.toMatchObject({ code });
  });

  it("rejects a successful response containing invalid JSON", async () => {
    const config = makeConfig({ config: { mockMode: false } });
    const service = createSevisPassService({ config, fetchImpl: vi.fn().mockResolvedValue(response("not-json", 200, { "Content-Type": "text/plain" })), logger: silentLogger() });
    await expect(service.initiateAuthorization({ state: "s", nonce: "n" })).rejects.toMatchObject({ code: "SSO_INVALID_RESPONSE" });
  });

  it("maps DNS and connection failures", async () => {
    const config = makeConfig({ config: { mockMode: false } });
    const service = createSevisPassService({ config, fetchImpl: vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND")), logger: silentLogger() });
    await expect(service.initiateAuthorization({ state: "s", nonce: "n" })).rejects.toMatchObject({ code: "SSO_NETWORK_ERROR" });
  });

  it("maps request timeouts", async () => {
    const config = makeConfig({ config: { mockMode: false, requestTimeoutMs: 5 } });
    const fetchImpl = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }));
    const service = createSevisPassService({ config, fetchImpl, logger: silentLogger() });
    await expect(service.initiateAuthorization({ state: "s", nonce: "n" })).rejects.toMatchObject({ code: "SSO_TIMEOUT", status: 504 });
  });
});

// Regression coverage for the live staging issue where authentication completed
// but the response did not use the exact `authenticated: true` shape.
describe("SevisPass session status normalization", () => {
  const { normalizeSessionStatus } = require("../../src/services/sevispass.service");

  it.each([
    [{ status: "COMPLETED" }, true],
    [{ data: { status: "approved" } }, true],
    [{ session: { isAuthenticated: true } }, true],
    [{ authentication: { verified: true } }, true],
    [{ status: "pending" }, false],
  ])("normalizes %#", (payload, expected) => {
    expect(normalizeSessionStatus(payload).authenticated).toBe(expected);
  });

  it("uses identity embedded in the status response", () => {
    const result = normalizeSessionStatus({
      result: {
        status: "authenticated",
        user: { sub: "did:sevis:embedded", name: "Embedded Citizen" },
      },
    });
    expect(result).toEqual(expect.objectContaining({
      authenticated: true,
      status: "authenticated",
      user: expect.objectContaining({ sub: "did:sevis:embedded" }),
    }));
  });
});
