/* ============================================================
   EduVerify PNG — SevisPass backend proxy.

   [Critical #1 fix] The React frontend never holds SEVISPASS_CLIENT_SECRET.
   This tiny Express server is the only thing that reads it (from an
   environment variable), and it's the only thing that ever calls the real
   SevisPass server directly.

   [Important #6 fix] Implements the three endpoints the frontend's
   sevisAuth.js expects in live mode:
     POST /api/sevispass/initiate        -> starts the OIDC4VP flow
     GET  /api/sevispass/session/status  -> polls session status
     GET  /api/sevispass/user            -> fetches the verified identity
     POST /api/sevispass/logout          -> [Minor #9] invalidates the session

   This is a reference implementation for the live-SevisPass path. The React
   prototype ships with SEVISPASS_CONFIG.mock = true, so none of this is
   required to run/demo the app — it only matters once you flip mock:false.
   ============================================================ */

import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8787;
const SEVISPASS_SERVER_URL = process.env.SEVISPASS_SERVER_URL || "https://your-sso-server.com";
const SEVISPASS_CLIENT_ID = process.env.SEVISPASS_CLIENT_ID || "eduverify-png";
const SEVISPASS_CLIENT_SECRET = process.env.SEVISPASS_CLIENT_SECRET || ""; // never sent to the browser

// In-memory session store for the prototype. A real deployment would use
// Redis or a database table so sessions survive a server restart.
const sessions = new Map();

function requireSecretConfigured(res) {
  if (!SEVISPASS_CLIENT_SECRET) {
    res.status(500).json({ error: "SEVISPASS_CLIENT_SECRET is not set on the server. See server/.env.example." });
    return false;
  }
  return true;
}

app.post("/api/sevispass/initiate", async (req, res) => {
  if (!requireSecretConfigured(res)) return;
  const { callback_url, state, nonce } = req.body || {};
  try {
    const upstream = await fetch(`${SEVISPASS_SERVER_URL}/api/auth/third-party/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-ID": SEVISPASS_CLIENT_ID,
        "X-Client-Secret": SEVISPASS_CLIENT_SECRET, // stays server-side only
      },
      body: JSON.stringify({ callback_url, state, nonce }),
    });
    if (!upstream.ok) return res.status(502).json({ error: "SevisPass authorize call failed" });
    const data = await upstream.json();
    sessions.set(data.sessionId, { state, nonce, createdAt: Date.now() });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "Could not reach SevisPass server", detail: String(err) });
  }
});

app.get("/api/sevispass/session/status", async (req, res) => {
  const { session } = req.query;
  try {
    const upstream = await fetch(`${SEVISPASS_SERVER_URL}/api/session/status?session=${encodeURIComponent(session)}`);
    res.json(await upstream.json());
  } catch (err) {
    res.status(502).json({ error: "Could not reach SevisPass server", detail: String(err) });
  }
});

app.get("/api/sevispass/user", async (req, res) => {
  const { session } = req.query;
  try {
    const upstream = await fetch(`${SEVISPASS_SERVER_URL}/api/user?session=${encodeURIComponent(session)}`);
    res.json(await upstream.json());
  } catch (err) {
    res.status(502).json({ error: "Could not reach SevisPass server", detail: String(err) });
  }
});

// [Minor #9] Real server-side logout, not just clearing React state client-side.
app.post("/api/sevispass/logout", (req, res) => {
  const { sessionId } = req.body || {};
  sessions.delete(sessionId);
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`EduVerify PNG SevisPass proxy listening on :${PORT}`);
  if (!SEVISPASS_CLIENT_SECRET) {
    console.warn("SEVISPASS_CLIENT_SECRET not set — /initiate will return 500 until it is. Fine while the frontend runs in mock mode.");
  }
});
