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

  it("rate limits two moves inside five seconds", async () => {
    const store = new MemoryStore();
    const first = await call("/t/click/0", { store, ip: "198.51.100.77", now: 5_000_000 });
    expect(first.status).toBe(302);

    const second = await call("/t/click/1", { store, ip: "198.51.100.77", now: 5_001_000 });
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("5");

    const later = await call("/t/click/1", { store, ip: "198.51.100.77", now: 5_006_000 });
    expect(later.status).toBe(302);
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
    expect(svg).toContain('width="52"');
    expect(svg).toContain("white p");

    const status = await (await call("/c/status.svg", { store })).text();
    expect(status).toContain("last e4");
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

  it("404s anything else and sends / to /play", async () => {
    expect((await call("/nope")).status).toBe(404);
    const root = await call("/");
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe("/play");
  });
});
