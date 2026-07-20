const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const QRCode = require("qrcode");
const { createSevisPassService } = require("./services/sevispass.service");
const { createTokenService } = require("./services/token.service");
const { AppError, ValidationError, SsoCallbackError } = require("./errors");
const { notFoundHandler, errorHandler } = require("./middleware/error-handler");

const SESSION_COOKIE = "eduverify_session";

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function plusMinutesIso(clock, minutes) {
  return new Date(clock() + minutes * 60_000).toISOString();
}

function secureRandom() {
  return crypto.randomBytes(32).toString("base64url");
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf("=");
      return index < 0 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    })
  );
}

function sessionCookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: config.appSessionMinutes * 60_000,
  };
}

function buildFragmentRedirect(base, params) {
  const url = new URL(base);
  const hash = url.hash || "#";
  const separator = hash.includes("?") ? "&" : "?";
  url.hash = `${hash}${separator}${new URLSearchParams(params).toString()}`;
  return url.href;
}

/* Normalise a SevisPass UID for comparison: trim, lowercase, and drop a
   leading did:...: or urn:...: scheme prefix. This prevents a registrar or
   admin from being silently demoted to student just because the SSO returns
   the same subject in a slightly different format than what was registered. */
function canonUid(value) {
  if (value === undefined || value === null) return "";
  let s = String(value).trim().toLowerCase();
  const colon = s.lastIndexOf(":");
  if ((s.startsWith("did:") || s.startsWith("urn:")) && colon !== -1) s = s.slice(colon + 1);
  return s;
}

/* Resolve the signed-in identity's ROLE from their SevisPass UID (the `sub`
   claim), in priority order:
     1. the one configured admin UID           -> system administrator
     2. an APPROVED institution's registrar UID -> that institution's registrar
     3. a pending institution's registrar UID   -> student, but flagged pending
     4. an already-provisioned non-student user  -> keep that role
     5. everyone else                            -> student
   There is exactly one admin: whoever signs in with config.adminSub. */
function normalizeUser(db, transaction, config, logger) {
  const claims = JSON.parse(transaction.claims_json || "{}");
  const sub = claims.sub;
  const canon = canonUid(sub);
  const baseName = claims.name || "SevisPass User";
  const email = claims.email || "";

  // 1) The single system administrator (compared case/format-insensitively).
  if (config && config.adminSub && canon && canon === canonUid(config.adminSub)) {
    logger?.info("[role] resolved ADMIN by UID", { sub });
    return {
      id: transaction.user_id, sub, role: "admin", instId: null,
      name: baseName, email, tier: "SevisPass — system administrator", live: true,
    };
  }

  // 2/3) A registrar UID bound to an institution during registration.
  //      Try an exact lookup first, then a canonical scan so format differences
  //      (case, did: prefix) still match.
  let inst = db.getInstitutionByRegistrarUid ? db.getInstitutionByRegistrarUid(sub) : null;
  if (!inst && canon && db.listInstitutions) {
    inst = db.listInstitutions().find((i) => canonUid(i.registrarUid) === canon) || null;
  }
  if (inst) {
    if (inst.status === "approved") {
      logger?.info("[role] resolved REGISTRAR by UID", { sub, institution: inst.id });
      return {
        id: transaction.user_id, sub, role: "institution", instId: inst.id,
        name: inst.registrarName || baseName, email,
        tier: "SevisPass — verified registrar", live: true,
      };
    }
    logger?.info("[role] registrar UID recognised but institution PENDING", { sub, institution: inst.id });
    return {
      id: transaction.user_id, sub, role: "student", instId: null,
      name: baseName, email, tier: "SevisPass — verified citizen",
      pendingInstitution: { id: inst.id, name: inst.name }, live: true,
    };
  }

  // 4) A previously provisioned account (seeded registrar/admin) keyed by UID.
  const provisioned = db.getUserBySub ? db.getUserBySub(sub) : null;
  if (provisioned && provisioned.role && provisioned.role !== "student") {
    logger?.info("[role] resolved provisioned non-student by sub", { sub, role: provisioned.role });
    return provisioned;
  }

  const existing = db.getUserById(transaction.user_id);
  if (existing && existing.role && existing.role !== "student") return existing;

  // 5) Default: a verified citizen is a student.
  logger?.info("[role] no admin/registrar match — defaulting to STUDENT", { sub });
  return {
    id: transaction.user_id || sub, sub, role: "student", instId: null,
    name: baseName, email, tier: "SevisPass — verified citizen", live: true,
  };
}

function claimsFromUpstreamUser(payload) {
  const user = payload?.user && typeof payload.user === "object" ? payload.user : payload;
  if (!user || typeof user !== "object") {
    throw new AppError("SSO_USER_INVALID", "SevisPass returned no authenticated user.", { status: 502 });
  }
  const sub = user.sub || user.id || user.did;
  if (!sub) {
    throw new AppError("SSO_USER_SUBJECT_MISSING", "SevisPass returned a user without a subject identifier.", { status: 502 });
  }
  return {
    sub: String(sub),
    name: user.name || user.fullName || user.displayName || "SevisPass User",
    email: user.email || undefined,
    ageOver18: user.ageOver18,
    validUntil: user.validUntil,
    credentials: user.credentials,
    iss: user.iss,
    aud: user.aud,
  };
}

function createRateLimiter(max, windowMs = 15 * 60 * 1000) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } },
  });
}

function createApp({
  config,
  db,
  fetchImpl = global.fetch,
  logger,
  clock = Date.now,
  rateLimitEnabled = true,
  tokenService,
  sevisPassService,
  serveFrontend = true,
} = {}) {
  if (!config) throw new TypeError("config is required");
  if (!db) throw new TypeError("db is required");

  const sso = sevisPassService || createSevisPassService({ config, fetchImpl, logger });
  const tokens = tokenService || createTokenService({ config });
  const upstreamSyncs = new Map();
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
  ].join("; ");

  app.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=(), usb=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    next();
  });

  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new AppError("CORS_ORIGIN_DENIED", "The request origin is not permitted.", { status: 403 }));
    },
  }));
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: config.bodyLimit }));

  if (rateLimitEnabled) {
    app.use("/api/auth/initiate", createRateLimiter(config.authRateLimitMax));
    app.use("/api/auth/simulate-scan", createRateLimiter(config.authRateLimitMax));
    app.use("/api/auth/callback", createRateLimiter(config.authRateLimitMax));
    app.use("/api/session/status", createRateLimiter(config.pollRateLimitMax, 60 * 1000));
    app.use("/api", createRateLimiter(config.generalRateLimitMax));
  }

  const setSessionCookie = (res, sessionId) => res.cookie(SESSION_COOKIE, sessionId, sessionCookieOptions(config));
  const clearSessionCookie = (res) => res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/" });

  function readActiveAppSession(req) {
    const id = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!id) return null;
    const session = db.getAppSession(id);
    if (!session || session.revoked_at || Date.parse(session.expires_at) <= clock()) return null;
    return session;
  }

  function requireSession(req, _res, next) {
    const session = readActiveAppSession(req);
    if (!session) return next(new AppError("SESSION_REQUIRED", "An authenticated session is required.", { status: 401 }));
    req.appSession = session;
    next();
  }

  async function syncUpstreamAuthentication(transaction) {
    if (config.mockMode || transaction.status !== "pending" || !transaction.upstream_session_id) return transaction;
    if (upstreamSyncs.has(transaction.id)) return upstreamSyncs.get(transaction.id);

    const work = (async () => {
      const upstreamStatus = await sso.getSessionStatus(transaction.upstream_session_id);
      logger?.info("[sso] wallet status checked", {
        transactionId: transaction.id,
        status: upstreamStatus?.status || "pending",
        authenticated: Boolean(upstreamStatus?.authenticated),
      });
      if (!upstreamStatus?.authenticated) return db.getAuthTransaction(transaction.id);

      // Some SevisPass deployments include the verified identity in the status
      // response; others require a second /api/user request. Support both.
      const upstreamUser = upstreamStatus.user
        ? { user: upstreamStatus.user }
        : await sso.getUser(transaction.upstream_session_id);
      const claims = claimsFromUpstreamUser(upstreamUser);
      const appSessionId = crypto.randomUUID();
      const completed = db.completeAuthentication({
        transactionId: transaction.id,
        claims,
        appSessionId,
        now: nowIso(clock),
        sessionExpiresAt: plusMinutesIso(clock, config.appSessionMinutes),
      });
      const current = completed?.transaction || db.getAuthTransaction(transaction.id);
      logger?.info("[sso] wallet authentication completed", {
        transactionId: transaction.id,
        userId: current?.user_id || null,
      });
      return current;
    })().finally(() => upstreamSyncs.delete(transaction.id));

    upstreamSyncs.set(transaction.id, work);
    return work;
  }

  function healthHandler(_req, res) {
    try {
      db.raw.prepare("SELECT 1 AS ok").get();
      return res.json({ ok: true, mode: config.mockMode ? "mock" : "live", services: { database: "healthy", sso: "not-probed" } });
    } catch {
      return res.status(503).json({ ok: false, mode: config.mockMode ? "mock" : "live", services: { database: "unhealthy", sso: "not-probed" } });
    }
  }

  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  app.post("/api/auth/initiate", async (_req, res, next) => {
    try {
      const createdAt = nowIso(clock);
      db.expireTransactions(createdAt);
      db.purgeExpired(createdAt);

      const transaction = {
        id: crypto.randomUUID(),
        state: secureRandom(),
        nonce: secureRandom(),
        createdAt,
        expiresAt: plusMinutesIso(clock, config.stateExpiryMinutes),
      };
      db.createAuthTransaction(transaction);

      if (config.mockMode) {
        const payload = `openid4vp://authorize?client_id=${encodeURIComponent(config.clientId || "eduverify-png")}&session=${encodeURIComponent(transaction.id)}&state=${encodeURIComponent(transaction.state)}&nonce=${encodeURIComponent(transaction.nonce)}`;
        const qrCode = await QRCode.toString(payload, { type: "svg", margin: 1, width: 220 });
        return res.status(201).json({ qrCode, sessionId: transaction.id, state: transaction.state, mode: "mock", expiresAt: transaction.expiresAt });
      }

      const upstream = await sso.initiateAuthorization({ state: transaction.state, nonce: transaction.nonce });
      const upstreamSessionId = upstream.sessionId || upstream.session_id;
      const requestUri = upstream.requestUri || upstream.request_uri || upstream.authorizationUrl || upstream.authorization_url || upstream.deepLink || upstream.deep_link;
      const qrCode = upstream.qrCode || upstream.qr_code || (requestUri ? await QRCode.toString(requestUri, { type: "svg", margin: 1, width: 220 }) : null);
      if (!qrCode && !requestUri) {
        throw new AppError("SSO_QR_MISSING", "SevisPass accepted the request but did not return QR or authorization data.", { status: 502 });
      }
      if (!upstreamSessionId) {
        throw new AppError("SSO_SESSION_MISSING", "SevisPass accepted the request but did not return the session ID required for status polling.", { status: 502 });
      }
      if (!db.setUpstreamSessionId(transaction.id, String(upstreamSessionId))) {
        throw new AppError("AUTH_TRANSACTION_UPDATE_FAILED", "The authentication transaction could not store the SevisPass session.", { status: 500 });
      }
      return res.status(201).json({
        qrCode,
        requestUri: requestUri || undefined,
        sessionId: transaction.id,
        state: transaction.state,
        mode: "live",
        flow: "wallet",
        expiresAt: transaction.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/session/status", async (req, res, next) => {
    try {
      const sessionId = String(req.query.session || "");
      if (!sessionId) throw new ValidationError("SESSION_ID_REQUIRED", "The session query parameter is required.");
      let transaction = db.getAuthTransaction(sessionId);
      if (!transaction) return res.status(404).json({ status: "not_found", authenticated: false, userId: null });
      if (Date.parse(transaction.expires_at) <= clock() && transaction.status === "pending") {
        db.expireTransactions(nowIso(clock));
        return res.status(410).json({ status: "expired", authenticated: false, userId: null });
      }

      if (!config.mockMode && transaction.status === "pending" && transaction.upstream_session_id) {
        transaction = await syncUpstreamAuthentication(transaction);
      }
      if (transaction.status === "authenticated" && transaction.app_session_id) {
        setSessionCookie(res, transaction.app_session_id);
      }
      const authenticated = transaction.status === "authenticated";
      return res.json({
        status: transaction.status,
        authenticated,
        userId: authenticated ? transaction.user_id : null,
        // The frontend performs this navigation after it has fetched the user
        // and confirmed the application session cookie. A fetch() response
        // cannot redirect the visible browser tab by itself.
        redirectUrl: authenticated ? config.authSuccessUrl : null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/user", (req, res, next) => {
    try {
      const sessionId = String(req.query.session || "");
      if (!sessionId) throw new ValidationError("SESSION_ID_REQUIRED", "The session query parameter is required.");
      const transaction = db.getAuthTransaction(sessionId);
      if (!transaction) throw new AppError("AUTH_TRANSACTION_NOT_FOUND", "The authentication transaction was not found.", { status: 404 });
      if (Date.parse(transaction.expires_at) <= clock()) throw new AppError("AUTH_TRANSACTION_EXPIRED", "The authentication transaction has expired.", { status: 410 });
      if (transaction.status === "consumed") throw new AppError("AUTH_TRANSACTION_CONSUMED", "The authenticated identity has already been retrieved.", { status: 409 });
      if (transaction.status !== "authenticated" || !transaction.app_session_id) {
        throw new AppError("AUTHENTICATION_PENDING", "The wallet authentication has not completed.", { status: 401 });
      }
      const appSession = db.getAppSession(transaction.app_session_id);
      if (!appSession || appSession.revoked_at || Date.parse(appSession.expires_at) <= clock()) {
        throw new AppError("SESSION_EXPIRED", "The authenticated session has expired.", { status: 401 });
      }
      const user = normalizeUser(db, transaction, config, logger);
      if (!db.consumeAuthTransaction(transaction.id, nowIso(clock))) {
        throw new AppError("AUTH_TRANSACTION_REPLAYED", "The authentication transaction could not be consumed.", { status: 409 });
      }
      setSessionCookie(res, appSession.id);
      return res.json({ user, sessionId: transaction.id, state: transaction.state });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/simulate-scan", (req, res, next) => {
    try {
      if (!config.mockMode) throw new AppError("MOCK_AUTH_DISABLED", "The simulated wallet endpoint is disabled in live mode.", { status: 403 });
      const { sessionId, userId } = req.body || {};
      if (!sessionId || !userId) throw new ValidationError("SIMULATION_INPUT_REQUIRED", "sessionId and userId are required.");
      const transaction = db.getAuthTransaction(sessionId);
      if (!transaction) throw new AppError("AUTH_TRANSACTION_NOT_FOUND", "The authentication transaction was not found.", { status: 404 });
      if (Date.parse(transaction.expires_at) <= clock()) throw new AppError("AUTH_TRANSACTION_EXPIRED", "The authentication transaction has expired.", { status: 410 });
      if (transaction.status !== "pending") throw new AppError("AUTH_TRANSACTION_REPLAYED", "The authentication transaction is no longer pending.", { status: 409 });
      if (!db.getUserById(userId)) throw new AppError("USER_NOT_FOUND", "The selected prototype user does not exist.", { status: 404 });

      const completed = db.completeMockAuthentication({
        transactionId: sessionId,
        userId,
        appSessionId: crypto.randomUUID(),
        now: nowIso(clock),
        sessionExpiresAt: plusMinutesIso(clock, config.appSessionMinutes),
      });
      if (!completed) throw new AppError("AUTH_TRANSACTION_REPLAYED", "The authentication transaction could not be completed.", { status: 409 });
      return res.json({ ok: true, sessionId, userId });
    } catch (error) {
      next(error);
    }
  });

  async function callbackHandler(req, res) {
    const input = { ...req.query, ...(req.body || {}) };
    try {
      if (config.mockMode) throw new SsoCallbackError("LIVE_CALLBACK_DISABLED", "The SevisPass callback is disabled while MOCK_MODE=true.");
      if (input.error) throw new SsoCallbackError("SSO_ACCESS_DENIED", "SevisPass did not approve the authentication request.");
      if (!input.state) throw new SsoCallbackError("STATE_MISSING", "The callback did not include state.");
      const transaction = db.getAuthTransactionByState(String(input.state));
      if (!transaction) throw new SsoCallbackError("STATE_INVALID", "The callback state is unknown.");
      if (Date.parse(transaction.expires_at) <= clock()) throw new SsoCallbackError("STATE_EXPIRED", "The callback state has expired.");
      if (transaction.status !== "pending") throw new SsoCallbackError("STATE_REPLAYED", "The callback state has already been used.");

      const presentedToken = input.vp_token || input.id_token || input.token;
      const claims = await tokens.verify(presentedToken, transaction.nonce);
      const appSessionId = crypto.randomUUID();
      const completed = db.completeAuthentication({
        transactionId: transaction.id,
        claims,
        appSessionId,
        now: nowIso(clock),
        sessionExpiresAt: plusMinutesIso(clock, config.appSessionMinutes),
      });
      if (!completed) throw new SsoCallbackError("STATE_REPLAYED", "The callback state could not be completed.");

      setSessionCookie(res, appSessionId);
      const target = buildFragmentRedirect(config.authSuccessUrl, { session: transaction.id });
      return res.redirect(303, target);
    } catch (error) {
      const safeCode = error.code || "SSO_CALLBACK_FAILED";
      logger?.warn("[callback] authentication rejected", { code: safeCode, message: error.message });
      const target = buildFragmentRedirect(config.authFailureUrl, { error: safeCode });
      return res.redirect(303, target);
    }
  }

  app.get("/api/auth/callback", callbackHandler);
  app.post("/api/auth/callback", callbackHandler);

  app.get("/api/session/me", requireSession, (req, res, next) => {
    try {
      // Re-resolve the role from the SevisPass UID in the stored claims (admin /
      // registrar / student), so a page reload restores the SAME portal the user
      // signed into — not a flattened student view.
      const s = req.appSession;
      const user = s.claims_json
        ? normalizeUser(db, { user_id: s.user_id, claims_json: s.claims_json }, config, logger)
        : db.getUserById(s.user_id);
      if (!user) throw new AppError("USER_NOT_FOUND", "The authenticated user no longer exists.", { status: 404 });
      return res.json({ authenticated: true, user, expiresAt: s.expires_at });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const current = readActiveAppSession(req);
    if (current) db.revokeAppSession(current.id, nowIso(clock));
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/records/:studentId", (req, res) => {
    res.json({ studentId: req.params.studentId, records: db.getRecordsByStudent(req.params.studentId) });
  });

  app.get("/api/institutions", (_req, res) => {
    res.json({ institutions: db.listInstitutions() });
  });

  /* Resolve the role of the CURRENT app session by re-running the UID-based
     role resolver against its stored claims. Used to guard admin-only routes. */
  function currentUser(req) {
    const session = readActiveAppSession(req);
    if (!session) return null;
    return normalizeUser(db, { user_id: session.user_id, claims_json: session.claims_json }, config, logger);
  }
  function requireAdmin(req, _res, next) {
    const u = currentUser(req);
    if (!u || u.role !== "admin") return next(new AppError("ADMIN_REQUIRED", "System administrator access is required.", { status: 403 }));
    req.currentUser = u;
    next();
  }

  /* Who am I? Lets the frontend confirm the signed-in role (e.g. show the admin
     approval queue only to the admin). */
  app.get("/api/me", (req, res) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: "not signed in" });
    res.json({ user: u });
  });

  /* Register an institution. Captures the REGISTRAR'S SevisPass UID so that,
     once approved, that person's wallet login becomes this institution's
     registrar. Anyone may submit; it lands in the admin's pending queue. */
  app.post("/api/institutions/register", (req, res, next) => {
    try {
      const { name, kind, accreditationNo, registrarUid, registrarName, contact } = req.body || {};
      if (!name || !String(name).trim()) throw new ValidationError("INST_NAME_REQUIRED", "Institution name is required.");
      if (!registrarUid || !String(registrarUid).trim()) throw new ValidationError("REGISTRAR_UID_REQUIRED", "The registrar's SevisPass UID is required.");
      const uid = String(registrarUid).trim();
      if (db.getInstitutionByRegistrarUid(uid)) throw new ValidationError("REGISTRAR_UID_TAKEN", "That registrar UID is already linked to an institution.");
      const id = "inst-" + crypto.randomUUID().slice(0, 8);
      const institution = db.registerInstitution({
        id, name: String(name).trim(), kind: kind || null,
        accreditationNo: accreditationNo || null, registrarUid: uid,
        registrarName: registrarName || null, contact: contact || null,
      });
      logger?.info("[institution] registration submitted", { id, registrarUid: "received", status: "pending" });
      res.status(201).json({ institution });
    } catch (error) { next(error); }
  });

  /* Admin: approve a pending institution. On approval, the registrar UID is
     bound to the institution role so that person's next login is a registrar. */
  app.post("/api/admin/institutions/:id/approve", requireAdmin, (req, res, next) => {
    try {
      const inst = db.getInstitutionById(req.params.id);
      if (!inst) throw new AppError("INSTITUTION_NOT_FOUND", "Institution not found.", { status: 404 });
      db.setInstitutionStatus(inst.id, "approved");
      if (inst.registrarUid) {
        db.assignRole({
          id: `sevis:${inst.registrarUid}`, role: "institution", name: inst.registrarName || `${inst.name} Registrar`,
          sub: inst.registrarUid, tier: "SevisPass — verified registrar", instId: inst.id,
          updatedAt: nowIso(clock),
        });
      }
      logger?.info("[institution] approved", { id: inst.id, by: req.currentUser.sub ? "admin" : "admin" });
      res.json({ institution: db.getInstitutionById(inst.id) });
    } catch (error) { next(error); }
  });

  /* Admin: reassign the registrar responsible for an (approved) institution.
     Binds the institution to a new SevisPass UID and provisions that person as
     the registrar; the previous registrar is demoted back to student. */
  app.post("/api/admin/institutions/:id/registrar", requireAdmin, (req, res, next) => {
    try {
      const inst = db.getInstitutionById(req.params.id);
      if (!inst) throw new AppError("INSTITUTION_NOT_FOUND", "Institution not found.", { status: 404 });
      const { registrarUid, registrarName } = req.body || {};
      const uid = String(registrarUid || "").trim();
      if (!uid) throw new ValidationError("REGISTRAR_UID_REQUIRED", "The new registrar's SevisPass UID is required.");
      const clash = db.getInstitutionByRegistrarUid(uid);
      if (clash && clash.id !== inst.id) throw new ValidationError("REGISTRAR_UID_TAKEN", "That registrar UID is already linked to another institution.");
      const updated = db.reassignRegistrar(inst.id, {
        uid,
        name: registrarName || inst.registrarName || `${inst.name} Registrar`,
        updatedAt: nowIso(clock),
      });
      logger?.info("[institution] registrar reassigned", { id: inst.id });
      res.json({ institution: updated });
    } catch (error) { next(error); }
  });

  /* Admin: reject a pending institution (a reason may be supplied). */
  app.post("/api/admin/institutions/:id/reject", requireAdmin, (req, res, next) => {
    try {
      const inst = db.getInstitutionById(req.params.id);
      if (!inst) throw new AppError("INSTITUTION_NOT_FOUND", "Institution not found.", { status: 404 });
      db.setInstitutionStatus(inst.id, "rejected");
      logger?.info("[institution] rejected", { id: inst.id });
      res.json({ institution: db.getInstitutionById(inst.id), reason: (req.body && req.body.reason) || null });
    } catch (error) { next(error); }
  });

  app.get(["/.well-known/security.txt", "/security.txt"], (req, res) => {
    const base = `${req.protocol}://${req.get("host")}`;
    res.type("text/plain").send([
      `Contact: ${config.securityContact}`,
      "Expires: 2027-01-01T00:00:00Z",
      "Preferred-Languages: en",
      `Canonical: ${base}/.well-known/security.txt`,
      "",
    ].join("\n"));
  });

  if (serveFrontend) {
    const dist = path.join(__dirname, "..", "..", "dist");
    if (fs.existsSync(path.join(dist, "index.html"))) {
      app.use(express.static(dist));
      app.use((req, res, next) => {
        if (req.method === "GET" && !req.path.startsWith("/api/")) return res.sendFile(path.join(dist, "index.html"));
        next();
      });
      logger?.info("[static] serving frontend build", { dist });
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger, config.nodeEnv));

  return app;
}

module.exports = {
  createApp,
  SESSION_COOKIE,
  parseCookies,
  sessionCookieOptions,
  buildFragmentRedirect,
};
