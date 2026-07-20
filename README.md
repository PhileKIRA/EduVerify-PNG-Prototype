# EduVerify PNG

EduVerify PNG is a React and Node.js prototype for verifying Papua New Guinea academic credentials. The browser communicates only with the EduVerify backend. The backend holds the SevisPass client credential, creates a local login transaction, stores the SevisPass session returned by the authorize API, polls SevisPass for wallet completion, retrieves the verified user server-side, and creates the EduVerify application session.

## Corrected authentication architecture

```text
React login page
  → POST /api/auth/initiate
  → local transaction: state + nonce + expiry
  → POST SevisPass /api/auth/third-party/authorize
  → SevisPass returns qrCode + upstream sessionId
  → backend stores upstream sessionId against the local transaction
  → frontend polls EduVerify GET /api/session/status?session=<local-id>
  → EduVerify polls SevisPass GET /api/session/status?session=<upstream-id>
  → after wallet approval, EduVerify calls SevisPass GET /api/user?session=<upstream-id>
  → local user + HttpOnly application session
  → frontend retrieves the verified identity and opens the dashboard automatically
```

The callback route remains available for deployments where SevisPass sends a token to a publicly reachable callback. Local QR sign-in does not depend on the phone or the SevisPass server reaching `localhost`; it completes through the documented SevisPass session-status polling flow.

The main backend modules are:

| File | Responsibility |
|---|---|
| `backend/server.js` | Loads validated configuration, starts Express and handles shutdown |
| `backend/src/config.js` | Parses and validates all environment variables |
| `backend/src/app.js` | Routes, CORS, cookies, security headers, rate limits and redirects |
| `backend/src/services/sevispass.service.js` | Authorize, upstream session-status polling and verified-user retrieval |
| `backend/src/services/token.service.js` | JWKS/HS256 token signature, audience, expiry, issuer and nonce checks |
| `backend/src/db.js` | Built-in SQLite schema, seed data, auth transactions and application sessions |
| `backend/diagnose-sso.js` | Safe staging probes and actionable exit codes |
| `backend/tests/` | Unit, integration and security tests |

## Root cause of the previous failure

The earlier backend used `APP_ORIGIN` for two different purposes: frontend CORS and the outgoing `Origin` header sent to SevisPass. It also retried rejected requests using an undocumented body-credential format. This made it difficult to prove which exact origin and protocol were being sent.

The corrected implementation uses a separate setting:

```env
SSO_REQUEST_ORIGIN=http://localhost:5173
```

It sends exactly one documented request format:

```http
POST /api/auth/third-party/authorize
Origin: http://localhost:5173
X-Client-ID: <configured client ID>
X-Client-Secret: <configured secret>
Content-Type: application/json
```

The request body contains only the callback URL, random state and random nonce. Production code does not retry with credentials in the body.

The previous frontend also silently changed to an in-browser mock when any backend or SSO request failed. That could make a broken live integration appear to work. Local fallback is now disabled unless `VITE_ALLOW_LOCAL_AUTH=true` is explicitly set.

A second defect caused the page to wait forever after the wallet reported success: the backend discarded the `sessionId` returned by SevisPass and polled only its own local transaction, which could never become authenticated unless the callback reached `localhost`. The backend now persists the upstream SevisPass session ID, polls SevisPass `/api/session/status`, retrieves `/api/user` after approval, and then completes the local session. After verified wallet completion, the login page proceeds to the dashboard automatically.

## Three different URLs

These values are not interchangeable:

| Setting | Current local value | Purpose |
|---|---|---|
| SSO server | `https://sso.stage.sevispass.gov.pg` | External SevisPass service called by the backend |
| Browser/application origin | `http://localhost:5173` | React frontend and CORS origin |
| Outgoing SSO request origin | `http://localhost:5173` | Exact `Origin` header sent to the SevisPass authorize API |
| Backend callback | `http://localhost:3001/api/auth/callback` | Optional token callback for compatible/public deployments; local QR completion uses upstream status polling |
| Success redirect | `http://localhost:5173/#/auth/complete` | Browser destination when the optional callback flow is used |

An origin contains only scheme, host and port. It must not include a trailing slash, path, query or fragment.

## Required software

- Node.js **22.5 or later**; Node.js 24 is recommended.
- npm.
- Git Bash, PowerShell or a Unix-compatible terminal.
- The Staging SevisWallet application and a staging account for live testing.

The backend now uses Node's built-in `node:sqlite`; there is no `better-sqlite3` native compilation step.

## Install

The project contains a public npm registry configuration so installations do not depend on any private build-system registry. Run each command on its own line.

From the project folder:

```bash
npm install
cd backend
npm ci
cd ..
```

When the prompt already ends in `/backend`, do **not** run `cd backend` again. Run `npm ci` directly.

### Windows/Git Bash clean-install recovery

If a previous interrupted installation left a locked or incomplete `node_modules` folder, close any running Node/Vite terminals, then run from `backend`:

```bash
rm -rf node_modules
npm cache verify
npm ci --registry=https://registry.npmjs.org/
```

If Windows reports `EPERM`, close VS Code terminals and File Explorer windows using the project folder, then retry. As a final fallback, open Git Bash as Administrator and remove `node_modules` again.

`Cannot find module dotenv` and `vitest is not recognized` mean dependency installation did not finish. Resolve `npm ci` first; they are consequences of the failed install, not separate application defects.

## Configure live staging

The downloadable package intentionally contains no real `.env` secret. Create it from the template:

```bash
cd backend
cp .env.example .env
```

Set the issued client secret in `backend/.env` locally. Do not commit or paste it into test output.

Recommended local staging configuration:

```env
NODE_ENV=development
PORT=3001
DB_PATH=./eduverify.db
MOCK_MODE=false

OIDC4VP_SERVER_URL=https://sso.stage.sevispass.gov.pg
CLIENT_ID=pacman5-hei-sevispass
CLIENT_SECRET=<issued secret>

CALLBACK_URL=http://localhost:3001/api/auth/callback
ALLOWED_CALLBACK_URLS=http://localhost:3001/api/auth/callback

APP_ORIGIN=http://localhost:5173
SSO_REQUEST_ORIGIN=http://localhost:5173
AUTH_SUCCESS_URL="http://localhost:5173/#/auth/complete"
AUTH_FAILURE_URL="http://localhost:5173/#/login"

SSO_JWKS_URI=https://sso.stage.sevispass.gov.pg/.well-known/jwks.json
SSO_ISSUER=
JWT_SECRET=

ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
STATE_EXPIRY_MINUTES=10
APP_SESSION_MINUTES=480
COOKIE_SECURE=false
TRUST_PROXY=1
LOG_LEVEL=info
```

The redirect values containing `#` are quoted because unquoted `#` begins a comment in `.env` syntax.

### Configuration validation

In live mode, startup fails immediately when any of these are absent or malformed:

- `OIDC4VP_SERVER_URL`
- `CLIENT_ID`
- `CLIENT_SECRET`
- `CALLBACK_URL`
- `SSO_REQUEST_ORIGIN`
- `AUTH_SUCCESS_URL`

Production rejects HTTP callback/redirect URLs unless `ALLOW_INSECURE_HTTP=true` is deliberately configured. Do not enable that override for an internet deployment.

## Run locally

Use two Git Bash terminals.

### Terminal 1 — backend

```bash
cd backend
npm run dev
```

Expected safe startup output:

```text
[config] LIVE mode
[config] SSO server: https://sso.stage.sevispass.gov.pg
[config] Client ID: pacman5-hei-sevispass
[config] Callback: http://localhost:3001/api/auth/callback
[config] Request origin: http://localhost:5173
[config] Success redirect: http://localhost:5173/#/auth/complete
EduVerify PNG backend listening on :3001 (LIVE mode)
```

The client secret is never printed.

### Terminal 2 — frontend

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

The Vite server proxies `/api` to `http://localhost:3001`.

## Run the SSO diagnostic

```bash
cd backend
npm run diagnose:sso
```

The script reports the configured server, client ID, callback, outgoing origin, JWKS URL, response status, safe response keys and CORS headers. It hides QR/token values, confirms whether SevisPass returned an upstream session ID, and probes the newly created session status. It never prints the client secret.

A temporary origin can be probed without editing `.env`:

```bash
npm run diagnose:sso -- --origin=http://localhost:3001
```

Use this only for diagnosis after the SevisPass administrator tells you which origin was registered. Do not guess and silently change the production setting.

Diagnostic exit codes:

| Exit code | Meaning |
|---:|---|
| `0` | Required authorize probe succeeded |
| `1` | Invalid local configuration |
| `2` | Network/DNS failure |
| `3` | Client credentials rejected |
| `4` | Origin rejected |
| `5` | Callback rejected |
| `6` | Unexpected SSO response |

## Run automated tests

```bash
cd backend
npm test
npm run test:unit
npm run test:integration
npm run test:security
npm run test:coverage
```

The tests use an in-memory SQLite database and mocked SevisPass responses. Normal automated tests never call the real staging server.

Verified result for this corrected package:

```text
Test files: 12 passed
Tests:      88 passed
Statements: 97.79%
Branches:   80.09%
Functions:  100.00%
Lines:      97.79%
```

Coverage thresholds are enforced at 85% statements, 85% lines, 85% functions and 80% branches.

## Manual API checks

### Health

```bash
curl -i http://localhost:3001/api/health
curl -i http://localhost:3001/health
```

### Start authentication

```bash
curl -i \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  http://localhost:3001/api/auth/initiate
```

### Check a QR transaction

```bash
curl -i "http://localhost:3001/api/session/status?session=SESSION_ID"
```

### Build the frontend

```bash
npm run build
```

For GitHub Pages only:

```bash
BASE_PATH=/EduVerify-PNG/ npm run build
```

## API inventory

| Method | Route | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Backend and database health |
| `GET` | `/api/health` | Public | API health alias |
| `POST` | `/api/auth/initiate` | Public, rate-limited | Creates state/nonce and requests QR authorization |
| `GET` | `/api/session/status?session=` | Transaction ID | Polls pending/authenticated/expired/not-found status |
| `GET` | `/api/user?session=` | Authenticated transaction | Single-use verified identity handoff; sets session cookie |
| `GET` | `/api/auth/callback` | SSO callback | Validates token and redirects safely |
| `POST` | `/api/auth/callback` | SSO callback | Validates token and redirects safely |
| `POST` | `/api/auth/simulate-scan` | Mock mode only | Completes a prototype wallet scan |
| `GET` | `/api/session/me` | HttpOnly session cookie | Returns the authenticated local user |
| `POST` | `/api/auth/logout` | Optional session cookie | Revokes the session and clears the cookie |
| `GET` | `/api/records/:studentId` | Public prototype data | Returns academic records |
| `GET` | `/api/institutions` | Public prototype data | Returns registered institutions |
| `GET` | `/.well-known/security.txt` | Public | Vulnerability-reporting contact |

## Security controls

- Cryptographically random state and nonce.
- State expiry and single-use callback enforcement.
- Callback replay rejection.
- JWT signature, audience, expiry and nonce validation.
- Issuer validation when `SSO_ISSUER` is configured.
- JWKS caching and rate limiting through `jwks-rsa`.
- Only selected identity claims are retained; raw VP/ID/access tokens are not stored.
- New session identifier generated after authentication; inbound session IDs are never reused.
- `HttpOnly`, `SameSite=Lax` cookie; `Secure` enabled for HTTPS production.
- Exact CORS allowlist with credential support; no wildcard origin.
- Separate frontend CORS and outgoing SevisPass origin settings.
- Security headers, request-size limit and tiered rate limiting.
- Safe structured errors with no production stack traces, paths, secrets or tokens.
- Client-supplied redirect targets are ignored; redirects come only from validated server configuration.

## Common SSO errors

| Error | Meaning | Corrective action |
|---|---|---|
| `Origin not allowed` | The exact `SSO_REQUEST_ORIGIN` is absent from the SevisPass client allowlist | Ask the administrator to register the exact scheme, host and port, then rerun the diagnostic |
| Invalid credentials | Client ID or secret was rejected | Recheck the issued staging values; do not print the secret |
| Callback not allowed | Callback does not match the registered callback/pattern | Confirm `http://localhost:3001/api/auth/callback` is covered by the registered callback |
| JWKS unavailable | Signing keys cannot be retrieved | Check DNS/network and the JWKS URL |
| State invalid/expired/replayed | Callback did not match a current pending login | Start a new login and inspect transaction storage/time synchronization |
| Token nonce invalid | Token belongs to another/replayed request | Start a new login; never bypass nonce checking |
| Login succeeds in wallet but page waits | The SevisPass `sessionId` was not stored or the backend is not polling the upstream status endpoint | Use this corrected version; confirm logs show `upstreamSession: received` and then `wallet authentication completed` |
| Callback succeeds but no dashboard | Frontend return fragment or identity handoff failed | Confirm `AUTH_SUCCESS_URL`, Vite proxy/API base and browser console; the corrected UI auto-continues after verification |

## Remaining SevisPass administrator action

The application's code now sends this exact intended outgoing origin:

```text
http://localhost:5173
```

and this exact callback:

```text
http://localhost:3001/api/auth/callback
```

If the diagnostic still returns `Origin not allowed`, the local code cannot override the server-side allowlist. The SevisPass administrator must confirm or add `http://localhost:5173` for client `pacman5-hei-sevispass`. The issued onboarding sheet confirms a callback pattern under `http://localhost:3001/*`, but it does not document the origin allowlist.

## Test evidence

See [`backend/TEST_RESULTS.md`](backend/TEST_RESULTS.md) for the executed checks and the one remaining live-network limitation.

## Live SevisPass redirect fix

Version 4 includes the corrected wallet-completion polling, application-session recovery, and automatic `#/dashboard` navigation. See [`SEVISPASS_REDIRECT_FIX.md`](SEVISPASS_REDIRECT_FIX.md).
