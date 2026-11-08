/**
 * Community chess engine wrapper around chess.js 1.4.0 (legal moves, check, mate, draws).
 *
 * The stored state is the whole game: FEN plus the pending selection, the last move, the
 * last ten SAN tokens and the running record. Both colours belong to whoever clicks next,
 * so the board is a shared object rather than a per-visitor game.
 */

import { Chess } from "chess.js";

import { clampInt, isSquare, safeJson, sanitizeSan, sanitizeText } from "./util";

/** chess.js types its square parameters as a union; we validate before every call. */
type Sq = Parameters<Chess["get"]>[0];
const asSq = (s: string): Sq => s as Sq;

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const SELECT_MS = 90_000;

export interface ChessMoveRef {
  from: string;
  to: string;
  san: string;
}

export interface ChessRecord {
  white: number;
  black: number;
  draw: number;
}

export interface ChessState {
  fen: string;
  selected: { sq: string; expires: number } | null;
  last: ChessMoveRef | null;
  recent: string[];
  game: number;
  record: ChessRecord;
  result: string | null;
  /** Salted hash of the cookie of whoever moved last. Never a raw cookie or a raw address. */
  lastMoveByVisitor: string | null;
  version: number;
}

/** Who is trying to move. The hash is a salted SHA-256 prefix; the raw cookie never leaves the request. */
export interface Mover {
  /** Hash of the visitor cookie. Always present: the route mints one when the request has none. */
  visitor: string;
}

/**
 * The "no two consecutive chess moves" rule.
 *
 * Identity is the visitor cookie and nothing else. The address is never consulted here: a
 * shared Wi-Fi or office IP is not one person, and two players behind it must be able to
 * answer each other. The route mints a cookie on a request that has none and uses that fresh
 * hash for the request itself, so a visitor still cannot answer their own opening move.
 */
export function sameMover(state: ChessState, mover: Mover | null): boolean {
  if (!mover) return false;
  return state.lastMoveByVisitor === mover.visitor;
}

function moverStamp(state: ChessState, mover: Mover | null): Pick<ChessState, "lastMoveByVisitor"> {
  return { lastMoveByVisitor: mover ? mover.visitor : state.lastMoveByVisitor };
}

export type ChessAction = "select" | "move" | "deselect" | "ignore" | "reset";

/** Reported verbatim in the X-Arena-Reason response header. */
export type StepReason = "moved" | "selected" | "same-visitor" | "not-your-turn" | "illegal";

export interface ChessStep {
  state: ChessState;
  action: ChessAction;
  reason: StepReason;
}

export function initialChess(): ChessState {
  return {
    fen: START_FEN,
    selected: null,
    last: null,
    recent: [],
    game: 1,
    record: { white: 0, black: 0, draw: 0 },
    result: null,
    lastMoveByVisitor: null,
    version: 0,
  };
}

export function newChess(fen?: string): Chess {
  if (fen) {
    try {
      return new Chess(fen);
    } catch {
      // fall through to a fresh board
    }
  }
  return new Chess();
}

export function targetsFrom(chess: Chess, sq: string): Array<{ to: string; capture: boolean }> {
  try {
    const moves = chess.moves({ square: asSq(sq), verbose: true }) as unknown as Array<{
      to: string;
      captured?: string;
      flags?: string;
    }>;
    return moves.map((m) => ({
      to: m.to,
      capture: typeof m.captured === "string" || (typeof m.flags === "string" && m.flags.includes("e")),
    }));
  } catch {
    return [];
  }
}

export function kingSquare(chess: Chess, color: "w" | "b"): string | null {
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type === "k" && cell.color === color) return cell.square;
    }
  }
  return null;
}

export interface Outcome {
  kind: "white" | "black" | "draw";
  label: string;
}

export function chessOutcome(chess: Chess): Outcome {
  if (chess.isCheckmate()) {
    return { kind: chess.turn() === "w" ? "black" : "white", label: "checkmate" };
  }
  if (chess.isStalemate()) return { kind: "draw", label: "stalemate" };
  if (chess.isInsufficientMaterial()) return { kind: "draw", label: "insufficient material" };
  if (chess.isThreefoldRepetition()) return { kind: "draw", label: "threefold repetition" };
  if (chess.isDraw()) return { kind: "draw", label: "fifty-move rule" };
  return { kind: "draw", label: "draw" };
}

/** Resets the board after mate/stalemate/draw and folds the result into the record. */
export function finishGame(state: ChessState, chess: Chess, mover: Mover | null): ChessState {
  const outcome = chessOutcome(chess);
  const record: ChessRecord = { ...state.record };
  if (outcome.kind === "white") record.white += 1;
  else if (outcome.kind === "black") record.black += 1;
  else record.draw += 1;

  const head = outcome.kind === "draw" ? "draw" : `${outcome.kind} wins`;
  return {
    ...state,
    fen: START_FEN,
    selected: null,
    recent: [],
    game: state.game + 1,
    record,
    result: `${head} · ${outcome.label}`,
    ...moverStamp(state, mover),
  };
}

function activeSelection(state: ChessState, chess: Chess, now: number): { sq: string; expires: number } | null {
  const sel = state.selected;
  if (!sel || !isSquare(sel.sq)) return null;
  if (!Number.isFinite(sel.expires) || sel.expires <= now) return null;
  const piece = chess.get(asSq(sel.sq));
  if (!piece || piece.color !== chess.turn()) return null;
  if (targetsFrom(chess, sel.sq).length === 0) return null;
  return sel;
}

/**
 * One click on a square.
 *
 *  - nothing selected: select a piece of the side to move that has a legal move
 *  - same square: deselect
 *  - legal destination: play it (auto-queen)
 *  - another own piece: move the selection
 *  - anything else: ignore
 */
export function chessClick(state: ChessState, sq: string, now: number, mover: Mover | null): ChessStep {
  if (!isSquare(sq)) return { state, action: "ignore", reason: "illegal" };

  const chess = newChess(state.fen);
  if (chess.isGameOver()) {
    // A previous move ended the game but the reset never landed; finish it now.
    return { state: finishGame(state, chess, mover), action: "reset", reason: "moved" };
  }

  const turn = chess.turn();
  const piece = chess.get(asSq(sq));
  const own = !!piece && piece.color === turn;
  const ownMoves = own ? targetsFrom(chess, sq) : [];
  const sel = activeSelection(state, chess, now);
  // A piece that exists but belongs to the side not to move.
  const wrongSide: StepReason = "not-your-turn";

  if (!sel) {
    if (own && ownMoves.length > 0) {
      return { state: { ...state, selected: { sq, expires: now + SELECT_MS } }, action: "select", reason: "selected" };
    }
    return {
      state: state.selected ? { ...state, selected: null } : state,
      action: "ignore",
      reason: piece ? wrongSide : "illegal",
    };
  }

  if (sel.sq === sq) return { state: { ...state, selected: null }, action: "deselect", reason: "selected" };

  const target = targetsFrom(chess, sel.sq).find((m) => m.to === sq);
  if (target) {
    // One move per person in a row: the same cookie cannot play both colours.
    if (sameMover(state, mover)) {
      return { state: { ...state, selected: null }, action: "ignore", reason: "same-visitor" };
    }
    try {
      const mv = chess.move({ from: asSq(sel.sq), to: asSq(sq), promotion: "q" });
      const next: ChessState = {
        ...state,
        fen: chess.fen(),
        selected: null,
        last: { from: mv.from, to: mv.to, san: mv.san },
        recent: [...state.recent, mv.san].slice(-10),
        ...moverStamp(state, mover),
      };
      if (chess.isGameOver()) return { state: finishGame(next, chess, mover), action: "move", reason: "moved" };
      return { state: next, action: "move", reason: "moved" };
    } catch {
      return { state: { ...state, selected: null }, action: "ignore", reason: "illegal" };
    }
  }

  if (own && ownMoves.length > 0) {
    return { state: { ...state, selected: { sq, expires: now + SELECT_MS } }, action: "select", reason: "selected" };
  }

  return { state, action: "ignore", reason: piece ? wrongSide : "illegal" };
}

/** /api/move path: an explicit from -> to drag, without relying on stored selection. */
export function chessMoveFromTo(
  state: ChessState,
  from: string,
  to: string,
  now: number,
  mover: Mover | null,
): ChessStep {
  if (!isSquare(from) || !isSquare(to) || from === to) return { state, action: "ignore", reason: "illegal" };

  const chess = newChess(state.fen);
  if (chess.isGameOver()) return { state: finishGame(state, chess, mover), action: "reset", reason: "moved" };

  let working = state;
  const sel = activeSelection(state, chess, now);
  if (!sel || sel.sq !== from) {
    const step = chessClick(state, from, now, mover);
    if (step.action !== "select") return step;
    working = step.state;
  }
  return chessClick(working, to, now, mover);
}

/** Clears the result banner after a game ended (the board itself already reset). */
export function chessNewGame(state: ChessState): ChessState | null {
  if (!state.result) return null;
  return { ...state, result: null, last: null, recent: [] };
}

export function normalizeChess(raw: unknown, version: number): ChessState {
  const base = initialChess();
  if (!raw || typeof raw !== "object") return { ...base, version };
  const r = raw as Record<string, unknown>;

  const fen = typeof r.fen === "string" && r.fen.length <= 120 ? newChess(r.fen).fen() : base.fen;

  let selected: ChessState["selected"] = null;
  const rawSel = r.selected as Record<string, unknown> | null | undefined;
  if (rawSel && typeof rawSel === "object" && isSquare(rawSel.sq) && typeof rawSel.expires === "number") {
    if (Number.isFinite(rawSel.expires)) selected = { sq: rawSel.sq, expires: Math.floor(rawSel.expires) };
  }

  let last: ChessMoveRef | null = null;
  const rawLast = r.last as Record<string, unknown> | null | undefined;
  if (rawLast && typeof rawLast === "object" && isSquare(rawLast.from) && isSquare(rawLast.to)) {
    const san = sanitizeSan(rawLast.san);
    if (san) last = { from: rawLast.from, to: rawLast.to, san };
  }

  const recent: string[] = [];
  if (Array.isArray(r.recent)) {
    for (const item of r.recent.slice(-10)) {
      const san = sanitizeSan(item);
      if (san) recent.push(san);
    }
  }

  const rec = (r.record ?? {}) as Record<string, unknown>;
  const hashOf = (v: unknown): string | null => (typeof v === "string" && /^[0-9a-f]{20}$/.test(v) ? v : null);

  return {
    fen,
    selected,
    last,
    recent,
    game: Math.max(1, clampInt(r.game, 1, 1, 1_000_000)),
    record: {
      white: clampInt(rec.white, 0),
      black: clampInt(rec.black, 0),
      draw: clampInt(rec.draw, 0),
    },
    result: sanitizeText(r.result),
    // `lastIpHash` and `lastMoveByIp` are pre-cookie field names that held an address hash.
    // They are tolerated on read but never become an identity: an address is not a person.
    lastMoveByVisitor: hashOf(r.lastMoveByVisitor),
    version,
  };
}

export function parseChessRow(json: string, version: number): ChessState {
  return normalizeChess(safeJson(json), version);
}

export function chessStatusText(state: ChessState): { line1: string; line2: string } {
  const chess = newChess(state.fen);
  const turn = chess.turn() === "w" ? "White" : "Black";
  const last = state.last ? `last: ${state.last.san}` : "last: —";
  const line1 = `${turn} to move · game #${state.game} · ${last}`;

  const r = state.record;
  let line2 = `white ${r.white} · black ${r.black} · draw ${r.draw}`;
  if (state.result) line2 += ` · ${state.result}`;
  else if (chess.inCheck()) line2 += " · check";
  return { line1, line2 };
}

export function chessRecentText(state: ChessState): { line1: string; line2: string } {
  const moves = state.recent.slice(-5);
  const line1 = moves.length > 0 ? `recent — ${moves.join(" ")}` : "recent — no moves yet";
  const line2 = `game #${state.game} · last 5 of the last 10 plies`;
  return { line1, line2 };
}

/** Snapshots for /api/state and /api/move (no hashes, no selection expiry noise). */
export function chessPublic(state: ChessState, now: number) {
  const chess = newChess(state.fen);
  const sel = state.selected && state.selected.expires > now ? state.selected.sq : null;
  return {
    fen: state.fen,
    turn: chess.turn(),
    check: chess.inCheck() ? kingSquare(chess, chess.turn()) : null,
    selected: sel,
    last: state.last,
    recent: state.recent,
    game: state.game,
    record: state.record,
    result: state.result,
    over: chess.isGameOver(),
  };
}
