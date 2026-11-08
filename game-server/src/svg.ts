/**
 * SVG rendering for the README boards.
 *
 * Rules that keep these documents renderable anywhere:
 *  - every root <svg> carries xmlns, width, height and viewBox;
 *  - no text from a request reaches a string unescaped (square names and themes are whitelisted,
 *    banner text is generated here), and font-family never contains a quote of either kind;
 *  - the sizes below are the README's layout: 8 x 52 = 416 for the chess board, 3 x 76 = 228 for
 *    tic-tac-toe, and every banner is exactly as wide as the board it sits over.
 */

import { kingSquare, newChess, targetsFrom, type ChessState } from "./chesslogic";
import { markSvg } from "./marks";
import { PIECE_INK, PIECES_CREDIT, pieceSvg } from "./pieces";
import type { TttState } from "./ttt";
import { escapeXml, isSquare } from "./util";

export type Theme = "light" | "dark";

/** No quotes at all: this lands inside a double-quoted font-family attribute. */
export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** Board geometry. tools/build_arena.py hard-codes the same numbers. */
export const CHESS_TILE_SIZE = 52;
export const TTT_TILE_SIZE = 76;
export const CHESS_BANNER_WIDTH = CHESS_TILE_SIZE * 8; // 416
export const TTT_BANNER_WIDTH = TTT_TILE_SIZE * 3; // 228
export const BANNER_HEIGHT = 26;
export const HEADER_HEIGHT = 28;
export const BUTTON_HEIGHT = 26;
export const CHESS_BUTTON_WIDTH = 124;
export const TTT_BUTTON_WIDTH = 92;
export const FOOTER_WIDTH = CHESS_BANNER_WIDTH;
export const FOOTER_HEIGHT = 18;

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

/* ------------------------------------------------------------------ primitives */

function svgOpen(width: number, height: number, label: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">`
  );
}

interface TextOpts {
  size: number;
  fill: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  opacity?: number;
  letterSpacing?: number;
}

function text(x: number, y: number, value: string, o: TextOpts): string {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `font-family="${MONO}"`,
    `font-size="${o.size}"`,
    `font-weight="${o.weight ?? 400}"`,
    `fill="${escapeXml(o.fill)}"`,
  ];
  if (o.anchor) attrs.push(`text-anchor="${o.anchor}"`);
  if (o.opacity !== undefined) attrs.push(`opacity="${o.opacity}"`);
  if (o.letterSpacing !== undefined) attrs.push(`letter-spacing="${o.letterSpacing}"`);
  return `<text ${attrs.join(" ")}>${escapeXml(value)}</text>`;
}

/** A monospace glyph is about 0.6em wide: trim a line rather than let it run off the banner. */
function fit(value: string, width: number, size: number): string {
  const max = Math.max(1, Math.floor((width - 6) / (size * 0.6)));
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

/* ------------------------------------------------------------------ chrome */

const HEADERS = {
  chess: { ghost: "01", title: "COMMUNITY CHESS", hint: "click a piece, then a square" },
  ttt: { ghost: "02", title: "QUICK TIC-TAC-TOE", hint: "three in a row" },
} as const;

/** Title strip in the style of the section dividers: ghost numeral, monospace title, 1px rule. */
export function headerSvg(kind: "chess" | "ttt", theme: Theme): string {
  const p = PALETTES[theme];
  const width = kind === "chess" ? CHESS_BANNER_WIDTH : TTT_BANNER_WIDTH;
  const copy = HEADERS[kind];
  return (
    svgOpen(width, HEADER_HEIGHT, `${copy.title} — ${copy.hint}`) +
    text(-1, 25, copy.ghost, { size: 26, fill: p.accent, weight: 700, opacity: 0.07 }) +
    text(34, 17, copy.title, { size: 11, fill: p.bone, weight: 700 }) +
    text(width - 1, 17, copy.hint, { size: 8.5, fill: p.muted, anchor: "end" }) +
    `<rect x="0" y="${HEADER_HEIGHT - 1}" width="${width}" height="1" fill="${escapeXml(p.rule)}"/>` +
    "</svg>"
  );
}

/** Outlined link button: GitHub strips CSS, so the button has to be an image. */
export function buttonSvg(kind: "chess" | "ttt", theme: Theme): string {
  const p = PALETTES[theme];
  const width = kind === "chess" ? CHESS_BUTTON_WIDTH : TTT_BUTTON_WIDTH;
  const label = kind === "chess" ? "PLAY FULL-SCREEN" : "NEW GAME";
  return (
    svgOpen(width, BUTTON_HEIGHT, label) +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${BUTTON_HEIGHT - 1}" rx="6" ` +
    `fill="none" stroke="${escapeXml(p.rule)}" stroke-width="1"/>` +
    text(width / 2, BUTTON_HEIGHT - 9.5, label, { size: 9, fill: p.bone, weight: 600, anchor: "middle", letterSpacing: 0.4 }) +
    "</svg>"
  );
}

/** One-line credit under the boards. */
export function footerSvg(theme: Theme): string {
  const p = PALETTES[theme];
  return (
    svgOpen(FOOTER_WIDTH, FOOTER_HEIGHT, PIECES_CREDIT) +
    text(FOOTER_WIDTH / 2, FOOTER_HEIGHT - 5, PIECES_CREDIT, { size: 8.5, fill: p.muted, anchor: "middle" }) +
    "</svg>"
  );
}

/**
 * Last resort for a failed render: a valid document of the right size. A broken-image icon in a
 * README is worse than a quiet empty box, and this can never itself be malformed.
 */
export function placeholderSvg(width: number, height: number, theme: Theme): string {
  const p = PALETTES[theme];
  return (
    svgOpen(width, height, "arena — image unavailable") +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" ` +
    `stroke="${escapeXml(p.rule)}" stroke-width="1"/>` +
    `<rect x="${width / 2 - 9}" y="${height / 2 - 1}" width="18" height="2" rx="1" ` +
    `fill="${escapeXml(p.muted)}" opacity="0.5"/>` +
    "</svg>"
  );
}

/* ------------------------------------------------------------------ tic-tac-toe */

/** Classic #: each tile draws only its inner edges, so there is no outer frame. */
const GRID_INSET = (TTT_TILE_SIZE * 0.06);
const GRID_STROKE = 1.5;

export function tttTileSvg(state: TttState, i: number, theme: Theme): string {
  const p = PALETTES[theme];
  const s = TTT_TILE_SIZE;
  const cell = state.board[i] ?? null;
  const winning = !!state.line && state.line.indexOf(i) >= 0;
  // Off-line marks fade once the game is decided; the winning three keep full ink.
  const dim = state.line && !winning ? 0.45 : 1;
  const col = i % 3;
  const row = Math.floor(i / 3);

  const parts: string[] = [];
  if (col < 2) {
    parts.push(
      `<rect x="${s - GRID_STROKE / 2}" y="${GRID_INSET}" width="${GRID_STROKE}" ` +
        `height="${s - GRID_INSET * 2}" fill="${escapeXml(p.rule)}"/>`,
    );
  }
  if (row < 2) {
    parts.push(
      `<rect x="${GRID_INSET}" y="${s - GRID_STROKE / 2}" width="${s - GRID_INSET * 2}" ` +
        `height="${GRID_STROKE}" fill="${escapeXml(p.rule)}"/>`,
    );
  }

  if (cell) {
    parts.push(markSvg(cell, theme, s, i, dim));
  } else if (!state.over) {
    // A live, empty tile is clickable: a faint dot says so without adding an icon.
    parts.push(`<circle cx="${s / 2}" cy="${s / 2}" r="2.2" fill="${escapeXml(p.bone)}" opacity="0.2"/>`);
  }

  const label = `tile ${i + 1}: ${cell ?? (state.over ? "empty" : "play here")}`;
  return svgOpen(s, s, label) + parts.join("") + "</svg>";
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
  const s = CHESS_TILE_SIZE;
  const mid = s / 2;
  const piece = isSquare(sq) ? chess.get(sq as GetArg) : undefined;
  const fill = isLightSquare(sq) ? SQUARE_LIGHT[theme] : SQUARE_DARK[theme];

  const isLast = !!state.last && (state.last.from === sq || state.last.to === sq);
  const selected = state.selected && state.selected.expires > now ? state.selected.sq : null;
  const inCheck = chess.inCheck() && kingSquare(chess, chess.turn()) === sq;
  const target = selected ? targetsFrom(chess, selected).find((m) => m.to === sq) : undefined;

  const parts: string[] = [`<rect width="${s}" height="${s}" fill="${escapeXml(fill)}"/>`];
  if (isLast) parts.push(`<rect width="${s}" height="${s}" fill="${escapeXml(p.accent)}" opacity="0.07"/>`);
  if (inCheck) {
    parts.push(
      `<rect x="2" y="2" width="${s - 4}" height="${s - 4}" rx="2" fill="none" ` +
        `stroke="${escapeXml(p.accent)}" stroke-width="2.6"/>`,
    );
  }

  if (piece) parts.push(pieceSvg(piece.type, piece.color, PIECE_INK[theme], s));

  if (selected === sq) {
    parts.push(
      `<rect x="1.25" y="1.25" width="${s - 2.5}" height="${s - 2.5}" rx="1.5" fill="none" ` +
        `stroke="${escapeXml(p.accent)}" stroke-width="2"/>`,
    );
  }
  if (target) {
    if (target.capture || piece) {
      parts.push(
        `<circle cx="${mid}" cy="${mid}" r="${mid - 6}" fill="none" ` +
          `stroke="${escapeXml(p.accent)}" stroke-width="2.4" opacity="0.5"/>`,
      );
    } else {
      parts.push(`<circle cx="${mid}" cy="${mid}" r="${s * 0.115}" fill="${escapeXml(p.accent)}" opacity="0.3"/>`);
    }
  }

  // Coordinates live inside the corner tiles, so the board has no extra label column.
  if (sq[1] === "1") {
    parts.push(text(s - 3, s - 4.5, sq[0], { size: 9, fill: p.muted, anchor: "end", opacity: 0.72 }));
  }
  if (sq[0] === "a") {
    parts.push(text(3.5, 10.5, sq[1], { size: 9, fill: p.muted, opacity: 0.72 }));
  }

  const label = `${sq}: ${piece ? `${piece.color === "w" ? "white" : "black"} ${piece.type}` : "empty"}`;
  return svgOpen(s, s, label) + parts.join("") + "</svg>";
}

/* ------------------------------------------------------------------ banners */

/** One line, monospace, exactly as wide as the board above it. */
function bannerSvg(width: number, value: string, theme: Theme, label: string): string {
  const p = PALETTES[theme];
  const size = 10.5;
  return (
    svgOpen(width, BANNER_HEIGHT, label) +
    text(1, BANNER_HEIGHT - 8.5, fit(value, width, size), { size, fill: p.bone }) +
    "</svg>"
  );
}

function chessLine(state: ChessState): string {
  const chess = newChess(state.fen);
  const r = state.record;
  const score = `W${r.white} B${r.black} D${r.draw}`;
  if (state.result) return `${state.result} · game #${state.game} · ${score}`;
  const turn = chess.turn() === "w" ? "White" : "Black";
  const last = state.last ? ` · last ${state.last.san}` : "";
  const check = chess.inCheck() ? " · check" : "";
  return `${turn} to move · game #${state.game} · ${score}${last}${check}`;
}

export function chessStatusSvg(state: ChessState, theme: Theme): string {
  return bannerSvg(CHESS_BANNER_WIDTH, chessLine(state), theme, "community chess — status");
}

export function chessRecentSvg(state: ChessState, theme: Theme): string {
  const moves = state.recent.slice(-8);
  const line = moves.length > 0 ? `recent — ${moves.join(" ")}` : "recent — no moves yet";
  return bannerSvg(CHESS_BANNER_WIDTH, line, theme, "community chess — last moves");
}

function tttLine(state: TttState): string {
  const r = state.record;
  const score = `X${r.visitors} O${r.bot} D${r.draws}`;
  if (!state.over) return `your move · you are X · ${score}`;
  const head = state.result === "win" ? "you won" : state.result === "loss" ? "the bot won" : "draw";
  return `${head} · play again · ${score}`;
}

export function tttStatusSvg(state: TttState, theme: Theme): string {
  return bannerSvg(TTT_BANNER_WIDTH, tttLine(state), theme, "tic-tac-toe — status");
}
