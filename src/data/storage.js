/* ============================================================
   DATA TIER — browser persistence (localStorage).

   Everything the app holds in memory — entries, sealed records, share
   tokens, verification checks, the audit log, institutions, users, and
   student profiles — is saved here so a page refresh no longer wipes it.
   The signed-in session is stored separately so signing out keeps data.

   Records may carry an attached file (raw bytes as a Uint8Array); JSON
   can't store those directly, so bytes are base64-encoded on save and
   restored on load. If the data outgrows the localStorage quota, we
   retry once with attached file bytes stripped (the record, its hash,
   and the sealed file fingerprint all survive — only the re-download
   of the original file is lost) rather than losing everything.
   ============================================================ */

const DATA_KEY = "eduverify-png-data-v1";
const SESSION_KEY = "eduverify-png-session-v1";

/* ---------- Uint8Array <-> base64 (chunked to avoid call-stack limits) ---------- */
function bytesToB64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const serializeFile = (file) => (file ? { ...file, bytes: bytesToB64(file.bytes || new Uint8Array()) } : null);
const hydrateFile = (file) => (file ? { ...file, bytes: b64ToBytes(file.bytes || "") } : null);

const serializeRecords = (records) => records.map((r) => (r.file ? { ...r, file: serializeFile(r.file) } : r));
const hydrateRecords = (records) => records.map((r) => (r.file ? { ...r, file: hydrateFile(r.file) } : r));
/* overseas submissions can carry an uploaded file before a record exists */
const serializeEntries = (entries) => entries.map((e) => (e.pendingFile ? { ...e, pendingFile: serializeFile(e.pendingFile) } : e));
const hydrateEntries = (entries) => entries.map((e) => (e.pendingFile ? { ...e, pendingFile: hydrateFile(e.pendingFile) } : e));

/* ---------- data ---------- */
function saveState(state) {
  const payload = { v: 1, savedAt: Date.now(), ...state, records: serializeRecords(state.records || []), entries: serializeEntries(state.entries || []) };
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    /* likely QuotaExceededError from large attached files — retry without file bytes */
    try {
      payload.records = (state.records || []).map((r) => (r.file ? { ...r, file: null } : r));
      payload.entries = (state.entries || []).map((e) => (e.pendingFile ? { ...e, pendingFile: null } : e));
      localStorage.setItem(DATA_KEY, JSON.stringify(payload));
      console.warn("EduVerify: storage quota reached — saved without attached file bytes (records, hashes, and sealed fingerprints are intact).");
      return true;
    } catch (e2) {
      console.warn("EduVerify: could not persist data:", e2 && e2.message);
      return false;
    }
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1 || !Array.isArray(d.entries) || !Array.isArray(d.records)) return null;
    return { ...d, records: hydrateRecords(d.records), entries: hydrateEntries(d.entries) };
  } catch (e) {
    console.warn("EduVerify: stored data unreadable — starting fresh:", e && e.message);
    return null;
  }
}

/* ---------- signed-in session ---------- */
function saveSession(user) {
  try {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw);
    return u && u.id && u.role && u.name ? u : null;
  } catch { return null; }
}

/* ---------- full reset (testing tool) ---------- */
function clearAll() {
  try { localStorage.removeItem(DATA_KEY); localStorage.removeItem(SESSION_KEY); } catch {}
}

export { saveState, loadState, saveSession, loadSession, clearAll };
