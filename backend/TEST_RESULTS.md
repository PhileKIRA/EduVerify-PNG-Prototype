# Backend Test Results

Execution date: 19 July 2026

## Installation portability test

```text
Removed node_modules
Ran npm ci using https://registry.npmjs.org/
268 packages installed successfully
No private registry URLs remain in backend/package-lock.json
```

Vitest and `@vitest/coverage-v8` were updated to 3.2.7. The dependency installation reported zero vulnerabilities after the update.

## Automated backend suite

```text
npm test
Test files: 12 passed
Tests: 88 passed
Duration: approximately 1 second
```

## Coverage

```text
npm run test:coverage
Statements: 97.79%
Branches:   83.33%
Functions:  100.00%
Lines:      97.87%
```

Configured thresholds all passed:

```text
Statements 85%
Lines      85%
Functions  85%
Branches   80%
```

## Separate suites

```text
npm run test:unit         6 files, 49 tests passed
npm run test:integration  4 files, 28 tests passed
npm run test:security     2 files, 9 tests passed
```

## Frontend build

```text
npm run build
85 modules transformed
Build completed successfully
```

Vite reported only a non-failing large-bundle warning. The bundle can be split later for performance; it does not block functionality.

## Runtime smoke test

The backend was started in live configuration and returned:

```json
{
  "ok": true,
  "mode": "live",
  "services": {
    "database": "healthy",
    "sso": "not-probed"
  }
}
```

Safe startup logging showed the SSO server, client ID, callback, outgoing origin, success redirect and JWKS URL. It did not show the client secret.

## Live SevisPass diagnostic

The diagnostic script was executed from the build environment. DNS/network access to the external staging host was unavailable, so the script correctly exited with code `2` and reported `fetch failed`. This environment result cannot prove whether the SevisPass server allowlist has been updated.

Run this on the development machine with internet access:

```bash
npm run diagnose:sso
```

If the result is exit code `4`, ask the SevisPass administrator to register the exact configured `SSO_REQUEST_ORIGIN` for the issued client.

## Version 3 live completion test

A new integration test verifies the production QR flow documented by SevisPass: authorize returns an upstream session ID, the local status route polls the upstream session, `/api/user` is retrieved after wallet approval, an HttpOnly application session is created, and the frontend-facing local session becomes authenticated.
