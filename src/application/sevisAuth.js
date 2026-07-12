/* ============================================================
   APPLICATION TIER — SevisPass SSO integration (OIDC4VP).
   Implements the flow from the SevisPass Developer Integration Guide:
   POST /api/auth/third-party/authorize  (X-Client-ID / X-Client-Secret,
   body: callback_url + state + nonce)  ->  { qrCode (SVG string), sessionId }
   then poll GET /api/session/status?session=...  until authenticated,
   then GET /api/user for the verified identity.
   Set mock:false and fill in real values to go live. NOTE: in production
   the authorize call must be proxied through your backend so the client
   secret never ships to the browser (see the guide's Express example).
   ============================================================ */
import { makeQrSvg } from "./certificate";

/* ============================================================
   SevisPass SSO integration (OIDC4VP)
   Implements the flow from the SevisPass Developer Integration Guide:
   POST /api/auth/third-party/authorize  (X-Client-ID / X-Client-Secret,
   body: callback_url + state + nonce)  ->  { qrCode (SVG string), sessionId }
   then poll GET /api/session/status?session=...  until authenticated,
   then GET /api/user for the verified identity.
   Set mock:false and fill in real values to go live. NOTE: in production
   the authorize call must be proxied through your backend so the client
   secret never ships to the browser (see the guide's Express example).
   ============================================================ */
const SEVISPASS_CONFIG = {
  mock: true, // flip to false + set serverUrl/clientId to use the live SevisPass server
  serverUrl: "https://your-sso-server.com",
  clientId: "eduverify-png",
  clientSecret: "", // production: keep server-side only
  callbackUrl: "https://eduverify.example.pg/auth/callback",
};

class SevisPassAuth {
  constructor(cfg) { this.cfg = cfg; }
  generateState() { return crypto.randomUUID(); }
  generateNonce() { return crypto.randomUUID(); }

  async initiateAuth() {
    const state = this.generateState();
    const nonce = this.generateNonce();
    if (this.cfg.mock) {
      const sessionId = Math.random().toString(36).slice(2, 14);
      // Guide: qrCode is an SVG string (not an image URL) containing the presentation request
      return { qrCode: makeQrSvg("openid4vp://authorize?client_id=" + this.cfg.clientId + "&session=" + sessionId + "&nonce=" + nonce), sessionId, state, nonce };
    }
    const res = await fetch(`${this.cfg.serverUrl}/api/auth/third-party/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-ID": this.cfg.clientId,
        "X-Client-Secret": this.cfg.clientSecret,
        "Origin": window.location.origin, // required for CORS validation per the guide
      },
      body: JSON.stringify({ callback_url: this.cfg.callbackUrl, state, nonce }),
    });
    if (!res.ok) throw new Error("Failed to initiate SevisPass authentication");
    return await res.json();
  }

  async checkStatus(sessionId) {
    if (this.cfg.mock) return { sessionId, authenticated: false }; // completed via simulated wallet scan
    const res = await fetch(`${this.cfg.serverUrl}/api/session/status?session=${sessionId}`);
    return await res.json();
  }

  async getUser(sessionId) {
    if (this.cfg.mock) return null;
    const res = await fetch(`${this.cfg.serverUrl}/api/user?session=${sessionId}`);
    return await res.json();
  }
}
const sevisAuth = new SevisPassAuth(SEVISPASS_CONFIG);

export { SevisPassAuth, SEVISPASS_CONFIG, sevisAuth };
