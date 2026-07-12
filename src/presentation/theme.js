/* ============================================================
   PRESENTATION TIER — design tokens (color palette, font stacks).
   ============================================================ */
const C = {
  ink: "#1B1712",
  inkSoft: "#3A342B",
  paper: "#F4F3EF",
  card: "#FFFFFF",
  line: "#DED9CE",
  gold: "#C79A2A",
  goldDeep: "#8F6B14",
  goldPale: "#F6EDD6",
  red: "#9B1C23",
  redPale: "#F7E4E4",
  green: "#1F5C43",
  greenPale: "#E2EFE8",
  amber: "#8A5A0B",
  amberPale: "#F5ECD9",
  gray: "#6B655A",
};

/* system font stacks — fully self-contained, no external font downloads */
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, 'Cascadia Mono', 'SF Mono', Menlo, Consolas, 'Courier New', monospace";

export { C, FONT, MONO };
