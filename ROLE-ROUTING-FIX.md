# Fix: SevisPass login now routes to the correct portal (not always Student)

## What was wrong
Two bugs forced every live SevisPass login to the Student portal, even for
approved registrars and the admin:

1. FRONTEND (`src/application/sevisAuth.js` → normalizeIdentity)
   It HARD-CODED `role: "student"` for every live identity, throwing away the
   role the backend had correctly computed. This was the main cause.

2. BACKEND (`src/app.js` → GET /api/session/me)
   On a page reload it looked the user up by id (raw), bypassing the UID-based
   role resolver, so a restored session also collapsed to student.

A third, subtler trap: role matching was exact-string only, so if SevisPass
returned the subject in a slightly different FORMAT than the UID you registered
(different case, a `did:...:` prefix, stray spaces), the registrar/admin match
silently missed and fell through to student.

## What changed
- normalizeIdentity now HONOURS the backend role (admin / institution / student)
  and only defaults to student when no role is present.
- /api/session/me now re-resolves the role from the stored SevisPass claims via
  the same UID resolver, so reloads keep you in the right portal.
- UID matching is now format-tolerant (trim + lowercase + strip did:/urn: prefix)
  for both the admin UID and registrar UIDs.
- Every login now LOGS how the role was resolved, e.g.:
    [role] resolved REGISTRAR by UID { sub: '...', institution: 'inst-...' }
    [role] no admin/registrar match — defaulting to STUDENT { sub: '...' }

## If a registrar STILL lands on the student portal
That now means the UID you registered does not match the `sub` SevisPass returns
for that person. Look at the backend console when they scan — you'll see:
    [role] no admin/registrar match — defaulting to STUDENT { sub: 'THE-REAL-VALUE' }
Copy that exact `sub` value and make sure the institution's registered
registrar UID equals it (re-register or update it). Same for the admin:
`ADMIN_SEVIS_UID` in backend/.env must equal the admin's real `sub`.

The `sub` SevisPass returns is the source of truth — register that value.

## Tested
- Role resolver: 8/8 (admin/registrar/student + case/did:/whitespace variants)
- Frontend identity mapping: 4/4 (keeps institution/admin, defaults bare→student)
- End-to-end live + mock resolution: 5/5
