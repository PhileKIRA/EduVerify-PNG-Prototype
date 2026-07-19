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
  mock: true,
  // Local dev proxies "/api" -> localhost:3001 (see vite.config.js). When the
  // frontend and backend are hosted on different origins (e.g. Vercel frontend +
  // Render backend), set VITE_API_BASE to the backend's absolute /api URL.
  apiBase: (import.meta.env && import.meta.env.VITE_API_BASE) || "/api",
};

const STATE_KEY = "oidc_state";

/* ---------- local fallback (testing without the backend) ----------
   If the /api backend isn't running (`node backend/server.js`), the whole
   sign-in used to dead-end with a network error. For prototype testing we
   fall back to an in-browser mock that follows the exact same flow:
   initiate -> QR -> (simulated) wallet scan -> status poll -> verified user.
   Sessions are kept in sessionStorage so the status poll works across
   the component lifecycle. Live deployments with the backend running are
   completely unaffected — the fallback only engages when fetch fails. */
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

async function asJson(res, action) {
  if (!res.ok) throw new Error(`SevisPass ${action} failed (${res.status})`);
  return res.json();
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      data = await asJson(res, "initiate");
    } catch (e) {
      console.warn("EduVerify: /api backend unreachable — using in-browser mock sign-in for testing. Start it with `node backend/server.js` to use the real flow.");
      data = localMock.initiate();
    }
    if (data.state) sessionStorage.setItem(STATE_KEY, data.state);
    return data; // { qrCode, sessionId, state }
  }

  /* Poll for wallet completion. */
  async checkStatus(sessionId) {
    if (isLocal(sessionId)) return localMock.status(sessionId);
    const res = await fetch(`${this.cfg.apiBase}/session/status?session=${encodeURIComponent(sessionId)}`);
    return asJson(res, "status");
  }

  /* Fetch the verified identity and enforce the CSRF check: the state the
     backend echoes must equal the one we stored at initiate time. */
  async getUser(sessionId) {
    const data = isLocal(sessionId)
      ? localMock.user(sessionId)
      : await asJson(await fetch(`${this.cfg.apiBase}/user?session=${encodeURIComponent(sessionId)}`), "user");
    const expected = sessionStorage.getItem(STATE_KEY);
    if (!expected || data.state !== expected) {
      throw new Error("State mismatch — possible CSRF; aborting login.");
    }
    sessionStorage.removeItem(STATE_KEY);
    return normalizeIdentity(data.user);
  }

  /* Prototype only: stand in for a real wallet scan by telling the backend
     which persona "presented" their credential. */
  async simulateScan(sessionId, userId, persona) {
    if (isLocal(sessionId)) { localMock.scan(sessionId, persona || { id: userId }); return { ok: true }; }
    const res = await fetch(`${this.cfg.apiBase}/auth/simulate-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, userId }),
    });
    return asJson(res, "simulate-scan");
  }
}

/* LIVE staging identities arrive as verified OIDC claims ({ sub, name, email,
   credentials... }) rather than a seeded persona. Map them to an app user:
   a real SevisPass citizen signs in as a STUDENT (id = the federated subject).
   Institution/administrator roles remain restricted to provisioned accounts —
   an arbitrary wallet holder must never become an issuer or admin. */
function normalizeIdentity(u) {
  if (!u) return u;
  if (u.id && u.role) return u; // seeded/mock persona — already app-shaped
  const sub = u.sub || u.id;
  return {
    id: sub,
    role: "student",
    name: u.name || "SevisPass User",
    email: u.email || "",
    tier: (u.credentials && u.credentials.tier) || "SevisPass — verified citizen",
    sub,
    live: true,
  };
}

const sevisAuth = new SevisPassAuth(SEVISPASS_CONFIG);

export { SevisPassAuth, SEVISPASS_CONFIG, sevisAuth };
