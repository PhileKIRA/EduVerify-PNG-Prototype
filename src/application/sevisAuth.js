/* ============================================================
   APPLICATION TIER — SevisPass SSO integration (OIDC4VP)

   Implements the flow from the SevisPass Developer Integration Guide:
     POST /api/auth/third-party/authorize (X-Client-ID / X-Client-Secret,
     body: callback_url + state + nonce) -> { qrCode (SVG string), sessionId }
     then poll GET /api/session/status?session=... until authenticated,
     then GET /api/user for the verified identity.

   Fixes applied vs. the single-file prototype (see mentor code review):
   - [Critical #1] clientSecret is NEVER present in this file or shipped to the
     browser. In live mode every SevisPass call is routed through our own
     backend proxy (see /server/index.js), which is the only thing that holds
     the secret, read from a server-side env var.
   - [Important #3 / Minor #8] The OAuth `state` value is generated here,
     stored in sessionStorage with a 10-minute expiry, and verified against
     the value the backend echoes back on callback — this is the CSRF
     protection the guide requires and the prototype was missing.
   - [Important #6] The backend proxy referenced below (server/index.js)
     implements /api/auth/initiate, /api/auth/callback and
     /api/session/status so this client never talks to the real SevisPass
     server directly.
   - [Minor #9] logout() calls the backend to invalidate the server-side
     session rather than just clearing local React state.
   ============================================================ */

import { makeQrSvg } from "./certificate.js";

const SEVISPASS_CONFIG = {
  mock: true, // flip to false to use the live SevisPass server via our backend proxy
  // In live mode, all calls go to OUR backend (never the SevisPass server directly).
  backendUrl: "/api/sevispass",
  clientId: "eduverify-png",
  callbackUrl: typeof window !== "undefined" ? window.location.origin + "/auth/callback" : "",
  // NOTE: there is intentionally no clientSecret field here. The secret lives
  // only in the backend's environment (see server/.env.example).
};

const STATE_STORAGE_KEY = "eduverify.sevispass.state";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes, per issue #8

function storeState(state, nonce) {
  sessionStorage.setItem(STATE_STORAGE_KEY, JSON.stringify({ state, nonce, expires: Date.now() + STATE_TTL_MS }));
}

function verifyAndConsumeState(returnedState) {
  const raw = sessionStorage.getItem(STATE_STORAGE_KEY);
  sessionStorage.removeItem(STATE_STORAGE_KEY); // one-time use
  if (!raw) return { ok: false, reason: "No pending SevisPass login found for this browser session." };
  let saved;
  try { saved = JSON.parse(raw); } catch (e) { return { ok: false, reason: "Corrupted session state." }; }
  if (Date.now() > saved.expires) return { ok: false, reason: "Login session expired (10 minute window) — please try again." };
  if (saved.state !== returnedState) return { ok: false, reason: "State mismatch — possible CSRF attempt, login rejected." };
  return { ok: true, nonce: saved.nonce };
}

class SevisPassAuth {
  constructor(cfg) { this.cfg = cfg; }
  /*generateState() { return crypto.randomUUID(); }
  generateNonce() { return crypto.randomUUID(); }*/

  generateState() {
  return "state-" + Date.now() + "-" + Math.random();
}

generateNonce() {
  return "nonce-" + Date.now() + "-" + Math.random();
}

  async initiateAuth() {
    const state = this.generateState();
    const nonce = this.generateNonce();
    storeState(state, nonce);

    if (this.cfg.mock) {
      const sessionId = Math.random().toString(36).slice(2, 14);
      // Guide: qrCode is an SVG string (not an image URL) containing the presentation request
      return { qrCode: makeQrSvg("openid4vp://authorize?client_id=" + this.cfg.clientId + "&session=" + sessionId + "&nonce=" + nonce), sessionId, state, nonce, mock: true };
    }

    // Live mode: ask OUR backend to initiate — it holds the client secret and
    // talks to the real SevisPass server on our behalf (fixes #1 and #6).
    const res = await fetch(`${this.cfg.backendUrl}/initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_url: this.cfg.callbackUrl, state, nonce }),
    });
    if (!res.ok) throw new Error("Failed to initiate SevisPass authentication");
    return await res.json();
  }

  async checkStatus(sessionId) {
    if (this.cfg.mock) return { sessionId, authenticated: false }; // completed via simulated wallet scan
    const res = await fetch(`${this.cfg.backendUrl}/session/status?session=${sessionId}`);
    return await res.json();
  }

  async getUser(sessionId) {
    if (this.cfg.mock) return null;
    const res = await fetch(`${this.cfg.backendUrl}/user?session=${sessionId}`);
    return await res.json();
  }

  /* [Minor #9] Server-side logout: invalidate the session on the backend,
     not just clear local state. In mock mode there's no server session, so
     this is a no-op that resolves immediately. */
  async logout(sessionId) {
    if (this.cfg.mock || !sessionId) return { ok: true };
    try {
      const res = await fetch(`${this.cfg.backendUrl}/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      return await res.json();
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}
const sevisAuth = new SevisPassAuth(SEVISPASS_CONFIG);

export { SEVISPASS_CONFIG, SevisPassAuth, sevisAuth, verifyAndConsumeState };
