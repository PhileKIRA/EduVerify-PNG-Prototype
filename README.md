# EduVerify PNG

**Academic credential verification for Papua New Guinea.** EduVerify PNG lets students
carry a lifelong, tamper-evident portfolio of their academic records — from Grade 10
through university — and lets employers and institutions verify those credentials
instantly, without phoning a registrar. Authentication is delegated to the national
**SevisPass** digital identity (OIDC4VP), so nobody creates yet another password.

This repository contains a working **Phase 1 prototype**: a React front end plus a
Node.js/Express + SQLite backend that brokers the SevisPass login securely.

---

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + Vite 5 | SPA, three-tier internal structure (presentation / application / data) |
| Styling | Tailwind CSS 3 + PostCSS | |
| Backend | Node.js + Express 4 | REST API under `/api`, the trust boundary for SevisPass |
| Database | SQLite (`better-sqlite3`) | Synchronous, zero-config, file-backed (`backend/eduverify.db`) |
| Auth | SevisPass SSO — OIDC4VP | QR / wallet presentation; client secret stays server-side |
| QR codes | `qrcode` | Real, scannable SVG QR codes (no placeholder graphics) |
| Deployment | GitHub Pages (frontend) | `base` path configured in `vite.config.js` |

---

## Folder structure

```
EduVerify-PNG/
├── index.html                 Vite entry
├── vite.config.js             base path (GitHub Pages) + /api dev proxy
├── package.json               frontend deps & scripts
├── src/
│   ├── main.jsx
│   ├── presentation/          React components (App, Login, dashboards, ui)
│   ├── application/            logic: sevisAuth (SSO client), crypto, certificate, verification
│   └── data/                  seed data, reference data, repository
└── backend/
    ├── package.json           backend deps & scripts (CommonJS)
    ├── .env.example           copy to .env and configure
    ├── db.js                  SQLite schema, seed data, prepared statements
    ├── server.js              Express API (auth broker + records/institutions)
    └── eduverify.db           pre-seeded demo database (committed on purpose)
```

---

## Setup

Prerequisites: **Node.js 18+** and npm.

```bash
# 1. Frontend dependencies (repo root)
npm install

# 2. Backend dependencies
cd backend
npm install

# 3. Backend configuration
cp .env.example .env         # defaults run in MOCK_MODE — no real SSO needed
cd ..
```

> `better-sqlite3` is a native module. `npm install` downloads a prebuilt binary for
> your Node version; if none exists it compiles from source (needs Xcode CLT on macOS
> or build-essential + python3 on Linux).

## Running (two terminals)

The frontend and backend run as separate processes. The Vite dev server proxies
`/api/*` to the backend, so you only ever open the frontend URL in your browser.

**Terminal 1 — backend (port 3001):**
```bash
cd backend
npm run dev        # node --watch server.js  (auto-restarts on change)
# or: npm start
```

**Terminal 2 — frontend (port 5173):**
```bash
npm run dev
```

Then open **http://localhost:5173**. Check the backend is healthy at
<http://localhost:3001/api/health> → `{ "ok": true, "mode": "mock", "db": "connected" }`.

---

## Demo personas & suggested flows

Sign in from the login screen, then "simulate the wallet scan" by picking a persona.
All personas authenticate through the same OIDC flow (state + nonce + real QR).

| SevisPass ID | Persona | Role | Try this |
|---|---|---|---|
| SP-1001 | Grace Kila | Student (UPNG) | Has a pending BSc record — good "student view" starter |
| SP-1002 | David Namah | Student (Unitech) | Certified BEng; models the overseas-study gate |
| SP-1003 | **Philemon Kira** | Student (DWU) | **Full lifelong portfolio** — Grade 12 (Passam & Sogeri), a Madang Tech diploma, and a DWU degree. Generate his QR, then verify it from the employer portal. |
| SP-1004 | Maria Toua | Student | First sign-in, no records yet — the empty-state experience |
| SP-2001 | UPNG Registrar | Institution | Verify & certify Grace's record |
| SP-2002–2006 | Unitech / DWU / PAU / Sogeri / POM Tech | Institution | Issuer dashboards (PAU is still pending approval) |
| SP-3001 | System Administrator | Admin | Approve pending institutions (e.g. PAU), oversee the registry |

**Full pipeline demo:** Grace Kila → UPNG Registrar (verify & certify) → David Namah
(overseas upload) → System Administrator (approve PAU's pending registration).

---

## Architecture notes

**Three-tier, with a real trust boundary.** The browser (`src/`) never contacts the
SevisPass server directly. It only calls our backend (`backend/`), which owns all
secrets and brokers the OIDC4VP handshake. This fixes two issues from the initial
prototype:

1. **Client secret is server-side only.** The frontend `sevisAuth.js` holds no
   `clientSecret`. In live mode the backend attaches `X-Client-Secret` (from `.env`)
   when it proxies the SevisPass `/authorize` call — the secret never ships to the
   browser.

2. **CSRF-protected login (`state`).** On `POST /api/auth/initiate` the backend mints a
   random `state` (and `nonce`), stores them against the session in SQLite, and returns
   `state` to the client, which stashes it in `sessionStorage`. When the login
   completes, `GET /api/user` echoes the session's `state`; the frontend refuses the
   identity unless it matches the value it stored (`getUser()` throws on mismatch). In
   live mode `POST /api/auth/callback` independently re-verifies `state` against the DB
   before accepting the presentation. Sessions expire after `STATE_EXPIRY_MINUTES`.

3. **Real QR codes.** QR codes are generated server-side with the `qrcode` package as
   scannable SVG (encoding the `openid4vp://` presentation request), replacing the
   earlier hand-drawn placeholder.

**API surface (`backend/server.js`):**

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Liveness + mode + DB status |
| `POST /api/auth/initiate` | Create session, return real QR + `state` |
| `GET /api/session/status?session=` | Poll for wallet completion |
| `GET /api/user?session=` | Verified identity + `state` (for the CSRF check) |
| `POST /api/auth/simulate-scan` | Prototype-only wallet stand-in (mock mode) |
| `POST /api/auth/callback` | Live-mode SSO redirect target; re-verifies `state` |
| `GET /api/records/:studentId` | A student's academic records |
| `GET /api/institutions` | The PNG issuer registry |

**Database (`backend/db.js`):** tables `users`, `institutions`, `academic_records`,
`oidc_sessions`, `verification_tokens`. Seeded idempotently (`INSERT OR IGNORE`) with
11 personas, 8 institutions, and 6 records. Record integrity hashes use Node's
`crypto.createHash('sha256')`. Data access goes through an exported `queries` object of
prepared statements.

---

## DICT compliance

This integration follows the DICT *Developer Integration Guide — Digital Identity SSO*
(OIDC4VP). How each requirement is met:

| DICT requirement | Where it's implemented |
|---|---|
| `state` generated cryptographically, stored securely, verified exactly, 10-min expiry | `uuid` state in `oidc_sessions`; verified in `getUser`/`callback`; `STATE_EXPIRY_MINUTES=10` |
| `nonce` per request | issued at `initiate`, stored per session |
| Client secret server-side only | `CLIENT_SECRET` in `.env`; attached only on the server→SSO call |
| **`Origin` header on all SSO calls** (CORS validation) | sent as `APP_ORIGIN` on the `/authorize` proxy call |
| Allowed origins / callback allowlist | `ALLOWED_ORIGINS` (CORS) + `ALLOWED_CALLBACK_URLS` (open-redirect guard) |
| QR as SVG string injected via `innerHTML` (not `<img>`) | backend returns SVG; `Login.jsx` uses a `div` with `dangerouslySetInnerHTML` |
| HTTPS / HSTS / secure headers | HSTS + `X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy`; `x-powered-by` disabled |
| Rate limiting (100 req / 15 min per IP) | `express-rate-limit` on `/api/*` |
| Access token not exposed to the browser; cleared on logout | VP/access token kept in the DB, never returned to the client; `POST /api/auth/logout` deletes the session |
| Error handling without leaking internals | generic client messages; details logged server-side only |

**Config variable names** match the guide's Configuration section
(`OIDC4VP_SERVER_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `CALLBACK_URL`, `JWT_SECRET`,
`SESSION_SECRET`, `ALLOWED_ORIGINS`, `ALLOWED_CALLBACK_URLS`); the earlier `SEVISPASS_*`
names are still accepted as aliases.

> **Remaining production step:** the `vp_token` returned to `/api/auth/callback` is a
> JWT. Before trusting it in live mode, verify its signature against the SSO's JWKS and
> confirm the `nonce` claim matches the session's `nonce`. This is marked with a `NOTE`
> in `server.js` and depends on the SSO's published signing keys.

---

## Going live (disabling mock mode)

1. Register EduVerify PNG with the SevisPass provider to obtain a client ID/secret and
   register your callback URL.
2. In `backend/.env`:
   ```
   MOCK_MODE=false
   SEVISPASS_SERVER_URL=https://<sevispass-host>
   SEVISPASS_CLIENT_ID=<your-client-id>
   SEVISPASS_CLIENT_SECRET=<your-client-secret>
   SEVISPASS_CALLBACK_URL=https://<your-domain>/api/auth/callback
   CORS_ORIGIN=https://<your-frontend-domain>
   ```
3. Restart the backend. `POST /api/auth/initiate` now proxies to the real SevisPass
   `/authorize` endpoint (secret attached server-side), and `/api/auth/simulate-scan`
   is disabled (returns 403). The wallet redirects to `/api/auth/callback`, which
   verifies `state` and stores the verifiable-presentation token.

---

## Migrating from SQLite to PostgreSQL

SQLite is ideal for the prototype (zero-config, file-backed). For production/multi-node:

1. **Provision Postgres** and add `DATABASE_URL` to `.env`.
2. **Swap the driver:** replace `better-sqlite3` with `pg` (node-postgres). `db.js` is
   the only file that touches the database — everything else uses the `queries` object.
3. **Port the schema:** the DDL in `db.js` is close to standard SQL. Adjust types
   (`TEXT` → `TEXT`/`VARCHAR`, `INTEGER` boolean flags → `BOOLEAN`, and use
   `TIMESTAMPTZ` with `now()` for `created_at`/`expires_at`).
4. **Make queries async:** `better-sqlite3` is synchronous; `pg` is promise-based.
   Convert the prepared statements to parameterized `pool.query(text, params)` calls
   (`$1, $2, …` placeholders) and `await` them; update the route handlers accordingly.
5. **Move seed data** into a migration (e.g. `node-pg-migrate` or Knex) instead of the
   idempotent boot-time seed, so schema changes are versioned.
6. **Connection pooling:** use `pg.Pool` and read `DATABASE_URL`; keep transactions
   (the seed uses one) via `pool.connect()` + `BEGIN/COMMIT`.

Because the whole app already funnels DB access through `db.js`'s `queries`, the
migration is contained to that one module plus making the callers `await`.

---

## License

Prototype for demonstration purposes.
