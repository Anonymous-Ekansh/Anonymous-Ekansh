import { describe, expect, it } from "vitest";

import {
  chessClick,
  chessMoveFromTo,
  chessNewGame,
  initialChess,
  normalizeChess,
  START_FEN,
  type ChessState,
  type Mover,
} from "../src/chesslogic";

const T0 = 1_700_000_000_000;
const IP_A = "aaaaaaaaaaaaaaaaaaaa";
const IP_B = "bbbbbbbbbbbbbbbbbbbb";

/** Engine tests identify a visitor with a bare hash; the routes pass both halves. */
const mover = (id: string): Mover => ({ visitor: id, ip: id, cookie: true });

function fresh(overrides: Partial<ChessState> = {}): ChessState {
  return { ...initialChess(), ...overrides };
}

function move(state: ChessState, from: string, to: string, now = T0, who: Mover | null = mover(IP_A)) {
  const first = chessClick(state, from, now, who);
  expect(first.action).toBe("select");
  return chessClick(first.state, to, now, who);
}

describe("chess clicks", () => {
  it("selects a piece of the side to move", () => {
    const step = chessClick(fresh(), "e2", T0, mover(IP_A));
    expect(step.action).toBe("select");
    expect(step.state.selected?.sq).toBe("e2");
    expect(step.state.selected?.expires).toBeGreaterThan(T0);
    expect(step.state.fen).toBe(START_FEN);
  });

  it("refuses a piece of the other colour", () => {
    const step = chessClick(fresh(), "e7", T0, mover(IP_A));
    expect(step.action).toBe("ignore");
    expect(step.state.selected).toBeNull();
  });

  it("plays a legal move and stores the SAN", () => {
    const step = move(fresh(), "e2", "e4");
    expect(step.action).toBe("move");
    expect(step.state.last).toEqual({ from: "e2", to: "e4", san: "e4" });
    expect(step.state.recent).toEqual(["e4"]);
    expect(step.state.selected).toBeNull();
    expect(step.state.fen).not.toBe(START_FEN);
    expect(step.state.lastMoveByVisitor).toBe(IP_A);
  });

  it("ignores an illegal destination and keeps the selection", () => {
    const selected = chessClick(fresh(), "e2", T0, mover(IP_A));
    const step = chessClick(selected.state, "e5", T0, mover(IP_A));
    expect(step.action).toBe("ignore");
    expect(step.state.fen).toBe(START_FEN);
    expect(step.state.selected?.sq).toBe("e2");
  });

  it("deselects on a second click of the same square", () => {
    const selected = chessClick(fresh(), "e2", T0, mover(IP_A));
    const step = chessClick(selected.state, "e2", T0 + 100, mover(IP_A));
    expect(step.action).toBe("deselect");
    expect(step.state.selected).toBeNull();
  });

  it("changes selection when another own piece is clicked", () => {
    const selected = chessClick(fresh(), "e2", T0, mover(IP_A));
    const step = chessClick(selected.state, "g1", T0 + 100, mover(IP_A));
    expect(step.action).toBe("select");
    expect(step.state.selected?.sq).toBe("g1");
  });

  it("expires a selection after 90 seconds", () => {
    const selected = chessClick(fresh(), "e2", T0, mover(IP_A));
    const late = chessClick(selected.state, "e4", T0 + 90_001, mover(IP_A));
    expect(late.action).toBe("ignore");
    expect(late.state.fen).toBe(START_FEN);
  });

  it("auto-queens a promotion", () => {
    const promotion = fresh({ fen: "4k3/1P6/8/8/8/8/8/4K3 w - - 0 1" });
    const step = move(promotion, "b7", "b8");
    expect(step.action).toBe("move");
    expect(step.state.last?.san).toBe("b8=Q+");
    expect(step.state.fen.split(" ")[0]).toContain("Q");
  });

  it("blocks two consecutive moves by the same visitor", () => {
    const first = move(fresh(), "e2", "e4");
    const second = move(first.state, "e7", "e5", T0 + 1000, mover(IP_A));
    expect(second.action).toBe("ignore");
    expect(second.state.fen).toBe(first.state.fen);
  });

  it("lets another visitor answer", () => {
    const first = move(fresh(), "e2", "e4");
    const second = move(first.state, "e7", "e5", T0 + 1000, mover(IP_B));
    expect(second.action).toBe("move");
    expect(second.state.recent).toEqual(["e4", "e5"]);
  });

  it("records a checkmate, resets the board and starts the next game", () => {
    // 1. f3 e5 2. g4 — black to move.
    const before = fresh({ fen: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2" });
    const step = move(before, "d8", "h4");
    expect(step.action).toBe("move");
    expect(step.state.record.black).toBe(1);
    expect(step.state.result).toContain("checkmate");
    expect(step.state.fen).toBe(START_FEN);
    expect(step.state.game).toBe(2);
    expect(step.state.selected).toBeNull();
  });

  it("records a stalemate as a draw", () => {
    const before = fresh({ fen: "7k/8/5QK1/8/8/8/8/8 w - - 0 1" });
    const step = move(before, "f6", "f7");
    expect(step.action).toBe("move");
    expect(step.state.record.draw).toBe(1);
    expect(step.state.result).toContain("stalemate");
    expect(step.state.fen).toBe(START_FEN);
  });

  it("clears the result banner with a new game", () => {
    const done = fresh({ result: "white wins · checkmate", game: 3 });
    const cleared = chessNewGame(done);
    expect(cleared?.result).toBeNull();
    expect(chessNewGame(fresh())).toBeNull();
  });

  it("plays an explicit from/to pair, including while a selection is pending", () => {
    const selected = chessClick(fresh(), "g1", T0, mover(IP_B));
    const step = chessMoveFromTo(selected.state, "g1", "f3", T0, mover(IP_A));
    expect(step.action).toBe("move");
    expect(step.state.last?.san).toBe("Nf3");
  });

  it("rejects an explicit illegal pair", () => {
    const step = chessMoveFromTo(fresh(), "e2", "e5", T0, mover(IP_A));
    expect(step.action).not.toBe("move");
    expect(step.state.fen).toBe(START_FEN);
  });

  it("survives corrupt stored state", () => {
    const junk = normalizeChess({ fen: "not-a-fen", recent: ["e4", "<script>"] }, 7);
    expect(junk.fen).toBe(START_FEN);
    expect(junk.recent).toEqual(["e4"]);
    expect(junk.version).toBe(7);
    expect(junk.record).toEqual({ white: 0, black: 0, draw: 0 });
  });
});
