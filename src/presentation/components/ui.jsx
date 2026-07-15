/* ============================================================
   PRESENTATION TIER — small reusable UI atoms.
   ============================================================ */
import React from "react";
import { C, FONT, MONO } from "../theme.js";


function Badge({ status }) {
  const map = {
    pending_institution_verification: ["Pending institution", C.amber, C.amberPale],
    png_verified: ["Verified — awaiting record", C.amber, C.amberPale],
    awaiting_upload: ["Awaiting overseas upload", C.amber, C.amberPale],
    locked: ["Locked — PNG anchor required", C.gray, "#EEECE6"],
    pending_admin_review: ["Pending admin review", C.amber, C.amberPale],
    certified: ["Certified", C.goldDeep, C.goldPale],
    rejected: ["Rejected", C.red, C.redPale],
    approved: ["Approved", C.green, C.greenPale],
    pending: ["Pending approval", C.amber, C.amberPale],
    verified: ["Verified", C.green, C.greenPale],
    failed: ["Verification failed", C.red, C.redPale],
  };
  const [label, fg, bg] = map[status] || [status, C.gray, "#EEECE6"];
  return (
    <span className="text-xs font-semibold px-2 py-1 rounded" style={{ color: fg, background: bg, letterSpacing: "0.02em" }}>
      {label}
    </span>
  );
}

function FingerprintStrip({ hash }) {
  if (!hash) return null;
  const bars = [];
  for (let i = 0; i < 16; i++) {
    const byte = parseInt(hash.slice(i * 2, i * 2 + 2), 16);
    const hue = 36 + (byte % 40) - 20; // golds and browns
    const light = 30 + (byte % 45);
    bars.push(<div key={i} style={{ width: 6, height: 18, background: `hsl(${hue} 55% ${light}%)`, borderRadius: 1 }} />);
  }
  return <div className="flex gap-1 items-center">{bars}</div>;
}

function Seal({ hash }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-full shrink-0"
      style={{ width: 84, height: 84, border: `2.5px solid ${C.gold}`, boxShadow: `inset 0 0 0 3px ${C.paper}, inset 0 0 0 4.5px ${C.gold}` }}
    >
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.goldDeep, letterSpacing: "0.14em" }}>CERTIFIED</div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.ink }}>{hash ? hash.slice(0, 8) : "········"}</div>
      <div style={{ fontFamily: MONO, fontSize: 8, color: C.gray }}>SHA-256</div>
    </div>
  );
}

function FakeQR({ token }) {
  const n = 21;
  const cells = [];
  let seed = 0;
  for (const ch of token) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const finder = (x < 6 && y < 6) || (x > n - 7 && y < 6) || (x < 6 && y > n - 7);
      const on = finder ? (x % 5 !== 2 || y % 5 !== 2 ? (x % 6 === 0 || y % 6 === 0 || (x > 1 && x < 5 && y > 1 && y < 5)) : false) : rand() > 0.5;
      if (on) cells.push(<rect key={`${x}-${y}`} x={x * 8} y={y * 8} width={7.2} height={7.2} fill={C.ink} />);
    }
  return (
    <svg viewBox={`0 0 ${n * 8} ${n * 8}`} width="150" height="150" role="img" aria-label="Simulated QR code" style={{ background: "#fff", padding: 6, border: `1px solid ${C.line}` }}>
      {cells}
    </svg>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <div className="text-xs font-semibold mb-1" style={{ color: C.inkSoft, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</div>
      {children}
    </label>
  );
}
const inputCls = "w-full px-3 py-2 rounded border text-sm";
const inputStyle = { borderColor: C.line, background: "#fff", color: C.ink, fontFamily: FONT };

function Btn({ children, onClick, kind = "primary", disabled, small }) {
  const styles = {
    primary: { background: C.ink, color: "#fff" },
    gold: { background: C.gold, color: C.ink },
    ghost: { background: "transparent", color: C.ink, border: `1px solid ${C.line}` },
    danger: { background: C.red, color: "#fff" },
    green: { background: C.green, color: "#fff" },
    blue: { background: "#2563eb", color: "#fff" },
  }[kind];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded font-semibold ${small ? "text-xs px-3 py-1.5" : "text-sm px-4 py-2"}`}
      style={{ ...styles, opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT }}
    >
      {children}
    </button>
  );
}

function ShareLink({ href, onClick, children }) {
  return (
    <a
      href={href || "#"}
      onClick={onClick}
      target={href ? "_blank" : undefined}
      rel={href ? "noopener noreferrer" : undefined}
      className="rounded font-semibold text-xs px-3 py-2 inline-flex items-center gap-1"
      style={{ background: "#fff", color: C.ink, border: `1px solid ${C.line}`, textDecoration: "none", fontFamily: FONT, cursor: "pointer" }}
    >
      {children}
    </a>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-lg p-4 mb-4 ${className}`} style={{ background: C.card, border: `1px solid ${C.line}` }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-lg font-bold mt-6 mb-3" style={{ color: C.ink, fontFamily: FONT }}>
      {children}
    </h2>
  );
}

/* ============================================================ MAIN APP */

export { Badge, FingerprintStrip, Seal, FakeQR, Field, Btn, ShareLink, Card, SectionTitle };
