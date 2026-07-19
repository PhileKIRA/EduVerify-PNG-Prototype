# Deploying EduVerify PNG to Render (free staging preview)

One free Render **web service** serves both the API and the built React frontend
from a single origin:

```
  Team browser ──HTTPS──> Render web service
                            ├─ /            React build (dist/)
                            └─ /api/*        Express + SQLite
```

Why one service: same origin means no CORS and no cross-service URL wiring, the
backend keeps its DICT-hardened auth logic unchanged, and it's $0. The
[`render.yaml`](render.yaml) blueprint presets everything for a mock-mode preview.

> **Preview = mock mode** (`MOCK_MODE=true`): the persona picker stands in for a
> real SevisPass wallet. Anyone with the URL can log in as any seeded persona —
> fine for a team look-and-feel test, not a production config.

---

## Deploy (about 3 clicks)

1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect the GitHub repo **`dale-sapalonah/EduVerify-PNG`**. Render reads
   `render.yaml` and creates the `eduverify-png` web service — build, start
   command, health check, Node version, and mock-mode env are all preset.
3. Click **Apply / Deploy**. First build takes a few minutes (installs deps,
   builds the frontend, compiles `better-sqlite3`).
4. Open the service URL (e.g. `https://eduverify-png.onrender.com`).
   - Health check: `…/api/health` → `{ "ok": true, "mode": "mock", "db": "connected" }`
   - Smoke test: **Student sign in → Continue with SevisPass** → a real QR renders
     → pick a persona (e.g. Philemon Kira) → **Identity verified**.

No environment variables to enter — the defaults cover the whole staging preview.

## The one free-tier catch: cold starts

Render's **free** web service sleeps after ~15 min of inactivity and cold-starts
on the next request (~30–50s). So the first page load after idle is slow; then
it's instant until it idles again. Two options:

- **Accept it** — fine for occasional team testing.
- **Keep it warm** — create a free scheduled ping at <https://cron-job.org> (or
  UptimeRobot) hitting `https://<your-service>.onrender.com/api/health` every
  10 minutes. Free tier has no persistent disk, so this also keeps the in-memory
  session state alive between tests.

Note: the free tier has **no persistent disk**, so the SQLite file resets on
redeploy/restart. Harmless here — the DB re-seeds on boot and sessions live only
10 minutes. Do **not** rely on this for real data.

## Region

`render.yaml` requests **Singapore** (closest free region to PNG). If it's
unavailable on the free plan, Render will fall back or you can change `region:`
to an available one (e.g. `oregon`, `frankfurt`) — expect a little more latency.

---

## Switching to production (real SevisPass) later

In the Render dashboard → the service → **Environment**:

- `MOCK_MODE` = `false`
- `OIDC4VP_SERVER_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `CALLBACK_URL` = your real
  SevisPass values (kept server-side on Render — never in the frontend build)
- `ALLOWED_ORIGINS` / `APP_ORIGIN` = your production URL

Also move off the free plan (persistent disk or managed Postgres) so data and
sessions survive restarts — see the "DICT compliance" and "Migrating from SQLite
to PostgreSQL" sections in [README.md](README.md). For production handling real
PNG credential data, also weigh a Singapore VPS or sovereign host for data
residency.
