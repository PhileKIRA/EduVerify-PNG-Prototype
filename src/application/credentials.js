/* ============================================================
   APPLICATION TIER — registrar username/password credentials.

   Institutions now sign in with a username and password created when the
   institution is registered (SevisPass / biometrics are reserved for students).
   Passwords are never stored or persisted in the clear: we keep only a SHA-256
   hash of a peppered password. This is a Phase 1 prototype convenience — a
   production system would use a slow, salted KDF (bcrypt/scrypt/argon2) on a
   server, never in the browser.
   ============================================================ */
import { sha256Hex } from "./crypto";

// Fixed application pepper. Kept constant so a seeded demo hash and a hash
// computed at runtime for the same password agree.
const PW_PEPPER = "eduverify-png::registrar::v1::";

/* Hash a plaintext password for storage/comparison. Returns a hex digest. */
async function hashPassword(password) {
  return sha256Hex(PW_PEPPER + String(password == null ? "" : password));
}

/* Normalize a username for case-insensitive matching. */
function normalizeUsername(username) {
  return String(username == null ? "" : username).trim().toLowerCase();
}

/* Verify a plaintext password against a stored hash. */
async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const candidate = await hashPassword(password);
  return candidate === storedHash;
}

/* Basic strength gate for the prototype: at least 6 characters. */
function isPasswordAcceptable(password) {
  return typeof password === "string" && password.length >= 6;
}

export { hashPassword, verifyPassword, normalizeUsername, isPasswordAcceptable, PW_PEPPER };
