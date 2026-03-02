/**
 * Eburon Copilot CLI — ANSI Theme
 */
const ESC = "\x1b[";
const RESET = `${ESC}0m`;

function rgb(r: number, g: number, b: number): string {
  return `${ESC}38;2;${r};${g};${b}m`;
}

function bgRgb(r: number, g: number, b: number): string {
  return `${ESC}48;2;${r};${g};${b}m`;
}

export const T = {
  reset: RESET,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  italic: `${ESC}3m`,
  underline: `${ESC}4m`,
  inverse: `${ESC}7m`,

  // Brand palette
  brand: rgb(124, 58, 237),      // violet
  accent: rgb(6, 182, 212),      // cyan
  muted: rgb(107, 114, 128),     // gray-500
  surface: rgb(30, 30, 40),      // dark bg
  text: rgb(249, 250, 251),      // near-white
  green: rgb(16, 185, 129),      // emerald
  yellow: rgb(245, 158, 11),     // amber
  red: rgb(239, 68, 68),         // red
  blue: rgb(59, 130, 246),       // blue
  orange: rgb(249, 115, 22),     // orange
  pink: rgb(236, 72, 153),       // pink
  code: rgb(167, 139, 250),      // light purple

  // Background
  bgBrand: bgRgb(124, 58, 237),
  bgSurface: bgRgb(20, 20, 30),
  bgMuted: bgRgb(55, 55, 65),
};

// Styled string helpers
export function brand(s: string): string { return `${T.brand}${s}${T.reset}`; }
export function accent(s: string): string { return `${T.accent}${s}${T.reset}`; }
export function muted(s: string): string { return `${T.muted}${s}${T.reset}`; }
export function text(s: string): string { return `${T.text}${s}${T.reset}`; }
export function bold(s: string): string { return `${T.bold}${T.text}${s}${T.reset}`; }
export function green(s: string): string { return `${T.green}${s}${T.reset}`; }
export function yellow(s: string): string { return `${T.yellow}${s}${T.reset}`; }
export function red(s: string): string { return `${T.red}${s}${T.reset}`; }
export function blue(s: string): string { return `${T.blue}${s}${T.reset}`; }
export function code(s: string): string { return `${T.code}${s}${T.reset}`; }
export function dim(s: string): string { return `${T.dim}${s}${T.reset}`; }
export function inverse(s: string): string { return `${T.inverse}${s}${T.reset}`; }

// Box drawing
export const BOX = {
  tl: "╭", tr: "╮", bl: "╰", br: "╯",
  h: "─", v: "│",
  ltee: "├", rtee: "┤",
  cross: "┼",
  thickH: "━", thickV: "┃",
};

export function banner(): string {
  const w = 56;
  const line = BOX.h.repeat(w);
  return [
    "",
    brand(`  ${BOX.tl}${line}${BOX.tr}`),
    brand(`  ${BOX.v}`) + `  ${T.brand}⚡${T.reset} ${bold("EBURON COPILOT")}  ${muted("·")}  ${accent("v2.0")}  ${muted("·")}  ${muted("codemax-v3")}` + " ".repeat(8) + brand(BOX.v),
    brand(`  ${BOX.v}`) + `  ${muted("Terminal AI coding agent by")} ${accent("Eburon AI")}` + " ".repeat(15) + brand(BOX.v),
    brand(`  ${BOX.v}`) + `  ${muted("Interactive REPL")} ${dim("·")} ${muted("TUI")} ${dim("·")} ${muted("Web")} ${dim("·")} ${muted("Autonomous Agent")}` + " ".repeat(8) + brand(BOX.v),
    brand(`  ${BOX.bl}${line}${BOX.br}`),
    "",
  ].join("\n");
}

export function sectionHeader(title: string): string {
  return `\n  ${T.brand}${BOX.ltee}${BOX.h}${T.reset} ${bold(title)}\n`;
}
