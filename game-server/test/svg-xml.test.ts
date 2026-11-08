/**
 * Every SVG the Worker serves must be well-formed XML.
 *
 * An unescaped quote in one attribute (the old double-quoted "SF Mono" inside a double-quoted
 * font-family, for instance) is enough to make a whole tile unparseable, and GitHub then shows
 * a broken image instead of a board. This test renders every endpoint for both themes and hands
 * each document to an XML parser, so a regression fails the build rather than the README.
 */

import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

import { route } from "../src/index";
import { MONO } from "../src/svg";
import { MemoryStore } from "../src/store";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const NOW = 1_700_000_000_000;
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8];
const THEMES = ["light", "dark"] as const;

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const OPEN_CHESS = {
  fen: START_FEN,
  selected: null,
  last: null,
  recent: [],
  game: 1,
  record: { white: 0, black: 0, draw: 0 },
  result: null,
  lastMoveByVisitor: null,
};

/** A selection, a last move, and every kind of piece on the board. */
const RICH_CHESS = {
  fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  selected: { sq: "f3", expires: NOW + 60_000 },
  last: { from: "f1", to: "c4", san: "Bc4" },
  recent: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
  game: 7,
  record: { white: 3, black: 2, draw: 1 },
  result: null,
  lastMoveByVisitor: null,
};

/** Side to move is in check, and a result string sits in the status banner. */
const CHECK_CHESS = {
  fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
  selected: null,
  last: { from: "d8", to: "h4", san: "Qh4#" },
  recent: ["f3", "e5", "g4", "Qh4#"],
  game: 2,
  record: { white: 1, black: 3, draw: 0 },
  result: "black wins · checkmate",
  lastMoveByVisitor: null,
};

const RUNNING_TTT = {
  board: ["X", null, "O", null, "X", null, null, "O", null],
  over: false,
  line: null,
  result: null,
  game: 4,
  record: { visitors: 2, bot: 1, draws: 1 },
};

const OVER_TTT = {
  board: ["X", "X", "X", "O", "O", null, null, null, null],
  over: true,
  line: [0, 1, 2],
  result: "win",
  game: 5,
  record: { visitors: 3, bot: 1, draws: 1 },
};

function store(chess: object, ttt: object): MemoryStore {
  return new MemoryStore({
    chess: { json: JSON.stringify({ ...chess, version: 3 }), version: 3 },
    ttt: { json: JSON.stringify({ ...ttt, version: 3 }), version: 3 },
  });
}

/** Fetches from the real router and fails with the parser's verdict and position. */
async function render(store: MemoryStore, path: string): Promise<string> {
  const request = new Request(`https://arena.test${path}`, { headers: { "user-agent": BROWSER } });
  const res = await route(request, {}, { store, now: () => NOW });
  expect(res.status, `${path} should render`).toBe(200);
  expect(res.headers.get("content-type")).toContain("image/svg+xml");

  const body = await res.text();
  const verdict = XMLValidator.validate(body);
  const detail = verdict === true ? "" : ` at line ${verdict.err.line}, col ${verdict.err.col}: ${verdict.err.msg}`;
  expect(verdict === true, `${path} is not well-formed XML${detail}`).toBe(true);
  return body;
}

describe("svg documents", () => {
  it("keeps the font stack free of double quotes", () => {
    expect(MONO).not.toContain('"');
    expect(MONO).toContain("'SF Mono'");
  });

  it("renders every chess tile, both themes, for three board states", async () => {
    for (const state of [OPEN_CHESS, RICH_CHESS, CHECK_CHESS]) {
      const s = store(state, RUNNING_TTT);
      for (const theme of THEMES) {
        for (const file of FILES) {
          for (const rank of RANKS) {
            const svg = await render(s, `/c/tile/${file}${rank}.svg?theme=${theme}`);
            expect(svg).toContain(`aria-label="${file}${rank}:`);
            expect(svg).toContain('width="44"');
          }
        }
      }
    }
  });

  it("renders the chess status and recent banners, both themes", async () => {
    for (const state of [OPEN_CHESS, RICH_CHESS, CHECK_CHESS]) {
      const s = store(state, RUNNING_TTT);
      for (const theme of THEMES) {
        const status = await render(s, `/c/status.svg?theme=${theme}`);
        expect(status).toContain('width="540"');
        const recent = await render(s, `/c/recent.svg?theme=${theme}`);
        expect(recent).toContain('width="540"');
      }
    }
  });

  it("renders every tic-tac-toe tile, both themes, running and over", async () => {
    for (const state of [RUNNING_TTT, OVER_TTT]) {
      const s = store(OPEN_CHESS, state);
      for (const theme of THEMES) {
        for (let i = 0; i < 9; i += 1) {
          const svg = await render(s, `/t/tile/${i}.svg?theme=${theme}`);
          expect(svg).toContain('width="72"');
        }
      }
    }
  });

  it("renders the tic-tac-toe status banner, both themes", async () => {
    for (const state of [RUNNING_TTT, OVER_TTT]) {
      const s = store(OPEN_CHESS, state);
      for (const theme of THEMES) {
        const svg = await render(s, `/t/status.svg?theme=${theme}`);
        expect(svg).toContain('width="320"');
      }
    }
  });
});
