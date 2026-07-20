/* ============================================================
   APPLICATION TIER — SevisPass identity helpers.

   Two concerns live here, both pure functions (no I/O, no state):

   1. formatSevisId(rawId): turn a raw SevisPass subject identifier — which a
      live staging wallet presents as a URN/UUID such as
      "sevis:urn:uuid:9abed473-8fb5-4c24-bc57-276d7a70e..." — into the clean,
      numeric SevisPass ID that the wallet shows in its own ID field. The raw
      identifier is still used everywhere internally (record keys, tokens,
      matching); only what the person SEES is formatted.

   2. resolveSignedInRole(person, institutions): decide, on the browser side,
      whether a just-authenticated identity is a registrar for an approved
      institution — mirroring the backend's UID-based role resolver so a
      registrar always lands in their institution portal, never the student
      portal, even when approvals were made in the prototype's local state.
   ============================================================ */

/* Strip SevisPass / DID / URN wrappers down to the bare identifier, lowercased,
   so "sevis:urn:uuid:9abed473-…", "urn:uuid:9abed473-…" and "9abed473-…" all
   canonicalize to the same value. Matches the backend's canonUid semantics. */
function canonUid(value) {
  let s = String(value == null ? "" : value).trim().toLowerCase();
  if (!s) return "";
  if (s.startsWith("sevis:")) s = s.slice("sevis:".length);
  const colon = s.lastIndexOf(":");
  if ((s.startsWith("did:") || s.startsWith("urn:")) && colon !== -1) s = s.slice(colon + 1);
  return s;
}

/* Deterministically map a raw SevisPass identifier to a 12-digit number and
   group it as "SP-#### #### ####". Deterministic means the same identity always
   shows the same number. Seeded prototype personas (e.g. "SP-1001") are already
   clean, so they pass through unchanged. */
function formatSevisId(rawId) {
  if (rawId == null || rawId === "") return rawId;
  const s = String(rawId).trim();

  // Idempotent: an already-formatted "SP-#### #### ####" comes back normalized,
  // so formatSevisId(formatSevisId(x)) === formatSevisId(x).
  const already = s.toUpperCase().match(/^SP-?\s*(\d{4})\s*(\d{4})\s*(\d{4})$/);
  if (already) return `SP-${already[1]} ${already[2]} ${already[3]}`;

  // Already a clean short SevisPass code (seeded personas like "SP-1001").
  if (/^sp-?\w{2,10}$/i.test(s) && !/[:]|urn|uuid|did/i.test(s)) {
    return s.toUpperCase().startsWith("SP-") ? s.toUpperCase() : `SP-${s.toUpperCase().replace(/^SP/, "")}`;
  }

  // Reduce a wrapped identifier (sevis:/urn:/did:) to its trailing segment,
  // then keep only hex characters (a UUID is hex + dashes).
  let core = s.toLowerCase();
  const colon = core.lastIndexOf(":");
  if (colon !== -1) core = core.slice(colon + 1);
  const hex = core.replace(/[^0-9a-f]/g, "");
  if (!hex) return s; // nothing numeric to derive from — leave it untouched

  // Fold the hex into a stable 12-digit decimal.
  let n = 0n;
  for (const ch of hex) n = (n * 16n + BigInt(parseInt(ch, 16))) % 1000000000000n;
  const digits = n.toString().padStart(12, "0");
  return `SP-${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
}

/* Resolve the portal a signed-in identity belongs to, using the same priority
   as the backend:
     - a person already provisioned as a non-student (seeded registrar/admin,
       or a role the backend already resolved) keeps that role;
     - otherwise, if their SevisPass UID is the registrar UID of an APPROVED
       institution, they are that institution's registrar;
     - if the matched institution is still pending, they remain a student but
       carry a pendingInstitution flag;
     - everyone else stays a student.
   This is what guarantees a registrar's wallet scan opens their institution
   portal rather than the student portal. */
function resolveSignedInRole(person, institutions = []) {
  if (!person) return person;

  // Already a provisioned non-student with a home institution — trust it.
  if (person.role && person.role !== "student" && person.instId) return person;

  const uid = canonUid(person.sub || person.id);
  if (!uid) return person;

  const inst = (institutions || []).find((i) => canonUid(i.registrarUid) === uid);
  if (!inst) return person;

  if (inst.status === "approved") {
    return {
      ...person,
      role: "institution",
      instId: inst.id,
      name: inst.registrarName || person.name,
      tier: "SevisPass — verified registrar",
      pendingInstitution: undefined,
    };
  }

  // Recognised registrar UID, but the institution is not approved yet.
  return {
    ...person,
    role: "student",
    instId: null,
    pendingInstitution: { id: inst.id, name: inst.name },
  };
}

/* Two SevisPass IDs refer to the same person if they are literally equal (case
   aside) OR if they map to the same clean SevisPass number. This lets a verifier
   enter EITHER the raw identifier from a sealed document OR the clean number the
   student sees, and still match the stored record. */
function sameSevisId(a, b) {
  if (a == null || b == null) return false;
  const A = String(a).trim();
  const B = String(b).trim();
  if (!A || !B) return false;
  if (A.toUpperCase() === B.toUpperCase()) return true;
  return formatSevisId(A) === formatSevisId(B);
}

export { canonUid, formatSevisId, sameSevisId, resolveSignedInRole };
