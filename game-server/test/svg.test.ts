/**
 * Exhaustive image sweep: every SVG route, every theme, every game state.
 *
 * The README has no way to recover from a malformed document — GitHub shows a broken-image
 * icon and caches it — so the only defence is to parse every document we can produce. The
 * checker below is deliberately strict about attribute syntax, because a nested double quote
 * inside a double-quoted attribute (the exact bug that shipped) is not something a lenient
 * XML reader would forgive either.
 */

import { describe, expect, it } from "vitest";

import { initialChess, START_FEN, type ChessState } from "../src/chesslogic";
import { route } from "../src/index";
import { MemoryStore, type StoreLike } from "../src/store";
import { initialTtt, type TttState } from "../src/ttt";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const TAG = /^<\/?([A-Za-z][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*="[^"<>]*")*)\s*\/?>$/;
const ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

function checkText(text: string): void {
  if (text.includes("<")) throw new Error(`raw < left in text: ${text.slice(0, 40)}`);
  const bad = ENTITY.exec(text);
  if (bad) throw new Error(`unescaped & at ${bad.index}: ${text.slice(Math.max(0, bad.index - 24), bad.index + 24)}`);
}

/** Throws with a readable message instead of letting a regex assertion fail obscurely. */
function assertWellFormed(xml: string): void {
  const stack: string[] = [];
  let pos = 0;
  let sawRoot = false;

  while (pos < xml.length) {
    const lt = xml.indexOf("<", pos);
    checkText(lt === -1 ? xml.slice(pos) : xml.slice(pos, lt));
    if (lt === -1) break;

    const gt = xml.indexOf(">", lt);
    if (gt === -1) throw new Error(`unterminated tag at ${lt}`);
    const tag = xml.slice(lt, gt + 1);
    const m = TAG.exec(tag);
    if (!m) throw new Error(`invalid tag syntax: ${tag.slice(0, 200)}`);

    const name = m[1];
    const selfClosing = /\/>$/.test(tag);
    if (tag.startsWith("</")) {
      const top = stack.pop();
      if (top !== name) throw new Error(`mismatched </${name}>, expected </${top}>`);
    } else {
      if (stack.length === 0 && sawRoot) throw new Error("more than one root element");
      sawRoot = true;
      if (!selfClosing) stack.push(name);
    }
    pos = gt + 1;
  }

  if (stack.length > 0) throw new Error(`unclosed <${stack.join("><")}>`);
  if (!sawRoot) throw new Error("no root element");
}

async function get(path: string, store: StoreLike): Promise<Response> {
  return route(
    new Request(`https://arena.test${path}`, {
      headers: { "user-agent": BROWSER, "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" },
    }),
    {},
    { store, ip: "198.18.0.9", now: () => 1_700_000_000_000 },
  );
}

async function assertImage(path: string, store: StoreLike): Promise<string> {
  const res = await get(path, store);
  expect(res.status, path).toBe(200);
  expect(res.headers.get("content-type"), path).toBe("image/svg+xml; charset=utf-8");
  const body = await res.text();
  assertWellFormed(body);
  expect(body, path).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  expect(body, path).toContain('width="');
  expect(body, path).toContain('height="');
  expect(body, path).toContain('viewBox="0 0 ');
  return body;
}

function seed(store: MemoryStore, kind: string, state: TttState | ChessState, version = 3): void {
  void store.insert(kind, JSON.stringify({ ...state, version }), version);
}

const SQUARES: string[] = [];
for (const file of "abcdefgh") for (const rank of "12345678") SQUARES.push(`${file}${rank}`);
const THEMES = ["light", "dark"] as const;

/* ---------------------------------------------------------------- tic-tac-toe states */

const TTT_STATES: Array<[string, TttState]> = [
  ["fresh", initialTtt()],
  [
    "mid",
    {
      ...initialTtt(),
      board: ["X", null, "O", null, "X", null, "O", null, null],
      record: { visitors: 1, bot: 2, draws: 0 },
    },
  ],
  [
    "visitor-win",
    {
      ...initialTtt(),
      board: ["X", "X", "X", "O", "O", null, null, null, null],
      over: true,
      line: [0, 1, 2],
      result: "win",
      record: { visitors: 1, bot: 0, draws: 0 },
    },
  ],
  [
    "bot-win",
    {
      ...initialTtt(),
      board: ["O", "O", "O", "X", "X", null, null, null, null],
      over: true,
      line: [0, 1, 2],
      result: "loss",
      record: { visitors: 0, bot: 1, draws: 0 },
    },
  ],
  [
    "draw",
    {
      ...initialTtt(),
      board: ["X", "O", "X", "X", "O", "O", "O", "X", "X"],
      over: true,
      line: null,
      result: "draw",
      record: { visitors: 0, bot: 0, draws: 1 },
    },
  ],
];

describe("every tic-tac-toe image is valid XML in both themes", () => {
  for (const [label, state] of TTT_STATES) {
    for (const theme of THEMES) {
      it(`tiles, status, header and button — ${label} / ${theme}`, async () => {
        const store = new MemoryStore();
        seed(store, "ttt", state);

        for (let i = 0; i < 9; i += 1) {
          await assertImage(`/t/tile/${i}.svg?theme=${theme}`, store);
        }
        const status = await assertImage(`/t/status.svg?theme=${theme}`, store);
        expect(status.length).toBeGreaterThan(40);
        await assertImage(`/t/header.svg?theme=${theme}`, store);
        await assertImage(`/btn/new.svg?theme=${theme}`, store);
        await assertImage(`/btn/play.svg?theme=${theme}`, store);
      });
    }
  }
});

/* ---------------------------------------------------------------- chess states */

const MID: ChessState = {
  ...initialChess(),
  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
  last: { from: "e7", to: "e5", san: "e5" },
  recent: ["e4", "e5"],
  record: { white: 2, black: 1, draw: 1 },
};

const CHECK: ChessState = {
  ...initialChess(),
  fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
  last: { from: "d8", to: "h4", san: "Qh4#" },
  recent: ["e4", "e5", "g4", "Qh4#"],
  record: { white: 0, black: 3, draw: 0 },
};

const SELECTED: ChessState = {
  ...initialChess(),
  selected: { sq: "e2", expires: 1_700_000_090_000 },
};

const CHESS_STATES: Array<[string, ChessState]> = [
  ["opening", { ...initialChess(), fen: START_FEN }],
  ["mid", MID],
  ["check", CHECK],
  ["selected", SELECTED],
];

describe("every chess image is valid XML in both themes", () => {
  for (const [label, state] of CHESS_STATES) {
    for (const theme of THEMES) {
      it(`64 tiles, banners, header and buttons — ${label} / ${theme}`, async () => {
        const store = new MemoryStore();
        seed(store, "chess", state);

        for (const sq of SQUARES) {
          const body = await assertImage(`/c/tile/${sq}.svg?theme=${theme}`, store);
          if (sq[1] === "1") expect(body).toContain(`>${sq[0]}</text>`);
          if (sq[0] === "a") expect(body).toContain(`>${sq[1]}</text>`);
        }
        await assertImage(`/c/status.svg?theme=${theme}`, store);
        await assertImage(`/c/recent.svg?theme=${theme}`, store);
        await assertImage(`/c/header.svg?theme=${theme}`, store);
        await assertImage(`/btn/play.svg?theme=${theme}`, store);
      });
    }
  }
});

describe("svg plumbing", () => {
  it("keeps the font stack free of nested double quotes", async () => {
    const store = new MemoryStore();
    const body = await assertImage("/c/status.svg", store);
    expect(body).toContain('font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"');
    expect(body).not.toContain('"SF Mono"');
  });

  it("sizes images to the README layout", async () => {
    const store = new MemoryStore();
    expect(await assertImage("/c/tile/e4.svg", store)).toContain('width="52" height="52"');
    expect(await assertImage("/t/tile/0.svg", store)).toContain('width="76" height="76"');
    expect(await assertImage("/c/status.svg", store)).toContain('width="416" height="28"');
    expect(await assertImage("/t/status.svg", store)).toContain('width="228" height="28"');
    expect(await assertImage("/c/header.svg", store)).toContain('width="416" height="40"');
    expect(await assertImage("/t/header.svg", store)).toContain('width="228" height="40"');
  });

  it("returns a placeholder instead of a broken image when the store fails", async () => {
    const broken: StoreLike = {
      read: async () => {
        throw new Error("d1 is down");
      },
      readMany: async () => {
        throw new Error("d1 is down");
      },
      insert: async () => {
        throw new Error("d1 is down");
      },
      cas: async () => {
        throw new Error("d1 is down");
      },
    };
    const res = await get("/c/tile/e4.svg", broken);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    assertWellFormed(body);
    expect(body).toContain("unavailable");
  });

  it("draws the tic-tac-toe grid as inner edges only", async () => {
    const store = new MemoryStore();
    seed(store, "ttt", initialTtt());
    const corner = await assertImage("/t/tile/0.svg", store);
    expect(corner).not.toContain("<line");

    const middle = await assertImage("/t/tile/4.svg", store);
    expect(middle.match(/<line/g)?.length).toBe(2);
  });

  it("dims the losing marks and keeps the winning line at full ink", async () => {
    const store = new MemoryStore();
    const win = TTT_STATES.find(([label]) => label === "visitor-win")?.[1] as TttState;
    seed(store, "ttt", win);

    const winningTile = await assertImage("/t/tile/0.svg", store);
    const losingTile = await assertImage("/t/tile/3.svg", store);
    expect(winningTile).toContain('opacity="1"');
    expect(losingTile).toContain('opacity="0.45"');
  });
});
