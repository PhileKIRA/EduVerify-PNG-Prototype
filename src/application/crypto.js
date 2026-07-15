/* ============================================================
   APPLICATION TIER — hashing & record-sealing logic.
   record_hash = SHA256( canonical_json(structured_data) + SHA256(doc_bytes) )
   Covered by unit tests in /tests/crypto.test.js
   ============================================================ */

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
function normText(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().toLowerCase();
}
function coreAcademicData(s) {
  return {
    studentId: String(s.studentId || "").trim().toUpperCase(),
    institution: normText(s.institution),
    program: normText(s.program),
    graduationYear: (String(s.completionYear || "").match(/(19|20)\d{2}/) || [normText(s.completionYear)])[0],
    gpa: normText(s.gpa),
  };
}
async function computeDataHash(structured, salt = "") {
  const data = canonicalize(coreAcademicData(structured));

  return sha256Hex(data + salt);
}

function extractAcademicData(raw) {
  let text = String(raw).replace(/\r\n/g, "\n");
  if (text.includes("<pre>")) {
    const inner = text.split("<pre>")[1].split("</pre>")[0].replace(/&lt;/g, "<").replace(/&amp;/g, "&");
    text = inner + "\n" + text; // prefer the sealed certificate body; the HTML summary table remains as backup
  }
  const pick = (labels) => {
    for (const lb of labels) {
      const m = text.match(new RegExp(lb + "(?:\\s*:\\s*|<\\/b><\\/td><td>)([^<\\n]+)", "i"));
      if (m) return m[1].trim();
    }
    return "";
  };
  const idRaw = pick(["SevisPass ID", "Student ID"]) || (text.match(/SP-\d{3,}/i) || [""])[0];
  const idM = String(idRaw).match(/SP-\d{3,}/i);
  const yearRaw = pick(["Year of completion", "Completion year", "Graduation year"]);
  const yearM = String(yearRaw).match(/(19|20)\d{2}/);
  return {
    studentId: idM ? idM[0].toUpperCase() : "",
    institution: normText(pick(["Institution"])),
    program: normText(pick(["Program", "Programme", "Qualification"])),
    graduationYear: yearM ? yearM[0] : normText(yearRaw),
    gpa: normText(pick(["Grade point average", "GPA"])),
  };
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

export { sha256Hex, canonicalize, normText, coreAcademicData, computeDataHash, extractAcademicData, computeRecordHash, readFileWithHash };
