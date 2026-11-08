/**
 * ARENA — a Cloudflare Worker that turns two shared boards into README images.
 *
 * Every tile is rendered from the stored game state on demand, so a profile README only
 * needs <img> tags. Moves are ordinary links, which means they need the abuse control in
 * ./security.ts (fetch metadata, user-agent screen, hashed-IP rate limiting) and the
 * compare-and-swap writes in ./store.ts.
 */

import {
  chessClick,
  chessMoveFromTo,
  chessNewGame,
  chessPublic,
  initialChess,
  newChess,
  parseChessRow,
  type ChessState,
} from "./chesslogic";
import { playPage } from "./play";
import { clientIp, hashIp, isBotUa, PROFILE_DEFAULT, RateLimiter, secFetchAllows } from "./security";
import { D1Store, MemoryStore, type StateRow, type StoreLike } from "./store";
import { chessRecentSvg, chessStatusSvg, chessTileSvg, parseTheme, tttStatusSvg, tttTileSvg, type Theme } from "./svg";
import {
  applyVisitorMove,
  initialTtt,
  parseTttRow,
  startNewGame as tttStartNewGame,
  type TttState,
} from "./ttt";
import { isSquare, isTile } from "./util";

export interface Env {
  DB?: D1Database;
  PROFILE_URL?: string;
  RATE_SALT?: string;
}

export interface Deps {
  store?: StoreLike;
  now?: () => number;
  rnd?: () => number;
  ip?: string;
  ua?: string | null;
  dest?: string | null;
  mode?: string | null;
}

interface Ctx {
  store: StoreLike;
  now: () => number;
  rnd: () => number;
  ip: string;
  ua: string | null;
  dest: string | null;
  mode: string | null;
  profile: string;
  salt: string;
}

/** One move every 5 s per hashed IP; selection clicks get a lighter 1 s gate. */
const moveLimiter = new RateLimiter(5_000);
const selectLimiter = new RateLimiter(1_000);

const NO_STORE = "no-store";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch {
      return plain("server error", 500);
    }
  },
};

/* ------------------------------------------------------------------ router */

export async function route(request: Request, env: Env = {}, deps: Deps = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = trimPath(url.pathname);
  const theme = parseTheme(url.searchParams.get("theme"));
  const now = deps.now ?? (() => Date.now());

  const ctx: Ctx = {
    store: deps.store ?? (env.DB ? new D1Store(env.DB, now) : new MemoryStore()),
    now,
    rnd: deps.rnd ?? Math.random,
    ip: deps.ip ?? clientIp(request),
    ua: deps.ua !== undefined ? deps.ua : request.headers.get("user-agent"),
    dest: deps.dest !== undefined ? deps.dest : request.headers.get("sec-fetch-dest"),
    mode: deps.mode !== undefined ? deps.mode : request.headers.get("sec-fetch-mode"),
    profile:
      env.PROFILE_URL && /^https?:\/\/[^\s"'<>]+$/.test(env.PROFILE_URL) ? env.PROFILE_URL : PROFILE_DEFAULT,
    salt: env.RATE_SALT && env.RATE_SALT.length > 0 ? env.RATE_SALT : "arena-public-salt-v1",
  };

  if (request.method === "POST") {
    if (path === "/api/move") return apiMove(request, ctx);
    return plain("method not allowed", 405, { Allow: "GET, POST" });
  }
  if (request.method !== "GET") return plain("method not allowed", 405, { Allow: "GET, POST" });

  let m: RegExpExecArray | null;

  if ((m = /^\/t\/tile\/([0-8])\.svg$/.exec(path))) return tttTile(ctx, Number(m[1]), theme, request);
  if ((m = /^\/t\/click\/([0-8])$/.exec(path))) return tttClick(ctx, Number(m[1]), request);
  if (path === "/t/new") return tttNew(ctx, request);
  if (path === "/t/status.svg") return tttStatusImage(ctx, theme, request);

  if ((m = /^\/c\/tile\/([a-h][1-8])\.svg$/.exec(path))) return chessTile(ctx, m[1], theme, request);
  if ((m = /^\/c\/click\/([a-h][1-8])$/.exec(path))) return chessClickRoute(ctx, m[1], request);
  if (path === "/c/status.svg") return chessStatusImage(ctx, theme, request);
  if (path === "/c/recent.svg") return chessRecentImage(ctx, theme, request);

  if (path === "/play") return htmlResponse(playPage(ctx.profile));
  if (path === "/api/state") return snapshot(ctx);
  if (path === "/" ) return res(null, 302, { Location: "/play", "Cache-Control": NO_STORE });
  if (path === "/favicon.ico") return res(null, 204, { "Cache-Control": NO_STORE });

  return plain("not found", 404);
}

function trimPath(p: string): string {
  if (p.length > 1 && p.endsWith("/")) return p.replace(/\/+$/, "");
  return p;
}

/* ------------------------------------------------------------------ reads */

interface Loaded<T> {
  row: StateRow | null;
  state: T;
  version: number;
}

async function loadTtt(ctx: Ctx): Promise<Loaded<TttState>> {
  const row = await ctx.store.read("ttt");
  if (!row) return { row: null, state: initialTtt(), version: 0 };
  return { row, state: parseTttRow(row.json, row.version), version: row.version };
}

async function loadChess(ctx: Ctx): Promise<Loaded<ChessState>> {
  const row = await ctx.store.read("chess");
  if (!row) return { row: null, state: initialChess(), version: 0 };
  return { row, state: parseChessRow(row.json, row.version), version: row.version };
}

/** Compare-and-swap write; false means another isolate moved first and its state stands. */
async function commit<T extends object>(
  ctx: Ctx,
  kind: string,
  row: StateRow | null,
  state: T,
  version: number,
): Promise<boolean> {
  const json = JSON.stringify({ ...state, version });
  return row ? ctx.store.cas(kind, json, version, row.version) : ctx.store.insert(kind, json, version);
}

/* ------------------------------------------------------------------ tic-tac-toe routes */

async function tttTile(ctx: Ctx, i: number, theme: Theme, request: Request): Promise<Response> {
  const { state, version } = await loadTtt(ctx);
  return svgResponse(tttTileSvg(state, i, theme), `ttt-${version}-${theme}-tile-${i}`, request);
}

async function tttStatusImage(ctx: Ctx, theme: Theme, request: Request): Promise<Response> {
  const { state, version } = await loadTtt(ctx);
  return svgResponse(tttStatusSvg(state, theme), `ttt-${version}-${theme}-status`, request);
}

async function tttClick(ctx: Ctx, i: number, request: Request): Promise<Response> {
  if (!isTile(String(i))) return plain("not found", 404);
  const pre = preflight(ctx);
  if (pre) return pre;

  const { row, state, version } = await loadTtt(ctx);
  const next = applyVisitorMove(state, i, ctx.rnd);
  if (next === state) return profileRedirect(ctx, "ttt", version);

  const limited = await limitResponse(ctx, "move");
  if (limited) return limited;

  const v = version + 1;
  const ok = await commit(ctx, "ttt", row, next, v);
  return profileRedirect(ctx, "ttt", ok ? v : version);
}

async function tttNew(ctx: Ctx, request: Request): Promise<Response> {
  const pre = preflight(ctx);
  if (pre) return pre;

  const { row, state, version } = await loadTtt(ctx);
  const next = tttStartNewGame(state);
  if (!next) return profileRedirect(ctx, "ttt", version);

  const limited = await limitResponse(ctx, "move");
  if (limited) return limited;

  const v = version + 1;
  const ok = await commit(ctx, "ttt", row, next, v);
  return profileRedirect(ctx, "ttt", ok ? v : version);
}

/* ------------------------------------------------------------------ chess routes */

async function chessTile(ctx: Ctx, sq: string, theme: Theme, request: Request): Promise<Response> {
  const { state, version } = await loadChess(ctx);
  return svgResponse(chessTileSvg(state, sq, theme, ctx.now()), `chess-${version}-${theme}-${sq}`, request);
}

async function chessStatusImage(ctx: Ctx, theme: Theme, request: Request): Promise<Response> {
  const { state, version } = await loadChess(ctx);
  return svgResponse(chessStatusSvg(state, theme), `chess-${version}-${theme}-status`, request);
}

async function chessRecentImage(ctx: Ctx, theme: Theme, request: Request): Promise<Response> {
  const { state, version } = await loadChess(ctx);
  return svgResponse(chessRecentSvg(state, theme), `chess-${version}-${theme}-recent`, request);
}

async function chessClickRoute(ctx: Ctx, sq: string, request: Request): Promise<Response> {
  if (!isSquare(sq)) return plain("not found", 404);
  const pre = preflight(ctx);
  if (pre) return pre;

  const { row, state, version } = await loadChess(ctx);
  const hash = await hashIp(ctx.ip, ctx.salt, ctx.now());
  const step = chessClick(state, sq, ctx.now(), hash);
  if (step.action === "ignore" || step.state === state) return profileRedirect(ctx, "chess", version);

  const limited = await limitResponse(ctx, step.action === "move" ? "move" : "select");
  if (limited) return limited;

  const v = version + 1;
  const ok = await commit(ctx, "chess", row, step.state, v);
  return profileRedirect(ctx, "chess", ok ? v : version);
}

/* ------------------------------------------------------------------ JSON API */

async function apiMove(request: Request, ctx: Ctx): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ ok: false, error: "cross-origin move rejected" }, 403);
  }
  if (isBotUa(ctx.ua)) return json({ ok: false, error: "automated clients cannot move" }, 403);

  const raw = await request.text();
  if (raw.length > 512) return json({ ok: false, error: "request body too large" }, 413);

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad body");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "expected a JSON object" }, 400);
  }

  if (body.game === "ttt") return apiTtt(body, ctx);
  if (body.game === "chess") return apiChess(body, ctx);
  return json({ ok: false, error: 'game must be "ttt" or "chess"' }, 400);
}

async function apiTtt(body: Record<string, unknown>, ctx: Ctx): Promise<Response> {
  const { row, state, version } = await loadTtt(ctx);

  if (body.new === true) {
    const next = tttStartNewGame(state);
    if (!next) return json({ ok: false, error: "the current game is still running" }, 409);
    const limited = await limitResponse(ctx, "move");
    if (limited) return limited;
    const v = version + 1;
    if (!(await commit(ctx, "ttt", row, next, v))) return raced();
    return snapshot(ctx);
  }

  const raw = body.cell;
  const cell =
    typeof raw === "number" ? Math.floor(raw) : typeof raw === "string" && /^[0-8]$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    return json({ ok: false, error: "cell must be an integer 0..8" }, 400);
  }
  if (state.over) return json({ ok: false, error: "this game is over — start a new one" }, 409);
  if (state.board[cell] !== null) return json({ ok: false, error: "that tile is already taken" }, 409);

  const limited = await limitResponse(ctx, "move");
  if (limited) return limited;

  const next = applyVisitorMove(state, cell, ctx.rnd);
  if (next === state) return json({ ok: false, error: "that move is not possible" }, 409);

  const v = version + 1;
  if (!(await commit(ctx, "ttt", row, next, v))) return raced();
  return snapshot(ctx);
}

async function apiChess(body: Record<string, unknown>, ctx: Ctx): Promise<Response> {
  const { row, state, version } = await loadChess(ctx);

  if (body.new === true) {
    const next = chessNewGame(state);
    if (!next) return json({ ok: false, error: "the current game is still running" }, 409);
    const limited = await limitResponse(ctx, "move");
    if (limited) return limited;
    const v = version + 1;
    if (!(await commit(ctx, "chess", row, next, v))) return raced();
    return snapshot(ctx);
  }

  const { from, to } = body;
  if (!isSquare(from) || !isSquare(to)) {
    return json({ ok: false, error: "from and to must be squares like e2 and e4" }, 400);
  }
  if (from === to) return json({ ok: false, error: "pick a different destination square" }, 400);

  const hash = await hashIp(ctx.ip, ctx.salt, ctx.now());
  if (state.lastIpHash && state.lastIpHash === hash) {
    return json({ ok: false, error: "one move per person in a row — wait for another player" }, 409);
  }

  const limited = await limitResponse(ctx, "move");
  if (limited) return limited;

  const step = chessMoveFromTo(state, from, to, ctx.now(), hash);
  if (step.action !== "move") {
    const turn = newChess(state.fen).turn() === "w" ? "white" : "black";
    return json({ ok: false, error: `illegal move — ${turn} to move` }, 409);
  }

  const v = version + 1;
  if (!(await commit(ctx, "chess", row, step.state, v))) return raced();
  return snapshot(ctx);
}

function raced(): Response {
  return json({ ok: false, error: "someone else moved first — board refreshed" }, 409);
}

async function snapshot(ctx: Ctx): Promise<Response> {
  const rows = await ctx.store.readMany(["ttt", "chess"]);
  const tttRow = rows.get("ttt");
  const chessRow = rows.get("chess");
  const ttt = tttRow ? parseTttRow(tttRow.json, tttRow.version) : initialTtt();
  const chess = chessRow ? parseChessRow(chessRow.json, chessRow.version) : initialChess();

  return json({
    ok: true,
    ttt: {
      board: ttt.board,
      over: ttt.over,
      result: ttt.result,
      line: ttt.line,
      game: ttt.game,
      record: ttt.record,
    },
    chess: chessPublic(chess, ctx.now()),
    serverTime: ctx.now(),
  });
}

/* ------------------------------------------------------------------ guards and responses */

function preflight(ctx: Ctx): Response | null {
  if (isBotUa(ctx.ua)) return plain("forbidden — automated fetch blocked", 403);
  if (!secFetchAllows(ctx.dest, ctx.mode)) {
    return plain("forbidden — open this link, do not embed it", 403);
  }
  return null;
}

async function limitResponse(ctx: Ctx, kind: "move" | "select"): Promise<Response | null> {
  const hash = await hashIp(ctx.ip, ctx.salt, ctx.now());
  const limiter = kind === "move" ? moveLimiter : selectLimiter;
  if (limiter.allow(`${kind}:${hash}`, ctx.now())) return null;
  return plain("slow down — one move every 5 seconds", 429, { "Retry-After": "5" });
}

function svgResponse(svg: string, tag: string, request: Request): Response {
  const etag = `"${tag}"`;
  const headers: Record<string, string> = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "no-cache, max-age=0, must-revalidate",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
  };
  const inm = request.headers.get("if-none-match");
  if (inm && inm.split(",").some((part) => part.trim() === etag)) {
    return res(null, 304, headers);
  }
  return res(svg, 200, headers);
}

function profileRedirect(ctx: Ctx, kind: string, version: number): Response {
  // The changing query string keeps proxies and bfcache from replaying a stale profile page.
  const target = `${ctx.profile}?arena=${kind}&v=${version}`;
  return res(null, 302, { Location: target, "Cache-Control": NO_STORE });
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      // blob: is required: chess.js is fetched with an SRI hash and imported from a blob URL,
      // because an integrity check cannot be attached to a bare module import.
      "Content-Security-Policy":
        "default-src 'none'; script-src 'unsafe-inline' blob: https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": NO_STORE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function plain(body: string, status: number, extra: Record<string, string> = {}): Response {
  return res(`${body}\n`, status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": NO_STORE,
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
}

function res(body: BodyInit | null, status: number, headers: Record<string, string>): Response {
  return new Response(body, { status, headers });
}
