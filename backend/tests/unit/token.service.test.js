const jwt = require("jsonwebtoken");
const { createTokenService, filterClaims } = require("../../src/services/token.service");
const { makeConfig } = require("../helpers/context");

function sign(config, claims, options = {}) {
  return jwt.sign(claims, config.jwtSecret, {
    algorithm: "HS256",
    audience: options.audience || config.clientId,
    expiresIn: options.expiresIn || "5m",
    ...(options.issuer ? { issuer: options.issuer } : {}),
  });
}

describe("identity token verification", () => {
  it("verifies signature, audience, expiry, subject and nonce", async () => {
    const config = makeConfig();
    const service = createTokenService({ config });
    const token = sign(config, { sub: "citizen-1", nonce: "nonce-1", name: "Citizen", unexpected: "not stored" });
    const claims = await service.verify(token, "nonce-1");
    expect(claims.sub).toBe("citizen-1");
    expect(claims.unexpected).toBeUndefined();
  });

  it.each([
    ["wrong nonce", (config) => sign(config, { sub: "citizen-1", nonce: "other" }), "nonce-1", "TOKEN_NONCE_INVALID"],
    ["wrong audience", (config) => sign(config, { sub: "citizen-1", nonce: "nonce-1" }, { audience: "other-client" }), "nonce-1", "TOKEN_INVALID"],
    ["expired token", (config) => sign(config, { sub: "citizen-1", nonce: "nonce-1" }, { expiresIn: -1 }), "nonce-1", "TOKEN_EXPIRED"],
    ["missing subject", (config) => sign(config, { nonce: "nonce-1" }), "nonce-1", "TOKEN_SUBJECT_MISSING"],
  ])("rejects %s", async (_name, tokenFactory, nonce, code) => {
    const config = makeConfig();
    const service = createTokenService({ config });
    await expect(service.verify(tokenFactory(config), nonce)).rejects.toMatchObject({ code });
  });

  it("rejects missing tokens and missing verification configuration", async () => {
    const config = makeConfig();
    await expect(createTokenService({ config }).verify("", "n")).rejects.toMatchObject({ code: "TOKEN_MISSING" });
    const unconfigured = { ...config, jwksUri: "", jwtSecret: "" };
    await expect(createTokenService({ config: unconfigured }).verify("abc", "n")).rejects.toMatchObject({ code: "TOKEN_VERIFICATION_NOT_CONFIGURED" });
  });

  it("uses token kid with the configured JWKS client", async () => {
    const config = { ...makeConfig(), jwksUri: "https://sso.test.example/jwks", jwtSecret: "" };
    const getSigningKey = vi.fn((_kid, callback) => callback(new Error("unknown kid")));
    const factory = vi.fn(() => ({ getSigningKey }));
    const service = createTokenService({ config, jwksClientFactory: factory });
    const malformedButDecodable = [
      Buffer.from(JSON.stringify({ alg: "RS256", kid: "rotated-key" })).toString("base64url"),
      Buffer.from(JSON.stringify({ sub: "x", nonce: "n" })).toString("base64url"),
      "signature",
    ].join(".");
    await expect(service.verify(malformedButDecodable, "n")).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ cache: true, rateLimit: true }));
    expect(getSigningKey).toHaveBeenCalledWith("rotated-key", expect.any(Function));
  });

  it("filters sensitive or unnecessary claims", () => {
    expect(filterClaims({ sub: "x", nonce: "n", phone_number: "private", rawCredential: "private" })).toEqual({ sub: "x", nonce: "n" });
  });
});
