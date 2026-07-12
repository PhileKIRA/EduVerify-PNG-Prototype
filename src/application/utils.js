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
