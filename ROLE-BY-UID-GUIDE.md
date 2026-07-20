# Role by SevisPass UID — Admin, Registrar, Student

This build resolves each person's role from their **SevisPass UID** (the `sub`
claim in their verified credential) at login. Implemented and tested end to end.

## The rule
When someone signs in with SevisPass, the backend decides their role by UID:

1. **The one admin.** If their UID equals `ADMIN_SEVIS_UID`, they are the system
   administrator. There is exactly one admin — that person only.
2. **An approved registrar.** If their UID is the registrar UID of an *approved*
   institution, they sign in as that institution's registrar and get the full
   institution portal (verify students, upload records, etc.).
3. **A pending registrar.** If their UID belongs to an institution still awaiting
   admin approval, they sign in as a student for now, with a "pending" flag.
4. **Everyone else** is a student.

## Set the admin (one-time)
1. Have the person who will be admin sign in once with their Staging SevisWallet.
2. In the backend console, read the `sub=...` value from the login log — that is
   their SevisPass UID.
3. Put it in `backend/.env`:

       ADMIN_SEVIS_UID=<that UID>

4. Restart the backend. From now on, when that person scans the QR on the
   "Institution & administrator" sign-in, they become the system admin.

## Register a registrar to an institution
1. On the sign-in screen, choose **Institutions → Register a new institution**.
2. Fill in the institution details **and the Registrar's SevisPass UID** (the new
   required field). This is the UID of the person who will run that institution.
3. Submit. The institution goes to the admin's pending queue.
4. The **admin** signs in and approves the institution.
5. Now, when the person **with that UID** scans the QR, they sign in as that
   institution's **registrar** and can perform all institution functions.

Until approval, that person's UID signs in as a normal student, and they are not
shown in the institution persona list.

## What changed in the code
Backend:
- `src/config.js` — reads `ADMIN_SEVIS_UID`.
- `src/db.js` — institutions now store `registrar_uid` (+ name, contact), with an
  in-place migration; added `getUserBySub`, `getInstitutionByRegistrarUid`,
  `registerInstitution`, `setInstitutionStatus`, `assignRole`.
- `src/app.js` — `normalizeUser` resolves role by UID (the rule above); new
  endpoints: `POST /api/institutions/register`, `POST /api/admin/institutions/:id/approve`,
  `POST /api/admin/institutions/:id/reject` (admin-guarded), and `GET /api/me`.

Frontend:
- Registration form has a required **Registrar's SevisPass UID** field.
- The institution/admin persona list hides registrars whose institution is not
  yet approved (mirrors the backend). Routing by role was already correct.

## Tested
- Role resolution: 6/6 scenarios (admin, approved registrar, pending registrar,
  student, post-approval promotion, registrar-never-admin).
- Database: 5/5 (register → find-by-uid → approve → role binding → listing).
- API endpoints: 4/4 (register creates pending, admin routes 403 without admin,
  duplicate UID rejected, missing UID rejected).

## Note on the Admin dashboard approve button
The Admin dashboard's approve/reject currently updates the app's in-memory data
(which drives the demo, including who may sign in as a registrar). The live
admin API endpoints (`/api/admin/institutions/:id/approve|reject`) are wired and
tested on the backend; connect the dashboard button to them if/when you run the
full multi-device live flow. For the hackathon demo, the current behaviour is
complete and consistent.

## Reminder
Live wallet sign-in still depends on SevisPass issuing an authorize QR bound to
your client_id + redirect_uri (the outstanding DICT question). In `MOCK_MODE=true`
the entire admin/registrar/student role system works for your demo with no
external dependency.
