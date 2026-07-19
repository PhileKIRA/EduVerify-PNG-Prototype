# Security model — authentication

EduVerify PNG uses **federated identity**: it never creates user accounts or
handles passwords. Identity is asserted by **SevisPass** (PNG's national digital
ID) via OIDC4VP, and the backend's job is to verify that assertion and bind it to
a short-lived session. This document describes the controls on that flow.

## Trust boundary

The browser only ever talks to this backend's `/api/*` routes. The SevisPass
client secret and the verified access/VP token live **only** on the server; the
browser receives an opaque session handle, never the token.

## The login flow and its controls

```
initiate ──> (wallet scans QR) ──> SSO callback ──> status poll ──> get identity
```

| Control | What it does | Where |
|---|---|---|
| **`state` (CSRF)** | Random UUID minted server-side, stored with the session, echoed to the browser which stashes it in `sessionStorage` and re-checks it before accepting the identity. Binds the completion to the browser that started it. | `initiate`, `getUser`, `callback` |
| **`nonce` (anti-replay)** | Random UUID bound to the session; the VP token must carry the **same** nonce or it's rejected. | `callback` → `verifyVpToken` |
| **VP-token verification** | The token from the SSO is a JWT. Its **signature** (JWKS RS256/ES256, or an HS256 secret), **audience** (`CLIENT_ID`), and **nonce** are all verified before it's trusted. | `verifyVpToken` |
| **Identity from token only** | The authenticated user is taken **only** from the verified token's `sub`. Client-supplied `userId`/`sub` fields are ignored — closes the privilege-escalation-by-body-param bypass. | `callback` |
| **Fail closed** | If token verification isn't configured (no `SSO_JWKS_URI`/`JWT_SECRET`), live logins are refused rather than trusted. | `verifyVpToken` |
| **Single-use identity handoff** | `GET /api/user` deletes the session once it returns the identity, so a leaked session handle can't be replayed to re-fetch it. | `getUser` |
| **Short expiry** | Sessions expire after `STATE_EXPIRY_MINUTES` (default 10); expired ones are purged. | throughout |
| **Server-side token storage** | The VP/access token is stored in the DB and never sent to the browser; logout deletes the session and token. | `callback`, `logout` |

## Rate limiting (anti-brute-force / DoS)

Tiered so a normal login is never throttled while abuse is capped:

- `POST /auth/initiate`, `/auth/simulate-scan`, `/auth/callback` — **20 / 15 min** per IP.
- `GET /session/status` — **40 / min** per IP (the flow polls ~30/min; comfortably under).
- All other `/api` reads — **200 / 15 min** per IP.

## Transport

HTTPS is enforced by the host (Render/Cloudflare). The app sends **HSTS**,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
no-referrer`, and disables `x-powered-by`. CORS is restricted to `ALLOWED_ORIGINS`.

## Mock mode vs live mode — the critical boundary

| | `MOCK_MODE=true` (staging/demo) | `MOCK_MODE=false` (production) |
|---|---|---|
| Wallet | Simulated by a persona picker | Real SevisPass wallet |
| `POST /auth/simulate-scan` | **Enabled** — anyone can sign in as any persona, including admin | **Disabled** (403) |
| Token verification | n/a | Required; fails closed if unconfigured |

**⚠️ Mock mode is not a security boundary.** With `MOCK_MODE=true`, anyone who can
reach the URL can authenticate as any seeded persona (including the System
Administrator). It is safe only because the data is fictional demo data. The
server logs a loud `[SECURITY]` warning at startup when mock mode is on.

## Going-to-production checklist

- [ ] `MOCK_MODE=false`
- [ ] `SSO_JWKS_URI` (preferred) **or** `JWT_SECRET` configured — else logins fail closed
- [ ] `CLIENT_ID` set (checked as the token audience) and `CLIENT_SECRET` set (server-side only)
- [ ] `ALLOWED_ORIGINS` / `ALLOWED_CALLBACK_URLS` set to production URLs
- [ ] Real, persistent database (not the free-tier ephemeral SQLite) so sessions survive restarts
- [ ] Confirm the SSO issues tokens whose `nonce` and `aud` claims match what this server checks

## Known residual considerations

- The session handle travels as a `?session=` query parameter (matching the DICT
  guide's own examples). It's a 122-bit random UUID, single-use for identity, and
  short-lived; for defence-in-depth a future step could move it to an httpOnly,
  `Secure`, `SameSite` cookie.
- In live mode `/api/user` returns the verified token's standard claims (`sub`,
  `name`, `email`, `ageOver18`, `validUntil`, `credentials`), matching the DICT
  guide's shape. The exact claim **names** should be reconfirmed against the real
  SevisPass token when live credentials are available.
