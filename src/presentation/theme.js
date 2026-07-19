/* ============================================================
   PRESENTATION TIER — design tokens (dual theme).
   Direction 1b — "Studio": warm paper backdrop, elevated rounded
   cards, pill controls, refined gold accent, light/dark.
   ============================================================ */
import { createContext, useContext } from "react";

const LIGHT = {
  // Backdrop deliberately a few shades darker than white so elevated white cards
  // read clearly against it; borders slightly firmer for definition.
  bg: "#E7DFCC", surface: "#FFFFFF", surface2: "#F7F3EA",
  line: "#E2DBC9", lineStrong: "#D5CCB6",
  ink: "#14110C", inkSoft: "#3A342B", muted: "#6E685C", faint: "#938C7E",
  gold: "#B98A2B", goldDeep: "#7A5B12", goldPale: "#F6EDD6",
  green: "#1F6F52", greenPale: "#E4F1EA",
  amber: "#8A5A0B", amberPale: "#F5ECD9",
  red: "#A22029", redPale: "#F7E4E4",
  shadow: "0 6px 22px rgba(20,17,12,0.07)", shadowSm: "0 3px 12px rgba(20,17,12,0.045)",
  dark: false,
  // logo treatment: none on light (transparent on the cream backdrop); a soft
  // light glow on dark so the logo's dark wordmark lifts off without a box.
  logoGlow: "none",
  // back-compat aliases (older view code still references these keys):
  gray: "#6E685C", paper: "#F7F3EA", card: "#FFFFFF",
};
const DARK = {
  bg: "#141210", surface: "#211D17", surface2: "#1B1712",
  line: "#302A21", lineStrong: "#3B3329",
  ink: "#F4F0E7", inkSoft: "#D7D0C2", muted: "#A69E8D", faint: "#7E7666",
  gold: "#DBB24C", goldDeep: "#E7C670", goldPale: "#2C2617",
  green: "#57C296", greenPale: "#16281F",
  amber: "#DBAA4F", amberPale: "#2C2413",
  red: "#E7757D", redPale: "#301819",
  shadow: "0 10px 30px rgba(0,0,0,0.45)", shadowSm: "0 4px 16px rgba(0,0,0,0.35)",
  dark: true,
  logoGlow: "drop-shadow(0 0 2px rgba(255,255,255,0.9)) drop-shadow(0 0 16px rgba(255,255,255,0.28))",
  // back-compat aliases:
  gray: "#A69E8D", paper: "#1B1712", card: "#211D17",
};
export const themeFor = (mode) => (mode === "dark" ? DARK : LIGHT);

// Manrope (self-hosted via @fontsource — see main.jsx) replaces the system
// stack for UI; keep MONO for hashes/tokens.
const FONT = "'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace";

// Theme context so atoms/views read the active palette without prop-drilling.
export const ThemeCtx = createContext(LIGHT);
export const useC = () => useContext(ThemeCtx);

// Back-compat default export (static light) so any file still doing
// `import { C }` keeps working during migration.
const C = LIGHT;
export { C, FONT, MONO };
