import { describe, expect, it } from "vitest";

import { applyVisitorMove, botPick, initialTtt, normalizeTtt, startNewGame, winnerOf, type Cell } from "../src/ttt";

function board(cells: string): Cell[] {
  return cells.split("").map((c) => (c === "X" || c === "O" ? c : null));
}

function state(cells: string) {
  return normalizeTtt({ board: board(cells), game: 1, record: { visitors: 0, bot: 0, draws: 0 } }, 1);
}

const noRnd = () => 0.99; // never take the 20% random branch

describe("tic-tac-toe", () => {
  it("records a visitor win and the winning line", () => {
    const before = state("XX..O....");
    const after = applyVisitorMove(before, 2, noRnd);

    expect(after.over).toBe(true);
    expect(after.result).toBe("win");
    expect(after.line).toEqual([0, 1, 2]);
    expect(after.record.visitors).toBe(1);
    expect(after.board[2]).toBe("X");
  });

  it("records a loss when the bot completes its line", () => {
    const before = state("OO.X..X..");
    const after = applyVisitorMove(before, 5, noRnd);

    expect(after.over).toBe(true);
    expect(after.result).toBe("loss");
    expect(after.line).toEqual([0, 1, 2]);
    expect(after.record.bot).toBe(1);
    expect(after.board[2]).toBe("O");
  });

  it("records a draw when the last tile fills the board with no line", () => {
    const before = state("XOXXOOOX.");
    const after = applyVisitorMove(before, 8, noRnd);

    expect(after.over).toBe(true);
    expect(after.result).toBe("draw");
    expect(after.record.draws).toBe(1);
    expect(winnerOf(after.board)).toBeNull();
  });

  it("ignores a tile that is already taken", () => {
    const before = state("X........");
    const after = applyVisitorMove(before, 0, noRnd);

    expect(after).toBe(before);
  });

  it("ignores a click after the game is over", () => {
    const before = state("XXXOO...."); // over: X has 0,1,2
    expect(before.over).toBe(true);

    const after = applyVisitorMove(before, 5, noRnd);
    expect(after).toBe(before);
    expect(after.record.visitors).toBe(0);
  });

  it("only starts a new game once the current one is over", () => {
    const running = state("XO.......");
    expect(startNewGame(running)).toBeNull();

    const over = normalizeTtt(
      { board: board("XXXOO...."), game: 4, record: { visitors: 2, bot: 1, draws: 1 } },
      9,
    );
    const fresh = startNewGame(over);
    expect(fresh).not.toBeNull();
    expect(fresh?.game).toBe(5);
    expect(fresh?.over).toBe(false);
    expect(fresh?.board.every((c) => c === null)).toBe(true);
    expect(fresh?.record).toEqual({ visitors: 2, bot: 1, draws: 1 });
  });

  it("takes a win before blocking a loss", () => {
    // O can win at 2; X also threatens at 8. A winning move must win.
    const pick = botPick(board("OO......X") as Cell[], () => 0.5);
    expect(pick).toBe(2);
  });

  it("blocks the visitor when it cannot win", () => {
    const pick = botPick(board("XX.O..O..") as Cell[], noRnd);
    expect(pick).toBe(2);
  });

  it("falls back to the centre, then a corner", () => {
    expect(botPick(board("X........") as Cell[], noRnd)).toBe(4);
    expect([0, 2, 6, 8]).toContain(botPick(board("X...O....") as Cell[], noRnd));
  });

  it("survives corrupt stored state", () => {
    const junk = normalizeTtt({ board: "nope", game: -4, record: { visitors: "x" } }, 3);
    expect(junk.board).toHaveLength(9);
    expect(junk.game).toBe(1);
    expect(junk.record).toEqual({ visitors: 0, bot: 0, draws: 0 });
    expect(junk.version).toBe(3);
  });
});
