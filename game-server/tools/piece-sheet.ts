/**
 * Proof sheet for the chess pieces: all twelve, on both square colours, in both themes, at the
 * 52px the README uses — plus the knight at 104px, because that is the piece whose head, mane,
 * ear and eye have to stay legible.
 *
 * Writes .preview/piece-sheet.html (open it, or screenshot it):
 *
 *   cd game-server && npx vite-node tools/piece-sheet.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { PIECE_INK, PIECES_CREDIT, pieceSvg, type PieceColor, type PieceType } from "../src/pieces";

const TYPES: PieceType[] = ["k", "q", "r", "b", "n", "p"];
const COLORS: PieceColor[] = ["w", "b"];
const SQUARE = { light: ["#EDEDED", "#B4B4B4"], dark: ["#4D4D4D", "#2A2A2A"] } as const;
const THEMES = ["light", "dark"] as const;

function cell(theme: (typeof THEMES)[number], color: PieceColor, type: PieceType, size: number, light: boolean): string {
  const bg = SQUARE[theme][light ? 1 : 0];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${bg}"/>` +
    pieceSvg(type, color, PIECE_INK[theme], size) +
    "</svg>";
  return (
    `<img src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}" width="${size}" height="${size}" ` +
    `alt="${theme} ${color}${type} ${size}" style="margin:0 2px 0 0"/>`
  );
}

function row(theme: (typeof THEMES)[number], type: PieceType, size: number): string {
  const cells = COLORS.map((color) => cell(theme, color, type, size, true) + cell(theme, color, type, size, false)).join("");
  return `<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px"><span style="width:46px;font:10px ui-monospace,monospace;opacity:.7">${size}px ${type}</span>${cells}</div>`;
}

function sheet(): string {
  const blocks = THEMES.map((theme) => {
    const rows = TYPES.map((type) => row(theme, type, 52)).join("") + row(theme, "n", 104);
    const bg = theme === "dark" ? "#111" : "#fff";
    const fg = theme === "dark" ? "#ddd" : "#333";
    return (
      `<section style="background:${bg};padding:10px 12px;margin-bottom:10px;border-radius:6px">` +
      `<h2 style="font:600 11px ui-monospace,monospace;color:${fg};margin:0 0 8px">${theme}</h2>${rows}</section>`
    );
  }).join("");

  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>piece sheet</title></head>` +
    `<body style="margin:0;padding:8px;background:#7a7a7a;font:11px ui-monospace,monospace">` +
    `<p style="color:#111;margin:0 0 8px">${PIECES_CREDIT} · each pair: light square then dark square</p>` +
    `${blocks}</body></html>`
  );
}

const out = resolve(process.cwd(), "../.preview/piece-sheet.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sheet(), "utf8");
console.log(`[piece-sheet] wrote ${out}`);
