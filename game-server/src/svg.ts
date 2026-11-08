/**
 * SVG rendering. Everything is generated per request from the stored state, so a tile is
 * always the current board square. No text from a request ever reaches these strings
 * unescaped: square names and themes are whitelisted, status text is generated internally,
 * and every attribute value goes through escapeXml.
 */

import { chessRecentText, chessStatusText, kingSquare, newChess, targetsFrom, type ChessState } from "./chesslogic";
import { PIECE_INK, pieceSvg } from "./pieces";
import { tttStatusText, type TttState } from "./ttt";
import { escapeXml, isSquare } from "./util";

export type Theme = "light" | "dark";

/**
 * Single quotes only. This value is injected into a double-quoted font-family attribute, so a
 * raw `"` here would close the attribute early and make the whole document invalid XML.
 */
export const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

export interface Palette {
  bone: string;
  muted: string;
  rule: string;
  accent: string;
}

/** Same palette as the profile SVGs. */
export const PALETTES: Record<Theme, Palette> = {
  light: { bone: "#333333", muted: "#777777", rule: "#C4C4C4", accent: "#000000" },
  dark: { bone: "#E6E6E6", muted: "#8C8C8C", rule: "#3A3A3A", accent: "#FFFFFF" },
};

const SQUARE_LIGHT: Record<Theme, string> = { light: "#EDEDED", dark: "#4D4D4D" };
const SQUARE_DARK: Record<Theme, string> = { light: "#B4B4B4", dark: "#2A2A2A" };

/**
 * Tile and banner geometry. tools/build_arena.py lays the README out at exactly these sizes,
 * so a banner is always as wide as the board it belongs to.
 */
export const CHESS_TILE = 44;
export const TTT_TILE = 64;
export const BANNER_HEIGHT = 40;
export const CHESS_BANNER_WIDTH = CHESS_TILE * 8; // 352
export const TTT_BANNER_WIDTH = TTT_TILE * 3; // 192

export function parseTheme(v: string | null): Theme {
  return v === "dark" ? "dark" : "light";
}

function open(width: number, height: number, label: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">`
  );
}

function textLine(x: number, y: number, size: number, fill: string, value: string, weight = "400"): string {
  return (
    `<text x="${x}" y="${y}" font-family="${escapeXml(MONO)}" font-size="${size}" ` +
    `font-weight="${escapeXml(weight)}" fill="${escapeXml(fill)}">${escapeXml(value)}</text>`
  );
}

/* ------------------------------------------------------------------ tic-tac-toe */

export function tttTileSvg(state: TttState, i: number, theme: Theme): string {
  const p = PALETTES[theme];
  const cell = state.board[i] ?? null;
  const winning = !!state.line && state.line.indexOf(i) >= 0;
  const outline = winning ? p.accent : p.rule;
  const ink = winning ? p.accent : p.bone;
  const mid = TTT_TILE / 2;
  const arm = 10;

  let mark = "";
  if (cell === "X") {
    mark =
      `<path d="M${mid - arm} ${mid - arm} ${mid + arm} ${mid + arm} ` +
      `M${mid + arm} ${mid - arm} ${mid - arm} ${mid + arm}" ` +
      `fill="none" stroke="${escapeXml(ink)}" stroke-width="6" stroke-linecap="round"/>`;
  } else if (cell === "O") {
    mark = `<circle cx="${mid}" cy="${mid}" r="11.5" fill="none" stroke="${escapeXml(ink)}" stroke-width="6"/>`;
  } else if (!state.over) {
    // Empty tiles only show the dot while the game is running: over means not clickable.
    mark = `<circle cx="${mid}" cy="${mid}" r="2.4" fill="${escapeXml(p.muted)}"/>`;
  }

  return (
    open(TTT_TILE, TTT_TILE, `tile ${i + 1}: ${cell ?? (state.over ? "empty" : "play here")}`) +
    `<rect x="1" y="1" width="${TTT_TILE - 2}" height="${TTT_TILE - 2}" rx="8" fill="none" ` +
    `stroke="${escapeXml(outline)}" stroke-width="1.5"/>` +
    mark +
    "</svg>"
  );
}

export function tttStatusSvg(state: TttState, theme: Theme): string {
  const p = PALETTES[theme];
  const { line1, line2 } = tttStatusText(state);
  return (
    open(TTT_BANNER_WIDTH, BANNER_HEIGHT, `${line1} — ${line2}`) +
    textLine(1, 16, 9, p.bone, line1) +
    textLine(1, 31, 9, p.muted, line2) +
    "</svg>"
  );
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

  const parts: string[] = [`<rect width="${s}" height="${s}" fill="${escapeXml(fill)}"/>`];
  if (isLast) parts.push(`<rect width="${s}" height="${s}" fill="${escapeXml(p.accent)}" opacity="0.08"/>`);
  if (inCheck) {
    parts.push(
      `<rect x="2.5" y="2.5" width="${s - 5}" height="${s - 5}" fill="none" ` +
        `stroke="${escapeXml(p.accent)}" stroke-width="2.4" rx="2"/>`,
    );
  }

  if (piece) parts.push(pieceSvg(piece.type, piece.color, PIECE_INK[theme], s));

  if (selected === sq) {
    parts.push(
      `<rect x="1.5" y="1.5" width="${s - 3}" height="${s - 3}" fill="none" ` +
        `stroke="${escapeXml(p.accent)}" stroke-width="2" rx="1"/>`,
    );
  }
  if (target) {
    if (target.capture || piece) {
      parts.push(
        `<circle cx="${mid}" cy="${mid}" r="${mid - 5}" fill="none" ` +
          `stroke="${escapeXml(p.accent)}" stroke-width="2.2" opacity="0.55"/>`,
      );
    } else {
      parts.push(`<circle cx="${mid}" cy="${mid}" r="5.2" fill="${escapeXml(p.accent)}" opacity="0.34"/>`);
    }
  }

  // Coordinates live inside the corner tiles: a-h along rank 1, 1-8 along the a-file.
  if (sq[1] === "1") {
    parts.push(textLine(40, 41.5, 9, p.muted, sq[0]));
  }
  if (sq[0] === "a") {
    parts.push(textLine(2.6, 10, 9, p.muted, sq[1]));
  }

  const label = `${sq}: ${piece ? `${piece.color === "w" ? "white" : "black"} ${piece.type}` : "empty"}`;
  return open(s, s, label) + parts.join("") + "</svg>";
}

export function chessStatusSvg(state: ChessState, theme: Theme): string {
  const p = PALETTES[theme];
  const { line1, line2 } = chessStatusText(state);
  return (
    open(CHESS_BANNER_WIDTH, BANNER_HEIGHT, `${line1} — ${line2}`) +
    textLine(1, 16, 10.5, p.bone, line1) +
    textLine(1, 31, 10, p.muted, line2) +
    "</svg>"
  );
}

export function chessRecentSvg(state: ChessState, theme: Theme): string {
  const p = PALETTES[theme];
  const { line1, line2 } = chessRecentText(state);
  return (
    open(CHESS_BANNER_WIDTH, BANNER_HEIGHT, `${line1} — ${line2}`) +
    textLine(1, 16, 10.5, p.bone, line1) +
    textLine(1, 31, 10, p.muted, line2) +
    "</svg>"
  );
}
