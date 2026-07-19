/* ============================================================
   APPLICATION TIER — cryptographic hashing & data-integrity helpers.
   record_hash = SHA256( canonical_json(structured_data) + SHA256(doc_bytes) )
   ============================================================ */
import { normText } from "./textUtils";

/* ---------- crypto helpers ---------- */
async function sha256Hex(input) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalize(v) {
  if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonicalize(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}

/* ---------- data-level verification ----------
   The verification verdict is based on the KEY ACADEMIC DATA, not raw file bytes:
   1) extract student ID, institution, programme, graduation year, and GPA from
      the presented document, 2) build a standardized (normalized, key-sorted)
      representation, 3) hash it with SHA-256, and 4) compare against the hash
      generated the same way from the official academic record on file. */
function coreAcademicData(s) {
  return {
    studentId: String(s.studentId || "").trim().toUpperCase(),
    institution: normText(s.institution),
    program: normText(s.program),
    graduationYear: (String(s.completionYear || "").match(/(19|20)\d{2}/) || [normText(s.completionYear)])[0],
    gpa: normText(s.gpa),
  };
}
async function computeDataHash(structured) {
  return sha256Hex(canonicalize(coreAcademicData(structured)));
}

async function computeRecordHash(structured, docText) {
  const fileHash = await sha256Hex(docText);
  return sha256Hex(canonicalize(structured) + fileHash);
}

/* read an uploaded file: keep the raw bytes and compute its SHA-256 fingerprint.
   The fingerprint is sealed into the record's structured data, so the file is
   covered by the record hash and can be independently verified by employers. */
async function readFileWithHash(file) {
  if (!file) return null;
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const sha256 = await sha256Hex(bytes);
  return { name: file.name, type: file.type || "application/octet-stream", size: file.size, bytes, sha256 };
}

export { sha256Hex, canonicalize, coreAcademicData, computeDataHash, computeRecordHash, readFileWithHash };
