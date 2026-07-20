/* ============================================================
   APPLICATION TIER — small shared text-normalization helper used by
   both the hashing layer (crypto.js) and the document-parsing layer
   (verification.js), so both build the "same" academic-data shape.
   ============================================================ */
function normText(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().toLowerCase();
}

export { normText };
