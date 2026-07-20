const request = require("supertest");
const jwt = require("jsonwebtoken");
const { loadConfig } = require("../../src/config");
const { createDatabase } = require("../../src/db");
const { createApp } = require("../../src/app");

function makeConfig(overrides = {}) {
  const env = {
    NODE_ENV: "test",
    PORT: "3001",
    MOCK_MODE: "true",
    OIDC4VP_SERVER_URL: "https://sso.test.example",
    CLIENT_ID: "eduverify-test-client",
    CLIENT_SECRET: "test-client-secret",
    CALLBACK_URL: "http://localhost:3001/api/auth/callback",
    ALLOWED_CALLBACK_URLS: "http://localhost:3001/api/auth/callback",
    APP_ORIGIN: "http://localhost:5173",
    SSO_REQUEST_ORIGIN: "http://localhost:5173",
    AUTH_SUCCESS_URL: "http://localhost:5173/#/auth/complete",
    AUTH_FAILURE_URL: "http://localhost:5173/#/login",
    ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
    STATE_EXPIRY_MINUTES: "10",
    APP_SESSION_MINUTES: "480",
    COOKIE_SECURE: "false",
    TRUST_PROXY: "1",
    JWT_SECRET: "unit-test-jwt-secret-which-is-long-enough",
    BODY_LIMIT: "4kb",
    AUTH_RATE_LIMIT_MAX: "20",
    POLL_RATE_LIMIT_MAX: "40",
    GENERAL_RATE_LIMIT_MAX: "200",
    ...overrides.env,
  };
  const loaded = loadConfig(env);
  return Object.freeze({
    ...loaded,
    // Tests use HS256 unless they explicitly exercise JWKS.
    jwksUri: "",
    jwtSecret: env.JWT_SECRET,
    ...overrides.config,
  });
}

function silentLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makeContext(options = {}) {
  const config = options.config || makeConfig(options.configOverrides || {});
  const db = createDatabase({ dbPath: ":memory:", seed: options.seed !== false });
  const logger = options.logger || silentLogger();
  const clockState = { value: options.now || Date.parse("2026-07-19T10:00:00.000Z") };
  const clock = options.clock || (() => clockState.value);
  const app = createApp({
    config,
    db,
    logger,
    clock,
    fetchImpl: options.fetchImpl,
    rateLimitEnabled: options.rateLimitEnabled ?? false,
    tokenService: options.tokenService,
    sevisPassService: options.sevisPassService,
    serveFrontend: false,
  });
  return {
    app,
    api: request(app),
    db,
    config,
    logger,
    clockState,
    close: () => db.close(),
  };
}

function signToken(config, claims = {}, options = {}) {
  return jwt.sign(
    {
      sub: "sevis-user-123",
      name: "Verified Citizen",
      email: "citizen@example.test",
      nonce: claims.nonce,
      ...claims,
    },
    config.jwtSecret,
    {
      algorithm: "HS256",
      audience: config.clientId,
      expiresIn: options.expiresIn || "5m",
      ...(config.ssoIssuer ? { issuer: config.ssoIssuer } : {}),
    }
  );
}

module.exports = { makeConfig, makeContext, signToken, silentLogger };
