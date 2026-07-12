# EduVerify PNG

**Academic Credential Verification System — Papua New Guinea (Phase 1 prototype)**

EduVerify PNG is a prototype platform for issuing, sealing, and verifying academic
credentials in Papua New Guinea, built around the SevisPass digital identity concept.
It demonstrates the full journey: students collect their qualifications, PNG
institutions certify records with a cryptographic (SHA-256) integrity seal, an admin
approves institutions and reviews overseas qualifications, and employers verify a
credential by QR token or by uploading a document plus an ID number.

## ⚠️ Prototype scope

This is a **front-end-only prototype**. All data lives in the browser's memory while
the page is open:

- Refreshing the page resets everything to the built-in sample data.
- Data is **not** shared between users or devices.
- The SevisPass login is **mocked** (a persona picker), and the QR codes are visual
  placeholders, not scannable codes.

This is intentional for a demo. Adding real accounts, a database, and shared storage
is future (Phase 2) work.

## Run locally

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install      # install dependencies (first time only)
npm run dev      # start the dev server
```

Then open the printed URL (usually http://localhost:5173).
To open it on your **phone**, make sure the phone is on the same Wi-Fi and use the
"Network" URL that Vite prints (e.g. http://192.168.x.x:5173).

## Build for production

```bash
npm run build    # outputs a static site to dist/
npm run preview  # preview the production build locally
```

## Deploy

Because the built app is a plain static site, it can be hosted for free on
**Vercel**, **Netlify**, or **Cloudflare Pages**. Connect this GitHub repository to
one of them; the build command is `npm run build` and the output/publish directory is
`dist`.

## Tech

- React 18
- Vite
- Tailwind CSS
- Web Crypto API (SHA-256 hashing, runs in the browser)
