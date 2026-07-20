const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const { TokenVerificationError } = require("../errors");

const ALLOWED_CLAIMS = ["sub", "name", "email", "ageOver18", "validUntil", "credentials", "nonce", "iss", "aud", "iat", "exp"];

function filterClaims(payload) {
  const output = {};
  for (const key of ALLOWED_CLAIMS) {
    if (payload[key] !== undefined) output[key] = payload[key];
  }
  return output;
}

function createTokenService({ config, jwksClientFactory = jwksClient }) {
  const client = config.jwksUri
    ? jwksClientFactory({
        jwksUri: config.jwksUri,
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 10 * 60 * 1000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        timeout: config.requestTimeoutMs,
      })
    : null;

  function verificationKey(header, callback) {
    if (!client) return callback(new Error("JWKS client is not configured."));
    if (!header.kid) return callback(new Error("Token header has no kid."));
    client.getSigningKey(header.kid, (error, key) => {
      if (error) return callback(error);
      return callback(null, key.getPublicKey());
    });
  }

  function verify(token, expectedNonce) {
    return new Promise((resolve, reject) => {
      if (!token || typeof token !== "string") {
        return reject(new TokenVerificationError("TOKEN_MISSING", "The SevisPass callback did not include an identity token."));
      }
      const options = {
        audience: config.clientId || undefined,
        issuer: config.ssoIssuer || undefined,
        algorithms: client ? ["RS256", "ES256"] : ["HS256"],
      };
      const key = client ? verificationKey : config.jwtSecret;
      if (!key) {
        return reject(new TokenVerificationError("TOKEN_VERIFICATION_NOT_CONFIGURED", "Token verification is not configured."));
      }
      jwt.verify(token, key, options, (error, payload) => {
        if (error) {
          const code = error.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "TOKEN_INVALID";
          return reject(new TokenVerificationError(code, "The SevisPass identity token is invalid or expired.", error));
        }
        if (!payload?.sub) return reject(new TokenVerificationError("TOKEN_SUBJECT_MISSING", "The identity token has no subject."));
        if (!expectedNonce || payload.nonce !== expectedNonce) {
          return reject(new TokenVerificationError("TOKEN_NONCE_INVALID", "The identity token nonce did not match the login transaction."));
        }
        return resolve(filterClaims(payload));
      });
    });
  }

  return { verify, filterClaims };
}

module.exports = { createTokenService, filterClaims };
