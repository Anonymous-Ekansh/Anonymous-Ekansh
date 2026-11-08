/**
 * SVG rendering. Everything is generated per request from the stored state, so a tile is
 * always the current board square. No text from a request ever reaches these strings
 * unescaped: square names and themes are whitelisted, status text is generated internally.
 */

import { chessRecentText, chessStatusText, kingSquare, newChess, targetsFrom, type ChessState } from "./chesslogic";
import { isPieceType, pieceSvg } from "./pieces";
import { tttStatusText, type TttState } from "./ttt";
import { escapeXml, isSquare } from "./util";

export type Theme = "light" | "dark";

export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

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
    `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" font-weight="${weight}" ` +
    `fill="${fill}">${escapeXml(value)}</text>`
  );
}

/* ------------------------------------------------------------------ tic-tac-toe */

export function tttTileSvg(state: TttState, i: number, theme: Theme): string {
  const p = PALETTES[theme];
  const cell = state.board[i] ?? null;
  const winning = !!state.line && state.line.indexOf(i) >= 0;
  const outline = winning ? p.accent : p.rule;
  const ink = winning ? p.accent : p.bone;

  let mark = "";
  if (cell === "X") {
    mark = `<path d="M24 24 48 48 M48 24 24 48" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;
  } else if (cell === "O") {
    mark = `<circle cx="36" cy="36" r="13" fill="none" stroke="${ink}" stroke-width="7"/>`;
  } else if (!state.over) {
    // Empty tiles only show the dot while the game is running: over means not clickable.
    mark = `<circle cx="36" cy="36" r="2.6" fill="${p.muted}"/>`;
  }

  return (
    open(72, 72, `tile ${i + 1}: ${cell ?? (state.over ? "empty" : "play here")}`) +
    `<rect x="1" y="1" width="70" height="70" rx="9" fill="none" stroke="${outline}" stroke-width="1.5"/>` +
    mark +
    "</svg>"
  );
}

export function tttStatusSvg(state: TttState, theme: Theme): string {
  const p = PALETTES[theme];
  const { line1, line2 } = tttStatusText(state);
  return (
    open(320, 40, `${line1} — ${line2}`) +
    textLine(1, 16, 11, p.bone, line1) +
    textLine(1, 32, 11, p.muted, line2) +
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

  const isLast = !!state.last && (state.last.from === sq || state.last.to === sq);
  const selected = state.selected && state.selected.expires > now ? state.selected.sq : null;
  const inCheck = chess.inCheck() && kingSquare(chess, chess.turn()) === sq;
  const target = selected ? targetsFrom(chess, selected).find((m) => m.to === sq) : undefined;

  const parts: string[] = [`<rect width="44" height="44" fill="${fill}"/>`];
  if (isLast) parts.push(`<rect width="44" height="44" fill="${p.accent}" opacity="0.08"/>`);
  if (inCheck) parts.push(`<rect x="2.5" y="2.5" width="39" height="39" fill="none" stroke="${p.accent}" stroke-width="2.4" rx="2"/>`);

  if (piece) parts.push(pieceSvg(piece.type as never, piece.color, p.bone));

  if (selected === sq) {
    parts.push(`<rect x="1.5" y="1.5" width="41" height="41" fill="none" stroke="${p.accent}" stroke-width="2" rx="1"/>`);
  }
  if (target) {
    if (target.capture || piece) {
      parts.push(`<circle cx="22" cy="22" r="17" fill="none" stroke="${p.accent}" stroke-width="2.2" opacity="0.55"/>`);
    } else {
      parts.push(`<circle cx="22" cy="22" r="4.6" fill="${p.accent}" opacity="0.34"/>`);
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
  return open(44, 44, label) + parts.join("") + "</svg>";
}

export function chessStatusSvg(state: ChessState, theme: Theme): string {
  const p = PALETTES[theme];
  const { line1, line2 } = chessStatusText(state);
  return (
    open(540, 40, `${line1} — ${line2}`) +
    textLine(1, 16, 11.5, p.bone, line1) +
    textLine(1, 31, 11, p.muted, line2) +
    "</svg>"
  );
}

export function chessRecentSvg(state: ChessState, theme: Theme): string {
  const p = PALETTES[theme];
  const { line1, line2 } = chessRecentText(state);
  return (
    open(540, 40, `${line1} — ${line2}`) +
    textLine(1, 16, 11.5, p.bone, line1) +
    textLine(1, 31, 11, p.muted, line2) +
    "</svg>"
  );
}

/** Small outlined button rendered as an SVG so it matches the theme on both colour schemes. */
export function buttonSvg(kind: "chess" | "ttt", theme: Theme): string {
  const p = PALETTES[theme];
  const width = kind === "chess" ? 124 : 92;
  const label = kind === "chess" ? "PLAY FULL-SCREEN" : "NEW GAME";
  return (
    open(width, 26, label) +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="25" rx="6" fill="none" stroke="${p.rule}" stroke-width="1"/>` +
    `<text x="${width / 2}" y="16.5" font-family="${MONO}" font-size="9" font-weight="600" ` +
    `fill="${p.bone}" text-anchor="middle" letter-spacing="0.4">${label}</text>` +
    "</svg>"
  );
}
