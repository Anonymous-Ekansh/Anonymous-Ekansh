import { describe, expect, it } from "vitest";

import { route } from "../src/index";
import { MemoryStore, type StoreLike } from "../src/store";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

interface CallOptions {
  store?: StoreLike;
  headers?: Record<string, string>;
  ip?: string;
  now?: number;
  rnd?: () => number;
  method?: string;
  body?: string;
}

let ipSeq = 0;
function nextIp(): string {
  ipSeq += 1;
  return `198.18.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
}

let vidSeq = 0;
/** A distinct 32-hex visitor id per call, so tests never share a limiter key. */
function nextVid(): string {
  vidSeq += 1;
  return vidSeq.toString(16).padStart(32, "0");
}

function withCookie(vid: string): Record<string, string> {
  return { cookie: `vid=${vid}` };
}

/** Pulls the minted visitor id out of a Set-Cookie header. */
function mintedVid(res: Response): string {
  const header = res.headers.get("set-cookie") ?? "";
  return /(?:^|[;\s])vid=([0-9a-f]{32})(?:;|$)/.exec(header)?.[1] ?? "";
}

function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "user-agent": BROWSER,
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    ...extra,
  };
}

async function call(path: string, options: CallOptions = {}): Promise<Response> {
  const store = options.store ?? new MemoryStore();
  const request = new Request(`https://arena.test${path}`, {
    method: options.method ?? "GET",
    headers: baseHeaders(options.headers),
    body: options.body,
  });
  return route(request, {}, {
    store,
    ip: options.ip ?? nextIp(),
    now: options.now !== undefined ? () => options.now as number : () => 1_700_000_000_000,
    rnd: options.rnd ?? (() => 0.99),
  });
}

describe("router", () => {
  it("serves a tic-tac-toe tile with image headers", async () => {
    const res = await call("/t/tile/4.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache, max-age=0, must-revalidate");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("etag")).toBe('"ttt-0-light-tile-4"');
    expect(await res.text()).toContain("<svg");
  });

  it("answers If-None-Match with 304", async () => {
    const store = new MemoryStore();
    const first = await call("/t/tile/0.svg", { store });
    const etag = first.headers.get("etag") as string;

    const second = await call("/t/tile/0.svg", { store, headers: { "if-none-match": etag } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("etag")).toBe(etag);
  });

  it("rejects out-of-range tiles with 404", async () => {
    expect((await call("/t/tile/9.svg")).status).toBe(404);
    expect((await call("/c/tile/z9.svg")).status).toBe(404);
    expect((await call("/c/click/e9")).status).toBe(404);
  });

  it("redirects a move to the profile with no-store", async () => {
    const res = await call("/t/click/4");
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("location")).toContain("https://github.com/Anonymous-Ekansh");
    expect(res.headers.get("location")).toContain("arena=ttt");
  });

  it("rejects an <img> embed of a move link", async () => {
    const res = await call("/t/click/4", { headers: { "sec-fetch-dest": "image", "sec-fetch-mode": "no-cors" } });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("embed");
  });

  it("rejects prefetchers by user agent", async () => {
    const res = await call("/c/click/e2", { headers: { "user-agent": "Slackbot-LinkExpanding 1.0" } });
    expect(res.status).toBe(403);
  });

  it("rate limits one visitor's moves, not the address they share", async () => {
    const store = new MemoryStore();
    const ip = "198.51.100.77";

    const first = await call("/t/click/0", { store, ip, now: 5_000_000 });
    expect(first.status).toBe(302);
    const vid = mintedVid(first);

    const second = await call("/t/click/1", { store, ip, now: 5_001_000, headers: withCookie(vid) });
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("5");
    expect(second.headers.get("x-arena-reason")).toBe("cooldown");

    // A different visitor behind the same address is not inside that window.
    const neighbour = await call("/t/click/1", { store, ip, now: 5_001_000, headers: withCookie(nextVid()) });
    expect(neighbour.status).toBe(302);

    const later = await call("/t/click/3", { store, ip, now: 5_006_000, headers: withCookie(vid) });
    expect(later.status).toBe(302);
    expect(later.headers.get("x-arena-reason")).toBe("moved");
  });

  it("plays a chess move through two link clicks", async () => {
    const store = new MemoryStore();
    const ip = "198.51.100.88";

    expect((await call("/c/click/e2", { store, ip })).status).toBe(302);
    const select = await call("/c/tile/e2.svg", { store });
    expect(await select.text()).toContain("stroke-width=\"2\""); // selection border

    expect((await call("/c/click/e4", { store, ip, now: 1_700_000_006_000 })).status).toBe(302);

    const tile = await call("/c/tile/e4.svg", { store });
    const svg = await tile.text();
    expect(svg).toContain('width="44"');
    expect(svg).toContain("white p");

    const status = await (await call("/c/status.svg", { store })).text();
    expect(status).toContain("last: e4");
  });

  it("serves the status, recent and play routes", async () => {
    const store = new MemoryStore();
    expect(await (await call("/t/status.svg", { store })).text()).toContain("your move");
    expect(await (await call("/c/recent.svg", { store })).text()).toContain("recent");

    const page = await call("/play", { store });
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const html = await page.text();
    expect(html).toContain("Community chess");
    expect(html).toContain("cdn.jsdelivr.net/npm/chess.js@1.4.0");
    expect(html).toContain("sha384-"); // SRI hash on the pinned chess.js fetch
    expect(html).toContain("integrity: SRI");

    // The SRI-verified module is imported from a blob URL, so script-src must allow blob:.
    const csp = page.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src");
    expect(csp).toContain("blob:");
    expect(csp).toContain("https://cdn.jsdelivr.net");
  });

  it("returns JSON state and accepts a JSON move", async () => {
    const store = new MemoryStore();
    const state = await call("/api/state", { store });
    const first = (await state.json()) as { ok: boolean; ttt: { board: unknown[] } };
    expect(first.ok).toBe(true);
    expect(first.ttt.board).toHaveLength(9);

    const moved = await call("/api/move", {
      store,
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://arena.test", "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" },
      body: JSON.stringify({ game: "ttt", cell: 0 }),
    });
    const body = (await moved.json()) as { ok: boolean; ttt: { board: (string | null)[] } };
    expect(moved.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ttt.board[0]).toBe("X");
    expect(body.ttt.board[4]).toBe("O"); // bot answered the centre
  });

  it("validates JSON move input", async () => {
    const store = new MemoryStore();
    const headers = { "content-type": "application/json", origin: "https://arena.test" };

    const bad = await call("/api/move", { store, method: "POST", headers, body: JSON.stringify({ game: "ttt", cell: 9 }) });
    expect(bad.status).toBe(400);

    const badGame = await call("/api/move", { store, method: "POST", headers, body: JSON.stringify({ game: "go" }) });
    expect(badGame.status).toBe(400);

    const badJson = await call("/api/move", { store, method: "POST", headers, body: "{" });
    expect(badJson.status).toBe(400);

    const foreign = await call("/api/move", {
      store,
      method: "POST",
      headers: { ...headers, origin: "https://evil.example" },
      body: JSON.stringify({ game: "ttt", cell: 0 }),
    });
    expect(foreign.status).toBe(403);
  });

  it("mints a 128-bit visitor cookie on the first click and keeps it", async () => {
    const store = new MemoryStore();
    const first = await call("/c/click/e2", { store, ip: "203.0.113.5" });
    expect(first.status).toBe(302);

    const header = first.headers.get("set-cookie") ?? "";
    const vid = mintedVid(first);
    expect(first.headers.get("x-arena-identity")).toBe("minted");
    expect(vid).toMatch(/^[0-9a-f]{32}$/); // 128 bits, hex
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=2592000"); // 30 days

    // A request that already carries the cookie is not handed a new one.
    const again = await call("/c/click/e2", {
      store,
      ip: "203.0.113.5",
      now: 1_700_000_002_000,
      headers: withCookie(vid),
    });
    expect(again.status).toBe(302);
    expect(again.headers.get("set-cookie")).toBeNull();
    expect(again.headers.get("x-arena-identity")).toBe("cookie");
  });

  it("keeps two cookies on one IP independent and blocks a repeat move", async () => {
    const store = new MemoryStore();
    const ip = "203.0.113.77";
    const t0 = 1_700_003_000_000;
    const other = nextVid();

    // First visit: no cookie yet, so this click also mints one.
    const first = await call("/c/click/e2", { store, ip, now: t0 });
    expect(first.status).toBe(302);
    const mine = mintedVid(first);
    expect(mine).toMatch(/^[0-9a-f]{32}$/);

    expect((await call("/c/click/e4", { store, ip, now: t0 + 1_000, headers: withCookie(mine) })).status).toBe(302);

    // Only hashes reach storage; the cookie value itself never does.
    const stored = (await store.read("chess"))?.json ?? "";
    expect(stored).toContain("lastMoveByVisitor");
    expect(stored).not.toContain(mine);

    // The same cookie cannot answer its own move.
    expect((await call("/c/click/e7", { store, ip, now: t0 + 2_000, headers: withCookie(mine) })).status).toBe(302);
    expect((await call("/c/click/e5", { store, ip, now: t0 + 2_500, headers: withCookie(mine) })).status).toBe(302);
    expect(await (await call("/c/status.svg", { store })).text()).toContain("last: e4");

    // A different cookie on the same IP can answer.
    expect((await call("/c/click/e7", { store, ip, now: t0 + 3_000, headers: withCookie(other) })).status).toBe(302);
    expect((await call("/c/click/e5", { store, ip, now: t0 + 3_500, headers: withCookie(other) })).status).toBe(302);
    const recent = await (await call("/c/recent.svg", { store })).text();
    expect(recent).toContain("e4");
    expect(recent).toContain("e5");

    // The cooldown is per cookie: the first visitor is throttled on its own clock.
    expect((await call("/c/click/g1", { store, ip, now: t0 + 4_000, headers: withCookie(mine) })).status).toBe(302);
    const throttled = await call("/c/click/f3", { store, ip, now: t0 + 4_500, headers: withCookie(mine) });
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).toBe("5");

    // ...and the move lands once the five seconds have passed.
    expect((await call("/c/click/f3", { store, ip, now: t0 + 7_000, headers: withCookie(mine) })).status).toBe(302);
    expect(await (await call("/c/status.svg", { store })).text()).toContain("Nf3");
  });

  it("caps one IP at 120 moves per hour and still sets the cookie on a 429", async () => {
    const store = new MemoryStore();
    const ip = "203.0.113.241";
    let now = 1_700_010_000_000;
    const base = { "content-type": "application/json", origin: "https://arena.test" };

    const nextMove = async () => {
      const snap = (await (await call("/api/state", { store, ip, now })).json()) as {
        ttt: { over: boolean; board: (string | null)[] };
      };
      const cell = snap.ttt.board.findIndex((c) => c === null);
      return snap.ttt.over ? { game: "ttt", new: true } : { game: "ttt", cell };
    };

    const statuses: number[] = [];
    let lastReason = "";
    for (let i = 0; i < 120; i += 1) {
      const res = await call("/api/move", {
        store,
        ip,
        now,
        method: "POST",
        headers: { ...base, ...withCookie(nextVid()) },
        body: JSON.stringify(await nextMove()),
      });
      statuses.push(res.status);
      lastReason = res.headers.get("x-arena-reason") ?? "";
      now += 1_000;
    }

    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(lastReason).toBe("moved");

    // A cookie-less visitor hits the same cap, and still leaves with a cookie of their own.
    const rest = await call("/api/move", {
      store,
      ip,
      now,
      method: "POST",
      headers: base,
      body: JSON.stringify(await nextMove()),
    });
    expect(rest.status).toBe(429);
    expect(rest.headers.get("x-arena-reason")).toBe("ip-cap");
    expect(rest.headers.get("x-arena-identity")).toBe("minted");
    expect(mintedVid(rest)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("lets two visitors on one IP answer each other, cookie-less on their first click", async () => {
    const store = new MemoryStore();
    const ip = "203.0.113.120";
    const t = 1_700_008_000_000;

    // Visitor A arrives with no cookie at all.
    const aSelect = await call("/c/click/d2", { store, ip, now: t });
    expect(aSelect.status).toBe(302);
    expect(aSelect.headers.get("x-arena-identity")).toBe("minted");
    const a = mintedVid(aSelect);
    expect((await call("/c/click/d4", { store, ip, now: t + 1_000, headers: withCookie(a) })).status).toBe(302);

    // Visitor B, also with no cookie, answers on the same IP.
    const bSelect = await call("/c/click/d7", { store, ip, now: t + 2_000 });
    expect(bSelect.status).toBe(302);
    const b = mintedVid(bSelect);
    expect(b).not.toBe(a);
    const bMove = await call("/c/click/d5", { store, ip, now: t + 3_000, headers: withCookie(b) });
    expect(bMove.status).toBe(302);
    expect(bMove.headers.get("x-arena-reason")).toBe("moved");

    // And so on: Nf3 / Nc6, both of them on the same address.
    expect((await call("/c/click/g1", { store, ip, now: t + 6_000, headers: withCookie(a) })).status).toBe(302);
    const aMove = await call("/c/click/f3", { store, ip, now: t + 7_000, headers: withCookie(a) });
    expect(aMove.status).toBe(302);
    expect(aMove.headers.get("x-arena-reason")).toBe("moved");

    expect((await call("/c/click/b8", { store, ip, now: t + 8_000, headers: withCookie(b) })).status).toBe(302);
    const bMove2 = await call("/c/click/c6", { store, ip, now: t + 9_000, headers: withCookie(b) });
    expect(bMove2.status).toBe(302);
    expect(bMove2.headers.get("x-arena-reason")).toBe("moved");

    const recent = await (await call("/c/recent.svg", { store })).text();
    for (const san of ["d4", "d5", "Nf3", "Nc6"]) expect(recent).toContain(san);
    expect(await (await call("/c/status.svg", { store })).text()).toContain("last: Nc6");
  });

  it("does not let one visitor's cooldown throttle another on the same IP", async () => {
    const store = new MemoryStore();
    const ip = "203.0.113.131";
    const t = 1_700_009_000_000;
    const a = nextVid();
    const b = nextVid();

    // A's second selection lands inside the 1 s selection gate.
    expect((await call("/c/click/e2", { store, ip, now: t, headers: withCookie(a) })).status).toBe(302);
    const throttled = await call("/c/click/g1", { store, ip, now: t + 300, headers: withCookie(a) });
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("x-arena-reason")).toBe("cooldown");
    expect(throttled.headers.get("x-arena-identity")).toBe("cookie");

    // B, on the same IP at the same moment, is untouched by A's cooldown.
    const bSelect = await call("/c/click/g1", { store, ip, now: t + 300, headers: withCookie(b) });
    expect(bSelect.status).toBe(302);

    const bMove = await call("/c/click/f3", { store, ip, now: t + 2_000, headers: withCookie(b) });
    expect(bMove.status).toBe(302);
    expect(await (await call("/c/status.svg", { store })).text()).toContain("last: Nf3");
  });

  it("sends the visitor cookie from the /play page", async () => {
    const html = await (await call("/play")).text();
    expect(html).toContain('fetch("/api/state", { cache: "no-store", credentials: "same-origin" })');
    expect(html).toContain('body: JSON.stringify(payload),\n      credentials: "same-origin"');
    // Only the cross-origin chess.js fetch keeps credentials off.
    expect(html).toContain('integrity: SRI, mode: "cors", credentials: "omit"');
    expect(html.match(/credentials: "omit"/g)?.length).toBe(1);
  });

  it("404s anything else and sends / to /play", async () => {
    expect((await call("/nope")).status).toBe(404);
    const root = await call("/");
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe("/play");
  });
});
