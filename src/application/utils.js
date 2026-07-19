/* ============================================================
   APPLICATION TIER — misc small utilities.
   ============================================================ */
function randToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return "qr_" + [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function now() {
  return new Date().toLocaleString("en-GB", { hour12: false });
}

export { randToken, now };

/* ---------- start/end year helpers ----------
   Entries now carry startYear/endYear; yearRange() renders them for display
   ("2020–2023", or just "2016" when equal) and falls back to the legacy
   free-text `years` field so data saved by older versions still displays. */
function yearRange(e) {
  if (e && e.startYear && e.endYear) return e.startYear === e.endYear ? String(e.startYear) : `${e.startYear}–${e.endYear}`;
  return (e && e.years) || "";
}
/* both selected, and ending year is not earlier than starting year */
function validYearRange(startYear, endYear) {
  return Boolean(startYear && endYear) && Number(endYear) >= Number(startYear);
}
export { yearRange, validYearRange };
