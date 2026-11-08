/**
 * SVG rendering. Everything is generated per request from the stored state, so a tile is
 * always the current board square. No text from a request ever reaches these strings
 * unescaped: square names and themes are whitelisted, status text is generated internally.
 *
 * Two rules keep GitHub's image proxy happy and the README tidy:
 *  - every root <svg> carries xmlns plus explicit width, height and viewBox;
 *  - no double quote is ever nested inside a double-quoted attribute (the font stack has no
 *    inner quotes for exactly this reason — one of them turns the document into invalid XML
 *    and every tile that contains text renders as a broken image).
 */

import { brushMark } from "./brushes";
import { chessRecentLine, chessStatusLine, kingSquare, newChess, targetsFrom, type ChessState } from "./chesslogic";
import { PIECE_INK, pieceSvg } from "./pieces";
import { tttStatusLine, type TttState } from "./ttt";
import { escapeXml, isSquare } from "./util";

export type Theme = "light" | "dark";

/** Quoted family names would need entity escaping; the unquoted stack is valid CSS. */
export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const CHESS_TILE = 52;
export const TTT_TILE = 76;
export const CHESS_BOARD = CHESS_TILE * 8;
export const TTT_BOARD = TTT_TILE * 3;

const BAR_H = 28;
const HEADER_H = 40;

export interface Palette {
  bone: string;
  muted: string;
  dim: string;
  rule: string;
  accent: string;
  ghost: string;
}

/** Same palette as the profile SVGs. */
export const PALETTES: Record<Theme, Palette> = {
  light: { bone: "#333333", muted: "#777777", dim: "#9A9A9A", rule: "#C4C4C4", accent: "#000000", ghost: "#D4D4D4" },
  dark: { bone: "#E6E6E6", muted: "#8C8C8C", dim: "#666666", rule: "#3A3A3A", accent: "#FFFFFF", ghost: "#2C2C2C" },
};

const SQUARE_LIGHT: Record<Theme, string> = { light: "#EDEDED", dark: "#4D4D4D" };
const SQUARE_DARK: Record<Theme, string> = { light: "#B4B4B4", dark: "#2A2A2A" };

/** Brush ink for the marks. */
const TTT_INK: Record<Theme, string> = { light: "#111111", dark: "#F2F2F2" };

export function parseTheme(v: string | null): Theme {
  return v === "dark" ? "dark" : "light";
}

function open(width: number, height: number, label: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">`
  );
}

function textLine(
  x: number,
  y: number,
  size: number,
  fill: string,
  value: string,
  weight = "400",
  anchor: "start" | "middle" | "end" = "start",
  spacing?: number,
): string {
  const ls = spacing === undefined ? "" : ` letter-spacing="${spacing}"`;
  const an = anchor === "start" ? "" : ` text-anchor="${anchor}"`;
  return (
    `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" font-weight="${weight}"${ls}${an} ` +
    `fill="${fill}">${escapeXml(value)}</text>`
  );
}

/**
 * Clips a generated line to the width it has to live in. Status text can grow with a long
 * move list; the banner must never wrap and must never paint outside the board.
 */
function fit(text: string, maxWidth: number, size: number): string {
  const perChar = size * 0.62;
  const max = Math.max(4, Math.floor(maxWidth / perChar));
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

/* ------------------------------------------------------------------ tic-tac-toe */

/**
 * One tile: the classic # grid drawn as inner edges only (each tile owns its left and top
 * edge, so no line is doubled and there is no outer frame), plus the brush mark.
 */
export function tttTileSvg(state: TttState, i: number, theme: Theme): string {
  const p = PALETTES[theme];
  const cell = state.board[i] ?? null;
  const winning = !!state.line && state.line.indexOf(i) >= 0;
  const dimmed = !!state.line && !winning;
  const ink = TTT_INK[theme];
  const row = Math.floor(i / 3);
  const col = i % 3;

  const parts: string[] = [];
  if (col > 0) parts.push(`<line x1="0.75" y1="0" x2="0.75" y2="${TTT_TILE}" stroke="${p.rule}" stroke-width="1.5"/>`);
  if (row > 0) parts.push(`<line x1="0" y1="0.75" x2="${TTT_TILE}" y2="0.75" stroke="${p.rule}" stroke-width="1.5"/>`);

  if (cell) {
    parts.push(`<g opacity="${dimmed ? "0.45" : "1"}">${brushMark(cell, i, ink)}</g>`);
  } else if (!state.over) {
    // Only while the game is live: a hint that the square is clickable.
    parts.push(`<circle cx="${TTT_TILE / 2}" cy="${TTT_TILE / 2}" r="1.6" fill="${p.muted}" opacity="0.2"/>`);
  }

  const label = cell ? `tile ${i + 1}: ${cell}` : state.over ? `tile ${i + 1}: empty` : `tile ${i + 1}: play here`;
  return open(TTT_TILE, TTT_TILE, label) + parts.join("") + "</svg>";
}

export function tttStatusSvg(state: TttState, theme: Theme): string {
  return bannerSvg(tttStatusLine(state), TTT_BOARD, theme, 10);
}

/* ------------------------------------------------------------------ chess */

type GetArg = Parameters<ReturnType<typeof newChess>["get"]>[0];

function isLightSquare(sq: string): boolean {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]) - 1;
  return (file + rank) % 2 === 1;
}

export function chessTileSvg(state: ChessState, sq: string, theme: Theme, now: number): string {
  const p = PALETTES[theme];
  const chess = newChess(state.fen);
  const piece = isSquare(sq) ? chess.get(sq as GetArg) : undefined;
  const light = isLightSquare(sq);
  const fill = light ? SQUARE_LIGHT[theme] : SQUARE_DARK[theme];
  const s = CHESS_TILE;
  const mid = s / 2;

  const isLast = !!state.last && (state.last.from === sq || state.last.to === sq);
  const selected = state.selected && state.selected.expires > now ? state.selected.sq : null;
  const inCheck = chess.inCheck() && kingSquare(chess, chess.turn()) === sq;
  const target = selected ? targetsFrom(chess, selected).find((m) => m.to === sq) : undefined;

  const parts: string[] = [`<rect width="${s}" height="${s}" fill="${fill}"/>`];
  if (isLast) parts.push(`<rect width="${s}" height="${s}" fill="${p.accent}" opacity="0.09"/>`);
  if (inCheck) {
    parts.push(
      `<rect x="2.5" y="2.5" width="${s - 5}" height="${s - 5}" fill="none" stroke="${p.accent}" stroke-width="2.4" rx="2"/>`,
    );
  }

  if (piece) parts.push(pieceSvg(piece.type, piece.color, PIECE_INK[theme], s));

  if (selected === sq) {
    parts.push(
      `<rect x="1.5" y="1.5" width="${s - 3}" height="${s - 3}" fill="none" stroke="${p.accent}" stroke-width="2" rx="1"/>`,
    );
  }
  if (target) {
    if (target.capture || piece) {
      parts.push(
        `<circle cx="${mid}" cy="${mid}" r="${mid - 5}" fill="none" stroke="${p.accent}" stroke-width="2.2" opacity="0.55"/>`,
      );
    } else {
      parts.push(`<circle cx="${mid}" cy="${mid}" r="5.2" fill="${p.accent}" opacity="0.34"/>`);
    }
  }

  // Coordinates live inside the corner tiles: a-h along rank 1, 1-8 along the a-file.
  if (sq[1] === "1") parts.push(textLine(s - 4, s - 4, 8.5, p.muted, sq[0], "400", "end"));
  if (sq[0] === "a") parts.push(textLine(3.5, 11, 8.5, p.muted, sq[1]));

  const label = `${sq}: ${piece ? `${piece.color === "w" ? "white" : "black"} ${piece.type}` : "empty"}`;
  return open(s, s, label) + parts.join("") + "</svg>";
}

export function chessStatusSvg(state: ChessState, theme: Theme): string {
  return bannerSvg(chessStatusLine(state), CHESS_BOARD, theme, 11);
}

export function chessRecentSvg(state: ChessState, theme: Theme): string {
  return bannerSvg(chessRecentLine(state), CHESS_BOARD, theme, 11);
}

/** One line, exactly as wide as the board above it, never wrapped. */
function bannerSvg(line: string, width: number, theme: Theme, size: number): string {
  const p = PALETTES[theme];
  const text = fit(line, width - 4, size);
  return open(width, BAR_H, text) + textLine(1, 18, size, p.bone, text) + "</svg>";
}

/* ------------------------------------------------------------------ headers and buttons */

/**
 * Section header strip: ghost number, monospace title, optional hint on the right, 1px rule.
 * Same width as the board it introduces so the column reads as one object.
 */
export function sectionHeaderSvg(kind: "chess" | "ttt", theme: Theme): string {
  const p = PALETTES[theme];
  const chess = kind === "chess";
  const width = chess ? CHESS_BOARD : TTT_BOARD;
  const title = chess ? "COMMUNITY CHESS" : "NO TIME? QUICK TIC-TAC-TOE";
  const hint = chess ? "click a piece, then a square" : "";
  const titleSize = chess ? 10.5 : 9.2;
  const titleSpacing = chess ? 2 : 0.8;

  const parts = [
    textLine(0, 27, 24, p.ghost, "03", "700"),
    textLine(38, 24, titleSize, p.accent, title, "700", "start", titleSpacing),
    `<line x1="0" y1="34" x2="${width}" y2="34" stroke="${p.rule}" stroke-width="1"/>`,
  ];
  if (hint) parts.push(textLine(width, 24, 8.6, p.muted, hint, "400", "end", 0.4));

  return open(width, HEADER_H, `${title} — ${hint}`.trim()) + parts.join("") + "</svg>";
}

/** Small outlined button rendered as an SVG so it matches the theme on both colour schemes. */
export function buttonSvg(label: string, theme: Theme): string {
  const p = PALETTES[theme];
  const size = 9.5;
  const width = Math.round(label.length * size * 0.72 + 34);
  const height = 28;
  return (
    open(width, height, label) +
    `<rect x="0.75" y="0.75" width="${width - 1.5}" height="${height - 1.5}" rx="4" fill="none" stroke="${p.rule}" stroke-width="1.5"/>` +
    textLine(width / 2, 18, size, p.bone, label, "600", "middle", 1.2) +
    "</svg>"
  );
}

/**
 * Last-resort image. Any exception while rendering is a bug, but a bug must never become a
 * broken-image icon in someone's profile: the caller returns this with HTTP 200.
 */
export function placeholderSvg(label = "board unavailable"): string {
  const ink = "#999999";
  return (
    open(240, BAR_H, label) +
    `<rect x="0.75" y="0.75" width="238.5" height="26.5" rx="3" fill="none" stroke="${ink}" stroke-width="1" opacity="0.5"/>` +
    textLine(10, 18, 10, ink, label) +
    "</svg>"
  );
}
