/**
 * Tic-tac-toe: the visitor is X, the bot is O.
 *
 * The bot is deliberately beatable: win, block, then a 20% random blunder, then centre,
 * then a corner, then anything. It never looks ahead, so a fork beats it.
 */

import { clampInt, safeJson } from "./util";

export type Mark = "X" | "O";
export type Cell = Mark | null;
export type TttResult = "win" | "loss" | "draw" | null;

export interface TttRecord {
  visitors: number;
  bot: number;
  draws: number;
}

export interface TttState {
  board: Cell[];
  over: boolean;
  line: number[] | null;
  result: TttResult;
  game: number;
  record: TttRecord;
  version: number;
}

export const LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const TTT_MIN_INTERVAL_MS = 5000;

export function initialTtt(): TttState {
  return {
    board: [null, null, null, null, null, null, null, null, null],
    over: false,
    line: null,
    result: null,
    game: 1,
    record: { visitors: 0, bot: 0, draws: 0 },
    version: 0,
  };
}

export function winnerOf(board: Cell[]): { mark: Mark; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return { mark: v, line };
  }
  return null;
}

export function emptyCells(board: Cell[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i += 1) if (board[i] === null) out.push(i);
  return out;
}

function pick(list: number[], rnd: () => number): number {
  if (list.length === 0) return -1;
  const i = Math.min(list.length - 1, Math.max(0, Math.floor(rnd() * list.length)));
  return list[i];
}

export function botPick(board: Cell[], rnd: () => number = Math.random): number {
  const empty = emptyCells(board);
  if (empty.length === 0) return -1;

  const winsWith = (mark: Mark, i: number): boolean => {
    const probe = board.slice();
    probe[i] = mark;
    const w = winnerOf(probe);
    return !!w && w.mark === mark;
  };

  for (const i of empty) if (winsWith("O", i)) return i; // win
  for (const i of empty) if (winsWith("X", i)) return i; // block
  if (rnd() < 0.2) return pick(empty, rnd); // occasional blunder, keeps it beatable
  if (board[4] === null) return 4; // centre
  const corners = [0, 2, 6, 8].filter((i) => board[i] === null);
  if (corners.length > 0) return pick(corners, rnd);
  return pick(empty, rnd);
}

/** Applies the visitor move, then the bot reply. Returns the same object when nothing happens. */
export function applyVisitorMove(state: TttState, i: number, rnd: () => number = Math.random): TttState {
  if (state.over || i < 0 || i > 8 || state.board[i] !== null) return state;

  const board = state.board.slice();
  const record: TttRecord = { ...state.record };
  board[i] = "X";

  let over = false;
  let line: number[] | null = null;
  let result: TttResult = null;

  const afterX = winnerOf(board);
  if (afterX) {
    over = true;
    line = afterX.line;
    result = "win";
    record.visitors += 1;
  } else if (emptyCells(board).length === 0) {
    over = true;
    result = "draw";
    record.draws += 1;
  } else {
    const reply = botPick(board, rnd);
    if (reply >= 0) board[reply] = "O";
    const afterO = winnerOf(board);
    if (afterO) {
      over = true;
      line = afterO.line;
      result = "loss";
      record.bot += 1;
    } else if (emptyCells(board).length === 0) {
      over = true;
      result = "draw";
      record.draws += 1;
    }
  }

  return { ...state, board, over, line, result, record };
}

/** /t/new and the /play "new game" button. Only when the current game is over. */
export function startNewGame(state: TttState): TttState | null {
  if (!state.over) return null;
  return {
    ...initialTtt(),
    game: state.game + 1,
    record: state.record,
    version: state.version,
  };
}

export function normalizeTtt(raw: unknown, version: number): TttState {
  const base = initialTtt();
  if (!raw || typeof raw !== "object") return { ...base, version };
  const r = raw as Record<string, unknown>;

  let board: Cell[] = base.board;
  if (Array.isArray(r.board) && r.board.length === 9) {
    board = r.board.map((c) => (c === "X" || c === "O" ? c : null));
  }

  const rec = (r.record ?? {}) as Record<string, unknown>;
  const state: TttState = {
    board,
    over: false,
    line: null,
    result: null,
    game: Math.max(1, clampInt(r.game, 1, 1, 1_000_000)),
    record: {
      visitors: clampInt(rec.visitors, 0),
      bot: clampInt(rec.bot, 0),
      draws: clampInt(rec.draws, 0),
    },
    version,
  };

  const w = winnerOf(board);
  if (w) {
    state.over = true;
    state.line = w.line;
    state.result = w.mark === "X" ? "win" : "loss";
  } else if (emptyCells(board).length === 0) {
    state.over = true;
    state.result = "draw";
  }
  return state;
}

export function parseTttRow(json: string, version: number): TttState {
  return normalizeTtt(safeJson(json), version);
}

/** One line, sized to the 228 px banner. Must stay under ~36 characters. */
export function tttStatusLine(state: TttState): string {
  const r = state.record;
  const score = `you ${r.visitors} · bot ${r.bot} · draw ${r.draws}`;

  let head: string;
  if (!state.over) head = "your move — you are X";
  else if (state.result === "win") head = "you won — play again";
  else if (state.result === "loss") head = "bot won — play again";
  else head = "draw — play again";

  return `${head} · ${score}`;
}
