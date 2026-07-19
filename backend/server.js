/* ============================================================
   APPLICATION TIER — EduVerify PNG backend API (Express).

   This server is the trust boundary. The browser only ever talks to these
   /api routes; the SevisPass client secret lives in .env and never leaves
   the server. Every OIDC login is bound to a server-issued `state` (CSRF)
   and `nonce` (replay) stored in SQLite.

   MOCK_MODE=true simulates the SSO server in-process (complete a login with
   POST /api/auth/simulate-scan). Set MOCK_MODE=false to proxy real OIDC4VP
   calls to SEVISPASS_SERVER_URL.
   ============================================================ */
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const QRCode = require("qrcode");
const { v4: uuid } = require("uuid");
const { queries } = require("./db");

const PORT = process.env.PORT || 3001;
const MOCK_MODE = String(process.env.MOCK_MODE || "true").toLowerCase() === "true";
const STATE_EXPIRY_MINUTES = parseInt(process.env.STATE_EXPIRY_MINUTES || "10", 10);

// Config keys follow the DICT Integration Guide's canonical names
// (OIDC4VP_SERVER_URL / CLIENT_ID / CLIENT_SECRET / CALLBACK_URL), while still
// accepting the SEVISPASS_* aliases used by earlier config.
const SSO_SERVER_URL   = (process.env.OIDC4VP_SERVER_URL  || process.env.SEVISPASS_SERVER_URL || "").replace(/\/+$/, "");
const CLIENT_ID        = process.env.CLIENT_ID            || process.env.SEVISPASS_CLIENT_ID;
const CLIENT_SECRET    = process.env.CLIENT_SECRET        || process.env.SEVISPASS_CLIENT_SECRET;
const CALLBACK_URL     = process.env.CALLBACK_URL         || process.env.SEVISPASS_CALLBACK_URL;

// How the SSO's VP token (a JWT) is verified in live mode. Provide EITHER a JWKS
// endpoint (asymmetric RS256/ES256 — preferred) OR a shared HS256 secret. If
// neither is set, live-mode logins FAIL CLOSED (we never trust an unverified
// token or client-supplied identity).
let SSO_JWKS_URI = process.env.SSO_JWKS_URI || process.env.JWKS_URI;
const JWT_SECRET   = process.env.JWT_SECRET;
if (!MOCK_MODE && !SSO_JWKS_URI && !JWT_SECRET && SSO_SERVER_URL) {
  // Standard OIDC discovery location; override with SSO_JWKS_URI if DICT
  // publishes keys elsewhere. Verification still fails closed if this endpoint
  // doesn't serve the signing keys.
  SSO_JWKS_URI = `${SSO_SERVER_URL}/.well-known/jwks.json`;
  console.log(`[config] SSO_JWKS_URI not set — auto-discovering signing keys at ${SSO_JWKS_URI}`);
}
const jwks = SSO_JWKS_URI
  ? jwksClient({ jwksUri: SSO_JWKS_URI, cache: true, rateLimit: true })
  : null;

// DICT guide: register your domain(s) in ALLOWED_ORIGINS and callback(s) in
// ALLOWED_CALLBACK_URLS. APP_ORIGIN is the value sent as the Origin header on
// every call to the SSO server (required for the SSO's CORS validation).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ALLOWED_CALLBACK_URLS = (process.env.ALLOWED_CALLBACK_URLS || CALLBACK_URL || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const APP_ORIGIN = process.env.APP_ORIGIN || ALLOWED_ORIGINS[0];
// Where security researchers should report issues (RFC 9116). Set a real address.
const SECURITY_CONTACT = process.env.SECURITY_CONTACT || "mailto:security@eduverify.example.pg";

if (!MOCK_MODE) {
  const missing = [["OIDC4VP_SERVER_URL", SSO_SERVER_URL], ["CLIENT_ID", CLIENT_ID], ["CLIENT_SECRET", CLIENT_SECRET], ["CALLBACK_URL", CALLBACK_URL]].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) console.error(`[config] LIVE mode is missing: ${missing.join(", ")} — logins will fail until these are set in backend/.env`);
  else console.log(`[config] LIVE mode — SSO ${SSO_SERVER_URL} · client ${CLIENT_ID} · callback ${CALLBACK_URL}`);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // so rate-limit sees the real client IP behind a proxy

// Content-Security-Policy. The app is fully self-contained: same-origin bundle,
// data:-URI images, an inline-injected SVG QR, and React/Tailwind inline styles
// (hence style-src 'unsafe-inline' — required for React style props; scripts stay
// strict 'self'). No external hosts are loaded, so everything else is 'self'.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",          // blob: for the html5-qrcode camera scanner
  "media-src 'self' blob:",              // camera video stream (verification portal)
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
].join("; ");

// Security headers on every response. HSTS only engages over HTTPS (ignored on
// plain-http localhost dev).
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  // camera=(self) enables the QR scanner on the verification portal; everything
  // else stays denied (balanced relaxation — see the DICT compliance note).
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  next();
});

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: "1mb" }));

// Tiered rate limiting (DICT "Rate Limiting"):
//  - authLimiter: strict on the sensitive endpoints (anti-brute-force / abuse).
//  - pollLimiter: generous, per-minute, so the 2s status polling during a login
//    is never throttled (a single login can poll ~300x over a 10-min wait).
//  - generalLimiter: moderate default for the read endpoints.
const mk = (windowMs, max) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
const authLimiter    = mk(15 * 60 * 1000, 20);  // 20 / 15 min
const pollLimiter    = mk(60 * 1000, 40);        // 40 / min
const generalLimiter = mk(15 * 60 * 1000, 200);  // 200 / 15 min

app.use("/api/session/status", pollLimiter);
app.use("/api/auth/initiate", authLimiter);
app.use("/api/auth/simulate-scan", authLimiter);
app.use("/api/auth/callback", authLimiter);
// Everything else under /api gets the general limiter — but skip the paths that
// already have a dedicated limiter above (so each endpoint has exactly one).
const SPECIFIC = new Set(["/session/status", "/auth/initiate", "/auth/simulate-scan", "/auth/callback"]);
app.use("/api/", (req, res, next) =>
  SPECIFIC.has(req.path) ? next() : generalLimiter(req, res, next));

/* -------------------------------------------------------------- helpers */
const nowIso = () => new Date().toISOString();
const expiryIso = () => new Date(Date.now() + STATE_EXPIRY_MINUTES * 60_000).toISOString();
const purgeExpired = () => queries.deleteExpiredSessions.run({ now: nowIso() });
const isExpired = (s) => !s || new Date(s.expires_at).getTime() < Date.now();

// Verify the SSO's VP token (JWT) and return its claims. Enforces signature
// (JWKS RS256/ES256, or HS256 secret), audience, and the anti-replay nonce.
// Throws if verification isn't configured — live mode must FAIL CLOSED rather
// than trust an unverified token or a client-supplied identity.
function verifyVpToken(token, expectedNonce) {
  return new Promise((resolve, reject) => {
    if (!token) return reject(new Error("missing vp_token"));
    const check = (err, payload) => {
      if (err) return reject(err);
      if (expectedNonce && payload.nonce !== expectedNonce) {
        return reject(new Error("nonce mismatch (possible replay)"));
      }
      if (!payload.sub) return reject(new Error("token has no subject"));
      resolve(payload);
    };
    const audience = CLIENT_ID || undefined;
    if (jwks) {
      const getKey = (header, cb) =>
        jwks.getSigningKey(header.kid, (e, key) => cb(e, e ? null : key.getPublicKey()));
      jwt.verify(token, getKey, { algorithms: ["RS256", "ES256"], audience }, check);
    } else if (JWT_SECRET) {
      jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"], audience }, check);
    } else {
      reject(new Error("token verification not configured (set SSO_JWKS_URI or JWT_SECRET)"));
    }
  });
}

/* ------------------------------------------------------------- GET /health */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: MOCK_MODE ? "mock" : "live", db: "connected" });
});

/* --------------------------------------------------- POST /auth/initiate
   Issue a fresh session (state/nonce/sessionId), persist it with a 10-min
   expiry, and return a REAL scannable SVG QR code. In live mode the QR is
   obtained by proxying the authorize call to SevisPass with the client
   secret attached server-side. */
app.post("/api/auth/initiate", async (req, res) => {
  try {
    purgeExpired();
    const state = uuid();
    const nonce = uuid();
    const sessionId = uuid();
    queries.createSession.run({ id: sessionId, state, nonce, expires_at: expiryIso() });

    if (MOCK_MODE) {
      // The wallet payload the QR encodes (OpenID4VP presentation request).
      const payload =
        `openid4vp://authorize?client_id=${encodeURIComponent(CLIENT_ID || "eduverify-png")}` +
        `&session=${sessionId}&state=${state}&nonce=${nonce}`;
      const qrCode = await QRCode.toString(payload, { type: "svg", margin: 1, width: 220 });
      return res.json({ qrCode, sessionId, state, mode: "mock" });
    }

    // Live mode: proxy to the SSO authorization server. The secret is attached
    // here and NEVER sent to the browser. Per the DICT guide, the Origin header
    // MUST be present for the SSO's CORS validation (its absence surfaces as an
    // "Invalid client credentials" error).
    const upstream = await fetch(`${SSO_SERVER_URL}/api/auth/third-party/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-ID": CLIENT_ID,
        "X-Client-Secret": CLIENT_SECRET,
        "Origin": APP_ORIGIN,
      },
      body: JSON.stringify({ callback_url: CALLBACK_URL, state, nonce }),
    });
    if (!upstream.ok) throw new Error(`SevisPass authorize failed (${upstream.status})`);
    const data = await upstream.json();
    // Prefer the upstream QR (already a scannable SVG per the guide); fall back
    // to encoding the returned request URI ourselves.
    const qrCode = data.qrCode || (await QRCode.toString(data.requestUri || "", { type: "svg", margin: 1, width: 220 }));
    return res.json({ qrCode, sessionId, state, mode: "live" });
  } catch (err) {
    console.error("[initiate]", err.message);
    res.status(502).json({ error: "Failed to initiate SevisPass authentication" });
  }
});

/* ------------------------------------------- GET /session/status?session= */
app.get("/api/session/status", (req, res) => {
  const s = queries.getSession.get(req.query.session || "");
  if (isExpired(s)) return res.json({ authenticated: false, userId: null });
  res.json({ authenticated: !!s.authenticated, userId: s.user_id || null });
});

/* ----------------------------------------------------- GET /user?session=
   Returns the verified identity AND the session `state` so the frontend can
   confirm it matches the state it stashed at initiate time (CSRF check).
   SINGLE USE: the session is consumed (deleted) once the identity is handed
   off, so a leaked session handle can't be replayed to re-fetch the identity. */
app.get("/api/user", (req, res) => {
  const s = queries.getSession.get(req.query.session || "");
  if (isExpired(s)) return res.status(410).json({ error: "session expired" });
  if (!s.authenticated || !s.user_id) return res.status(401).json({ error: "not authenticated" });

  // Resolve the identity. LIVE: a real federated subject won't exist in our DB,
  // so return the claims from the already-verified VP token — mirroring the DICT
  // guide's /api/user shape (sub, name, email, ageOver18, validUntil, credentials).
  // MOCK: return the chosen seeded persona.
  let user;
  if (!MOCK_MODE && s.vp_token) {
    const c = jwt.decode(s.vp_token) || {}; // already signature/nonce-verified at callback
    user = {
      sub: c.sub, name: c.name, email: c.email,
      ageOver18: c.ageOver18, validUntil: c.validUntil, credentials: c.credentials,
    };
  } else {
    user = queries.getUserById.get(s.user_id);
  }
  if (!user || !(user.sub || user.id)) return res.status(404).json({ error: "user not found" });

  queries.deleteSession.run(s.id); // consume: identity is handed off exactly once
  res.json({ user, sessionId: s.id, state: s.state });
});

/* ------------------------------------- POST /auth/simulate-scan (mock only)
   Prototype shortcut: complete the login for a chosen persona without a real
   wallet. Disabled when MOCK_MODE is false. */
app.post("/api/auth/simulate-scan", (req, res) => {
  if (!MOCK_MODE) return res.status(403).json({ error: "simulate-scan is disabled in live mode" });
  const { sessionId, userId } = req.body || {};
  const s = queries.getSession.get(sessionId || "");
  if (isExpired(s)) return res.status(410).json({ error: "session expired or unknown" });
  const user = queries.getUserById.get(userId || "");
  if (!user) return res.status(404).json({ error: "unknown user" });
  queries.authenticateSession.run({ id: sessionId, user_id: userId });
  res.json({ ok: true, sessionId, userId });
});

/* ---------------------------------------- POST /auth/callback (live mode)
   SevisPass posts here after the wallet presents the credential. Security:
     1. `state` must match a live session (CSRF binding).
     2. redirect target must be on the allowlist (open-redirect guard).
     3. the vp_token JWT is cryptographically VERIFIED (signature + audience +
        nonce). Identity is taken ONLY from the verified token's `sub` — never
        from client-supplied `userId`/`sub` fields. Fails closed. */
app.post("/api/auth/callback", async (req, res) => {
  if (MOCK_MODE) return res.status(403).json({ error: "callback is only used in live mode" });
  const { state, vp_token, redirect_uri } = { ...req.query, ...req.body };
  const s = queries.getSessionByState.get(state || "");
  if (isExpired(s)) return res.status(400).json({ error: "invalid or expired state" });
  if (redirect_uri && ALLOWED_CALLBACK_URLS.length && !ALLOWED_CALLBACK_URLS.includes(redirect_uri)) {
    return res.status(400).json({ error: "redirect_uri not allowed" });
  }
  try {
    // Verify signature + audience + nonce, and trust ONLY the token's subject.
    const claims = await verifyVpToken(vp_token, s.nonce);
    queries.setSessionVpToken.run({ id: s.id, vp_token, user_id: claims.sub });
    return res.redirect(`${APP_ORIGIN}/#/auth/complete?session=${s.id}`);
  } catch (err) {
    console.error("[callback] token verification failed:", err.message);
    return res.status(401).json({ error: "credential verification failed" });
  }
});

/* ---------------------------------------------- POST /auth/logout
   DICT "Token Storage": clear tokens on logout. Deletes the session (and its
   stored VP/access token) so it can no longer be used. */
app.post("/api/auth/logout", (req, res) => {
  const sessionId = (req.body && req.body.sessionId) || req.query.session;
  if (sessionId) queries.deleteSession.run(sessionId);
  res.json({ ok: true });
});

/* ---------------------------------------------- GET /records/:studentId */
app.get("/api/records/:studentId", (req, res) => {
  const records = queries.getRecordsByStudent.all(req.params.studentId);
  res.json({ studentId: req.params.studentId, records });
});

/* ----------------------------------------------------- GET /institutions */
app.get("/api/institutions", (_req, res) => {
  res.json({ institutions: queries.getAllInstitutions.all() });
});

/* -------------------------------------- RFC 9116 security.txt
   A designated, machine-readable channel for reporting vulnerabilities. Served
   explicitly so the SPA fallback doesn't answer it with index.html. */
app.get(["/.well-known/security.txt", "/security.txt"], (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  res.type("text/plain").send(
    [
      `Contact: ${SECURITY_CONTACT}`,
      "Expires: 2027-01-01T00:00:00Z",
      "Preferred-Languages: en",
      `Canonical: ${base}/.well-known/security.txt`,
      "",
    ].join("\n")
  );
});

/* -------------------------------------------- serve the built frontend
   Single-service deploy (Render): this same process serves the Vite build so
   the frontend and API share one origin (no CORS, no cross-service URL). Only
   mounts if a build exists — in local dev the Vite server handles the UI and
   proxies /api here instead. Must come AFTER all /api routes. */
const DIST = path.join(__dirname, "..", "dist");
if (fs.existsSync(path.join(DIST, "index.html"))) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
      return res.sendFile(path.join(DIST, "index.html"));
    }
    next();
  });
  console.log("[static] serving frontend build from", DIST);
}

/* ---------------------------------------------------------------- start */
app.listen(PORT, () => {
  console.log(`EduVerify PNG backend listening on :${PORT} (${MOCK_MODE ? "MOCK" : "LIVE"} mode)`);
  if (MOCK_MODE) {
    console.warn(
      "[SECURITY] MOCK_MODE is ON: /api/auth/simulate-scan lets ANYONE sign in as " +
      "ANY persona (including admin). This is for staging/demo ONLY — set " +
      "MOCK_MODE=false before exposing real credential data."
    );
  } else if (!jwks && !JWT_SECRET) {
    console.warn(
      "[SECURITY] LIVE mode but no SSO_JWKS_URI or JWT_SECRET configured — " +
      "VP tokens cannot be verified, so all logins will FAIL CLOSED. Configure " +
      "token verification before going live."
    );
  }
});

module.exports = app;
