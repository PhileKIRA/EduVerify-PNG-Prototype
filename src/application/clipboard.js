/* ============================================================
   APPLICATION TIER — clipboard helpers.
   The async Clipboard API is often blocked in sandboxed iframes, so
   fall back to a hidden textarea + execCommand("copy").
   ============================================================ */
/* copy text to the clipboard reliably: the async Clipboard API is often blocked in
   sandboxed iframes, so fall back to a hidden textarea + execCommand("copy"). */
function fallbackCopy(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      return true;
    }
  } catch (e) {}
  return fallbackCopy(text);
}

/* select the full contents of an element on click, so text can always be
   copied manually (Ctrl+C) even where programmatic clipboard access is blocked */
function selectAllOnClick(ev) {
  try {
    const range = document.createRange();
    range.selectNodeContents(ev.currentTarget);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) {}
}

export { copyText, fallbackCopy, selectAllOnClick };
