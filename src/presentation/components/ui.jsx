import React from "react";
import { FONT, MONO, useC } from "../theme";
import { encodeQR } from "../../application/qrcode";
import { YEAR_OPTIONS } from "../../data/referenceData";

// Pill badge. Same status map keys as before.
function Badge({ status }) {
  const C = useC();
  const map = {
    pending_institution_verification: ["Pending institution", C.amber, C.amberPale],
    png_verified: ["Verified — awaiting record", C.amber, C.amberPale],
    awaiting_upload: ["Awaiting overseas upload", C.amber, C.amberPale],
    locked: ["Locked", C.muted, C.surface2],
    pending_admin_review: ["Pending admin review", C.amber, C.amberPale],
    certified: ["Certified", C.green, C.greenPale],   // certified now reads as success-green
    rejected: ["Rejected", C.red, C.redPale],
    approved: ["Approved", C.green, C.greenPale],
    pending: ["Pending approval", C.amber, C.amberPale],
    verified: ["Verified", C.green, C.greenPale],
    failed: ["Verification failed", C.red, C.redPale],
  };
  const [label, fg, bg] = map[status] || [status, C.muted, C.surface2];
  const dot = ["certified","approved","verified"].includes(status) ? C.green
            : status === "rejected" || status === "failed" ? C.red : C.amber;
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold rounded-full"
      style={{ fontSize: 11.5, color: fg, background: bg, padding: "6px 11px" }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />
      {label}
    </span>
  );
}

// Fingerprint bars — same hashing, just rounded + slightly tighter.
function FingerprintStrip({ hash }) {
  const C = useC();
  if (!hash) return null;
  const bars = [];
  for (let i = 0; i < 16; i++) {
    const byte = parseInt(hash.slice(i * 2, i * 2 + 2), 16) || 0;
    const hue = 36 + (byte % 40) - 20, light = 30 + (byte % 45);
    bars.push(<div key={i} style={{ width: 5, height: 10 + (byte % 14), background: `hsl(${hue} 55% ${light}%)`, borderRadius: 2 }} />);
  }
  return <div className="flex gap-0.5 items-end">{bars}</div>;
}

// Seal — smaller, inset gold ring on surface.
function Seal({ hash }) {
  const C = useC();
  return (
    <div className="flex flex-col items-center justify-center rounded-full shrink-0"
      style={{ width: 66, height: 66, background: C.surface, border: `2px solid ${C.gold}`,
               boxShadow: `inset 0 0 0 3px ${C.goldPale}` }}>
      <div style={{ fontFamily: MONO, fontSize: 7, color: C.goldDeep, letterSpacing: "0.1em", fontWeight: 800 }}>CERTIFIED</div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink }}>{hash ? hash.slice(0, 8) : "········"}</div>
      <div style={{ fontFamily: MONO, fontSize: 6.5, color: C.faint, letterSpacing: "0.08em" }}>SHA-256</div>
    </div>
  );
}

// QRCode — REAL scannable QR (ISO/IEC 18004, byte mode, ECC M) via the
// in-house encoder in application/qrcode.js. Any standard reader decodes it.
function QRCode({ value, size = 156 }) {
  const C = useC();
  const qr = React.useMemo(() => {
    try { return encodeQR(String(value || " ")); } catch { return null; }
  }, [value]);
  if (!qr) return null;
  const quiet = 4, dim = qr.size + quiet * 2;
  const rects = [];
  for (let y = 0; y < qr.size; y++)
    for (let x = 0; x < qr.size; x++)
      if (qr.modules[y][x]) rects.push(<rect key={y + "-" + x} x={x + quiet} y={y + quiet} width="1" height="1" />);
  return (
    <svg viewBox={`0 0 ${dim} ${dim}`} width={size} height={size} role="img" aria-label={`QR code: ${value}`}
      shapeRendering="crispEdges"
      style={{ background: "#fff", borderRadius: 14, border: `1px solid ${C.lineStrong}` }}>
      <g fill="#14110C">{rects}</g>
    </svg>
  );
}

// YearRangeSelect — paired Starting/Ending year dropdowns used by every form
// that previously had a free-text "Years" field. The ending list only offers
// years >= the chosen starting year, and an inline error shows if an already-
// selected ending year becomes earlier than a newly chosen starting year.
function YearRangeSelect({ startYear, endYear, onChange, requiredMark = true }) {
  const C = useC();
  const invalid = startYear && endYear && Number(endYear) < Number(startYear);
  const endOptions = startYear ? YEAR_OPTIONS.filter((y) => Number(y) >= Number(startYear)) : YEAR_OPTIONS;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Starting year${requiredMark ? "" : " (optional)"}`}>
          <select className={inputCls} style={inputStyle(C)} value={startYear} onChange={(e) => onChange({ startYear: e.target.value, endYear })}>
            <option value="">Select starting year…</option>
            {YEAR_OPTIONS.map((y) => <option key={y}>{y}</option>)}
          </select>
        </Field>
        <Field label={`Ending year${requiredMark ? "" : " (optional)"}`}>
          <select className={inputCls} style={inputStyle(C)} value={endYear} onChange={(e) => onChange({ startYear, endYear: e.target.value })}>
            <option value="">Select ending year…</option>
            {endOptions.map((y) => <option key={y}>{y}</option>)}
          </select>
        </Field>
      </div>
      {invalid && <p className="text-xs -mt-1 mb-2" style={{ color: C.red }}>Ending year cannot be earlier than the starting year.</p>}
    </>
  );
}

// Modal — centered pop-up dialog with a dimmed backdrop. Closes on backdrop
// click or Escape. Content scrolls internally on small screens.
function Modal({ onClose, children, maxWidth = 640 }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const C = useC();
  return (
    <div onClick={onClose} role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(20,17,12,0.55)", backdropFilter: "blur(3px)",
               display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 20, padding: 22,
                 width: "100%", maxWidth, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  const C = useC();
  return (
    <label className="block mb-3.5">
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}
// input helpers now read theme at the call site: style={inputStyle(C)}
const inputCls = "w-full text-sm";
const inputStyle = (C) => ({ padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.lineStrong}`, background: C.surface2, color: C.ink, fontFamily: FONT });

// Pill buttons.
function Btn({ children, onClick, kind = "primary", disabled, small }) {
  const C = useC();
  const styles = {
    primary: { background: C.ink, color: C.surface },
    gold:    { background: C.gold, color: "#14110C" },
    ghost:   { background: "transparent", color: C.ink, border: `1px solid ${C.lineStrong}` },
    danger:  { background: C.redPale, color: C.red },
    green:   { background: C.greenPale, color: C.green },
  }[kind];
  return (
    <button onClick={onClick} disabled={disabled}
      className="font-bold inline-flex items-center gap-1.5"
      style={{ ...styles, borderRadius: 999, border: styles.border || "none",
               fontSize: small ? 12 : 12.5, padding: small ? "8px 14px" : "10px 16px",
               opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT }}>
      {children}
    </button>
  );
}

function ShareLink({ href, onClick, children }) {
  const C = useC();
  return (
    <a href={href || "#"} onClick={onClick} target={href ? "_blank" : undefined} rel={href ? "noopener noreferrer" : undefined}
      className="font-semibold inline-flex items-center gap-1"
      style={{ background: C.surface, color: C.ink, border: `1px solid ${C.lineStrong}`, borderRadius: 999,
               fontSize: 11.5, padding: "8px 13px", textDecoration: "none", fontFamily: FONT, cursor: "pointer" }}>
      {children}
    </a>
  );
}

// Elevated rounded card.
function Card({ children, className = "" }) {
  const C = useC();
  return (
    <div className={className}
      style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: 20, marginBottom: 16, boxShadow: C.shadow }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  const C = useC();
  return <h2 className="font-extrabold" style={{ color: C.ink, fontSize: 16, margin: "26px 0 14px", fontFamily: FONT }}>{children}</h2>;
}

export { Badge, FingerprintStrip, Seal, QRCode, Modal, YearRangeSelect, Field, inputCls, inputStyle, Btn, ShareLink, Card, SectionTitle };
