const { ConfigurationError } = require("./errors");

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new ConfigurationError(`Invalid boolean value: ${value}`);
}

function parsePositiveInt(value, fallback, name) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigurationError(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseUrl(value, name, { required = true } = {}) {
  if (!value) {
    if (required) throw new ConfigurationError(`${name} is required.`);
    return null;
  }
  try {
    return new URL(value);
  } catch {
    throw new ConfigurationError(`${name} must be a valid absolute URL.`);
  }
}

function parseOrigin(value, name) {
  const url = parseUrl(value, name);
  if (value !== url.origin || url.username || url.password) {
    throw new ConfigurationError(`${name} must contain only scheme, hostname and port, with no trailing slash, path, query or fragment.`);
  }
  return url.origin;
}

function parseCsv(value, fallback = []) {
  const source = value == null ? fallback : String(value).split(",");
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))];
}

function ensureHttpPolicy(url, name, { nodeEnv, allowInsecureHttp }) {
  if (!url || url.protocol !== "http:") return;
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (nodeEnv === "production" && !allowInsecureHttp) {
    throw new ConfigurationError(`${name} must use HTTPS in production. Set ALLOW_INSECURE_HTTP=true only for an explicitly approved local deployment.`);
  }
  if (!isLocalhost && !allowInsecureHttp) {
    throw new ConfigurationError(`${name} may use HTTP only for localhost development unless ALLOW_INSECURE_HTTP=true.`);
  }
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const mockMode = parseBoolean(env.MOCK_MODE, true);
  const allowInsecureHttp = parseBoolean(env.ALLOW_INSECURE_HTTP, false);

  const port = parsePositiveInt(env.PORT, 3001, "PORT");
  const stateExpiryMinutes = parsePositiveInt(env.STATE_EXPIRY_MINUTES, 10, "STATE_EXPIRY_MINUTES");
  const appSessionMinutes = parsePositiveInt(env.APP_SESSION_MINUTES, 480, "APP_SESSION_MINUTES");
  const requestTimeoutMs = parsePositiveInt(env.SSO_TIMEOUT_MS, 12000, "SSO_TIMEOUT_MS");

  const ssoServerUrlRaw = env.OIDC4VP_SERVER_URL || env.SEVISPASS_SERVER_URL || "";
  const clientId = env.CLIENT_ID || env.SEVISPASS_CLIENT_ID || "";
  const clientSecret = env.CLIENT_SECRET || env.SEVISPASS_CLIENT_SECRET || "";
  const callbackUrlRaw = env.CALLBACK_URL || env.SEVISPASS_CALLBACK_URL || "";
  const ssoRequestOriginRaw = env.SSO_REQUEST_ORIGIN || "";
  const appOriginRaw = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || "http://localhost:5173";
  const authSuccessUrlRaw = env.AUTH_SUCCESS_URL || `${appOriginRaw}/#/auth/complete`;
  const authFailureUrlRaw = env.AUTH_FAILURE_URL || `${appOriginRaw}/#/login`;

  const requiredLive = [
    ["OIDC4VP_SERVER_URL", ssoServerUrlRaw],
    ["CLIENT_ID", clientId],
    ["CLIENT_SECRET", clientSecret],
    ["CALLBACK_URL", callbackUrlRaw],
    ["SSO_REQUEST_ORIGIN", ssoRequestOriginRaw],
    ["AUTH_SUCCESS_URL", authSuccessUrlRaw],
  ];
  if (!mockMode) {
    const missing = requiredLive.filter(([, value]) => !String(value || "").trim()).map(([name]) => name);
    if (missing.length) throw new ConfigurationError(`Live mode is missing required configuration: ${missing.join(", ")}.`);
  }

  const ssoUrl = ssoServerUrlRaw ? parseUrl(ssoServerUrlRaw, "OIDC4VP_SERVER_URL") : null;
  const callbackUrl = callbackUrlRaw ? parseUrl(callbackUrlRaw, "CALLBACK_URL") : null;
  const appOrigin = parseOrigin(appOriginRaw, "APP_ORIGIN");
  const ssoRequestOrigin = ssoRequestOriginRaw ? parseOrigin(ssoRequestOriginRaw, "SSO_REQUEST_ORIGIN") : (mockMode ? appOrigin : null);
  const authSuccessUrl = parseUrl(authSuccessUrlRaw, "AUTH_SUCCESS_URL");
  const authFailureUrl = parseUrl(authFailureUrlRaw, "AUTH_FAILURE_URL");

  ensureHttpPolicy(callbackUrl, "CALLBACK_URL", { nodeEnv, allowInsecureHttp });
  ensureHttpPolicy(authSuccessUrl, "AUTH_SUCCESS_URL", { nodeEnv, allowInsecureHttp });
  ensureHttpPolicy(authFailureUrl, "AUTH_FAILURE_URL", { nodeEnv, allowInsecureHttp });

  const allowedOrigins = parseCsv(env.ALLOWED_ORIGINS || env.CORS_ORIGIN, [appOrigin]).map((origin) => parseOrigin(origin, "ALLOWED_ORIGINS entry"));
  const allowedCallbackUrls = parseCsv(env.ALLOWED_CALLBACK_URLS, callbackUrl ? [callbackUrl.href] : []);
  for (const item of allowedCallbackUrls) parseUrl(item, "ALLOWED_CALLBACK_URLS entry");

  const ssoBase = ssoUrl ? ssoUrl.href.replace(/\/+$/, "") : "";
  const jwksUri = env.SSO_JWKS_URI || env.JWKS_URI || (ssoBase ? `${ssoBase}/.well-known/jwks.json` : "");

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === "production",
    port,
    mockMode,
    dbPath: env.DB_PATH || undefined,
    ssoServerUrl: ssoBase,
    authorizeUrl: ssoBase ? `${ssoBase}/api/auth/third-party/authorize` : "",
    clientId,
    clientSecret,
    callbackUrl: callbackUrl ? callbackUrl.href : "",
    allowedCallbackUrls,
    appOrigin,
    ssoRequestOrigin,
    authSuccessUrl: authSuccessUrl.href,
    authFailureUrl: authFailureUrl.href,
    jwksUri,
    jwtSecret: env.JWT_SECRET || "",
    ssoIssuer: env.SSO_ISSUER || "",
    // The single SevisPass UID (the `sub` claim) that is the system administrator.
    // Whoever signs in with this UID becomes admin; there is exactly one.
    adminSub: (env.ADMIN_SEVIS_UID || env.ADMIN_SUB || "").trim(),
    allowedOrigins,
    stateExpiryMinutes,
    appSessionMinutes,
    cookieSecure: parseBoolean(env.COOKIE_SECURE, nodeEnv === "production"),
    trustProxy: parsePositiveInt(env.TRUST_PROXY, 1, "TRUST_PROXY"),
    logLevel: env.LOG_LEVEL || "info",
    requestTimeoutMs,
    authRateLimitMax: parsePositiveInt(env.AUTH_RATE_LIMIT_MAX, 20, "AUTH_RATE_LIMIT_MAX"),
    pollRateLimitMax: parsePositiveInt(env.POLL_RATE_LIMIT_MAX, 40, "POLL_RATE_LIMIT_MAX"),
    generalRateLimitMax: parsePositiveInt(env.GENERAL_RATE_LIMIT_MAX, 200, "GENERAL_RATE_LIMIT_MAX"),
    securityContact: env.SECURITY_CONTACT || "mailto:security@eduverify.example.pg",
    bodyLimit: env.BODY_LIMIT || "256kb",
  });
}

function safeConfigSummary(config) {
  return {
    mode: config.mockMode ? "MOCK" : "LIVE",
    ssoServer: config.ssoServerUrl || "not configured",
    clientId: config.clientId || "not configured",
    callback: config.callbackUrl || "not configured",
    requestOrigin: config.ssoRequestOrigin || "not configured",
    successRedirect: config.authSuccessUrl,
    jwks: config.jwksUri || "not configured",
  };
}

module.exports = { loadConfig, safeConfigSummary, parseOrigin };
