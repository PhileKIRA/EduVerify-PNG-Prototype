# EduVerify PNG — Phase 1 React Prototype

A credential-verification platform for Papua New Guinea, built against
SevisPass SSO (OIDC4VP protocol). This is the **3-tier refactor** of the
original single-file `App.jsx` prototype, restructured into
`data` / `application` / `presentation` layers, with the issues from the
mentor code review fixed.

> ⚠️ **Prototype scope.** All application data (students, records, tokens,
> audit log) lives in React state and resets on refresh. There is no
> database here — see the separate PHP/MySQL 3-tier build for a
> persistent, database-backed version of this app.

## What this demonstrates

- **Mock SevisPass login** (QR-based OIDC4VP flow) with a role/persona picker — Student, PNG Institution, Admin, Employer
- **Student**: profile, PNG + overseas qualification entries, QR-based record sharing
- **PNG Institution**: verification queue, record upload → SHA-256 "sealing"
- **Admin**: institution approvals, overseas review queue, audit log
- **Employer**: verify a credential by QR token or by document + student ID

Hashing model: `record_hash = SHA256( canonical_json(structured_data) + SHA256(doc_bytes) )`.
Verification compares the **key academic data** (student ID, institution,
program, graduation year, GPA), not raw file bytes — see
`src/application/crypto.js`.

## Project structure

```
src/
  data/            seed personas & institutions (would back onto a real API/DB)
    seedData.js
  application/      business logic, no JSX
    crypto.js        hashing & record-sealing (tested — see tests/)
    textUtils.js      clipboard, timestamps, token generation
    sevisAuth.js      SevisPass OIDC4VP client (state/CSRF, expiry, logout)
    certificate.js    real QR code generation + printable certificate HTML
  presentation/     React components
    theme.js
    App.jsx           root: session state + role-based routing
    components/
      ErrorBoundary.jsx
      Landing.jsx
      Login.jsx
      StudentView.jsx
      InstitutionView.jsx
      AdminView.jsx
      EmployerView.jsx
      ui.jsx          shared UI atoms (Badge, Card, Btn, ...)
  main.jsx
  index.css
public/
  logo-emblem.webp, logo-full.webp   (previously inlined base64 in JS — see fixes below)
server/            Express proxy that holds the SevisPass client secret
tests/             Vitest unit tests for the hashing logic
```

## Running it

```bash
npm install
npm run dev       # starts Vite on http://localhost:5173
```

The app runs entirely in **mock mode** by default (`SEVISPASS_CONFIG.mock = true`
in `src/application/sevisAuth.js`) — no backend is required to demo it.

To build for deployment (e.g. GitHub Pages):

```bash
npm run build
npm run preview   # serve the production build locally to sanity-check it
```

`vite.config.js` sets `base: "/EduVerify-PNG/"` for GitHub Pages project
sites. Override with `VITE_BASE_PATH` if you deploy under a different path.

### Running the tests

```bash
npm test
```

### Going live (real SevisPass server)

1. `cd server && npm install`
2. `cp .env.example .env` and fill in `SEVISPASS_SERVER_URL`, `SEVISPASS_CLIENT_ID`, `SEVISPASS_CLIENT_SECRET`
3. `npm start` (listens on `:8787` by default)
4. Set `SEVISPASS_CONFIG.mock = false` in `src/application/sevisAuth.js`

In dev, Vite proxies `/api/*` to `localhost:8787` (see `vite.config.js`), so
the browser only ever talks to your own backend — never to SevisPass
directly, and never with the client secret.

## Fixes applied vs. the reviewed prototype

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | Critical | `clientSecret` shipped to the browser | Removed from frontend entirely; lives only in `server/.env` (`server/index.js`) |
| 2 | Critical | No `base` in `vite.config.js` → blank page on GitHub Pages | `base: "/EduVerify-PNG/"` set, overridable via `VITE_BASE_PATH` |
| 3 | Important | OAuth `state` never verified → no CSRF protection | `sevisAuth.js` stores state in `sessionStorage` and verifies it on callback |
| 4 | Important | Unsanitized QR SVG via `dangerouslySetInnerHTML` | Sanitized with DOMPurify (SVG profile) in `Login.jsx` |
| 5 | Important | "WebAuthn" button was cosmetic | Disabled and honestly labeled "coming soon" until real WebAuthn is implemented |
| 6 | Important | No backend for the guide's proxy endpoints | `server/index.js` implements `/initiate`, `/session/status`, `/user`, `/logout` |
| 7 | Important | No warning that state resets on refresh | Prototype disclaimer banner on the login screen |
| 8 | Minor | `state` never expired | 10-minute TTL enforced in `sevisAuth.js` |
| 9 | Minor | Logout only cleared local state | `sevisAuth.logout()` calls the backend to invalidate the session |
| 10 | Minor | QR code wasn't actually scannable | Real QR generation via `qrcode-generator` in `certificate.js` |
| 11 | Minor | Large base64 logos inlined in the JS bundle | Moved to `public/logo-emblem.webp` and `public/logo-full.webp` |
| 12 | Minor | No ErrorBoundary — uncaught errors blanked the app | `ErrorBoundary.jsx` wraps the app in `main.jsx` |
| 13 | Minor | `README.md` was just a title line | This file |
| 14 | Minor | No tests for the hashing/verification logic | `tests/crypto.test.js` (Vitest) |

See `EduVerify-PNG_Code_Review.docx` for the full write-up, including the
separate 26-point DICT Developer Integration Guide alignment table.

## Known limitations (by design, Phase 1 scope)

- No persistence — refreshing the page resets all data
- Mock mode simulates the SevisPass wallet scan instantly; there's no real device flow
- WebAuthn/biometric login is not implemented (button is disabled)
- No rate limiting on the backend proxy
