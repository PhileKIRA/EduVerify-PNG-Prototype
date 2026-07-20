/* ============================================================
   APPLICATION TIER — SevisPass SSO integration (OIDC4VP), browser side.

   SECURITY: this module NEVER talks to the SevisPass server directly and
   holds NO client secret. Every call goes to our own backend under /api/*,
   which attaches the client secret server-side and brokers the OIDC4VP flow
   (see backend/server.js). The dev server proxies /api -> localhost:3001.

   Flow:
     initiateAuth()            POST /api/auth/initiate   -> { qrCode, sessionId, state }
                               (state is stashed in sessionStorage for the CSRF check)
     checkStatus(sessionId)    GET  /api/session/status  -> { authenticated, userId }
     getUser(sessionId)        GET  /api/user            -> { user, state }  (state verified)
     simulateScan(id, userId)  POST /api/auth/simulate-scan (prototype/mock only)
   ============================================================ */

const SEVISPASS_CONFIG = {
  // The backend decides mock vs. live (MOCK_MODE in backend/.env). This flag is
  // only used for the informational copy shown on the login screen.
  mock: false,
  // Local fallback is disabled by default because an SSO/configuration failure
  // must never silently become a simulated successful login.
  allowLocalFallback: Boolean(import.meta.env && import.meta.env.VITE_ALLOW_LOCAL_AUTH === "true"),
  // Local dev proxies "/api" -> localhost:3001 (see vite.config.js). When the
  // frontend and backend are hosted on different origins (e.g. Vercel frontend +
  // Render backend), set VITE_API_BASE to the backend's absolute /api URL.
  apiBase: (import.meta.env && import.meta.env.VITE_API_BASE) || "/api",
};

const STATE_KEY = "oidc_state";

/* ---------- optional local fallback (explicit development only) ----------
   This browser-only simulation is used only when the build explicitly sets
   VITE_ALLOW_LOCAL_AUTH=true. Live failures never silently become mock logins.
   Sessions stay in sessionStorage so the prototype flow can be demonstrated
   without a backend when that opt-in flag is present. */
import { qrToSvgString } from "./qrcode";

const LOCAL_PREFIX = "local-";
const localKey = (id) => "sevis_local_" + id;
const localMock = {
  initiate() {
    const rand = () => Math.random().toString(36).slice(2, 10);
    const sessionId = LOCAL_PREFIX + rand() + rand();
    const state = rand() + rand();
    sessionStorage.setItem(localKey(sessionId), JSON.stringify({ authenticated: false, user: null, state }));
    const qrCode = qrToSvgString("EDUVERIFY-PNG-LOGIN|" + sessionId, 190);
    return { sessionId, state, qrCode, local: true };
  },
  read(sessionId) {
    const raw = sessionStorage.getItem(localKey(sessionId));
    if (!raw) throw new Error("Unknown local session");
    return JSON.parse(raw);
  },
  scan(sessionId, persona) {
    const sess = this.read(sessionId);
    sess.authenticated = true;
    sess.user = persona;
    sessionStorage.setItem(localKey(sessionId), JSON.stringify(sess));
  },
  status(sessionId) {
    const sess = this.read(sessionId);
    return { authenticated: sess.authenticated, userId: sess.user ? sess.user.id : null };
  },
  user(sessionId) {
    const sess = this.read(sessionId);
    sessionStorage.removeItem(localKey(sessionId));
    return { user: sess.user, state: sess.state };
  },
};
const isLocal = (sessionId) => typeof sessionId === "string" && sessionId.startsWith(LOCAL_PREFIX);


function normalizeBrowserStatus(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const nested = [root.data, root.result, root.session, root.authentication, root.auth]
    .find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
  const merged = { ...root, ...nested };
  const rawStatus = String(merged.status ?? merged.state ?? merged.authenticationStatus ?? "").trim().toLowerCase();
  const completed = new Set(["authenticated", "authorised", "authorized", "approved", "complete", "completed", "verified", "success", "succeeded", "logged_in", "logged-in"]);
  const explicit = [merged.authenticated, merged.isAuthenticated, merged.is_authenticated, merged.verified, merged.completed, merged.approved]
    .some((value) => value === true || value === 1 || String(value).toLowerCase() === "true");
  const authenticated = explicit || completed.has(rawStatus);
  return {
    ...root,
    authenticated,
    status: authenticated ? "authenticated" : (rawStatus || root.status || "pending"),
    redirectUrl: merged.redirectUrl || merged.redirect_url || null,
  };
}

async function asJson(res, action) {
  let data = null;
  try { data = await res.json(); } catch { /* safe generic error below */ }
  if (!res.ok) {
    const code = data?.error?.code || data?.error || `HTTP_${res.status}`;
    const message = data?.error?.message || `SevisPass ${action} failed (${res.status})`;
    const error = new Error(message);
    error.code = code;
    error.status = res.status;
    throw error;
  }
  return data;
}

class SevisPassAuth {
  constructor(cfg) { this.cfg = cfg; }

  /* Ask the backend to open a session and mint a real QR code. The returned
     `state` is persisted so getUser() can later confirm no CSRF tampering. */
  async initiateAuth() {
    let data;
    try {
      const res = await fetch(`${this.cfg.apiBase}/auth/initiate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      data = await asJson(res, "initiate");
    } catch (e) {
      if (!this.cfg.allowLocalFallback) throw e;
      console.warn("EduVerify: backend unavailable — VITE_ALLOW_LOCAL_AUTH=true permits the local demonstration fallback.");
      data = localMock.initiate();
    }
    if (data.state) sessionStorage.setItem(STATE_KEY, data.state);
    return data; // { qrCode, sessionId, state }
  }

  /* Poll for wallet completion. */
  async checkStatus(sessionId) {
    if (isLocal(sessionId)) return normalizeBrowserStatus(localMock.status(sessionId));
    const res = await fetch(`${this.cfg.apiBase}/session/status?session=${encodeURIComponent(sessionId)}`, {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    return normalizeBrowserStatus(await asJson(res, "status"));
  }

  /* Fetch the verified identity and enforce the CSRF check: the state the
     backend echoes must equal the one we stored at initiate time. */
  async getUser(sessionId) {
    const data = isLocal(sessionId)
      ? localMock.user(sessionId)
      : await asJson(await fetch(`${this.cfg.apiBase}/user?session=${encodeURIComponent(sessionId)}`, { credentials: "include" }), "user");
    const expected = sessionStorage.getItem(STATE_KEY);
    if (!expected || data.state !== expected) {
      throw new Error("State mismatch — possible CSRF; aborting login.");
    }
    sessionStorage.removeItem(STATE_KEY);
    return normalizeIdentity(data.user);
  }

  /* Confirm that the HttpOnly application-session cookie created after wallet
     approval is active before the UI enters the dashboard. */
  async getCurrentSession() {
    const res = await fetch(`${this.cfg.apiBase}/session/me`, {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    return asJson(res, "application session");
  }

  /* Prototype only: stand in for a real wallet scan by telling the backend
     which persona "presented" their credential. */
  async simulateScan(sessionId, userId, persona) {
    if (isLocal(sessionId)) { localMock.scan(sessionId, persona || { id: userId }); return { ok: true }; }
    const res = await fetch(`${this.cfg.apiBase}/auth/simulate-scan`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, userId }),
    });
    return asJson(res, "simulate-scan");
  }
}

/* LIVE staging identities arrive from the backend already role-resolved by
   SevisPass UID: the backend's normalizeUser decides admin / institution
   (registrar) / student based on the configured admin UID and approved
   institution registrations. The frontend MUST honour that role — it must not
   force everyone to "student", or registrars and admins would be sent to the
   wrong portal. We only fill in sensible defaults for any missing fields. */
function normalizeIdentity(u) {
  if (!u) return u;
  if (u.id && u.role) return u; // already app-shaped (seeded persona OR backend-resolved)
  const sub = u.sub || u.id;
  return {
    id: sub,
    role: u.role || "student",              // trust the backend's role; default only if absent
    instId: u.instId || null,               // registrar's institution, when present
    name: u.name || "SevisPass User",
    email: u.email || "",
    tier: u.tier || (u.credentials && u.credentials.tier) || "SevisPass — verified citizen",
    pendingInstitution: u.pendingInstitution || undefined,
    sub,
    live: true,
  };
}

const sevisAuth = new SevisPassAuth(SEVISPASS_CONFIG);

/* Parse the URL fragment after the SSO redirects back:
     #/auth/complete?session=X  -> { sessionId: X }
     #/login?error=...         -> { error }
   Cleans the hash so a refresh doesn't replay it. */
function consumeAuthReturn() {
  const h = (typeof window !== "undefined" && window.location.hash) || "";
  let m = h.match(/#\/auth\/complete\?session=([^&]+)/);
  if (m) { history.replaceState(null, "", window.location.pathname + window.location.search); return { sessionId: decodeURIComponent(m[1]) }; }
  m = h.match(/#\/(?:auth\/error|login)\?(?:error|reason)=([^&]+)/);
  if (m) { history.replaceState(null, "", window.location.pathname + window.location.search); return { error: decodeURIComponent(m[1]) }; }
  return null;
}

export { SevisPassAuth, SEVISPASS_CONFIG, sevisAuth, consumeAuthReturn, normalizeBrowserStatus };
