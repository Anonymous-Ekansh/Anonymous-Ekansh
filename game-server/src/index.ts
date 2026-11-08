/**
 * ARENA — a Cloudflare Worker that turns two shared boards into README images.
 *
 * Every tile is rendered from the stored game state on demand, so a profile README only
 * needs <img> tags. Moves are ordinary links, which means they need the abuse control in
 * ./security.ts (fetch metadata, user-agent screen, a visitor cookie, a coarse hashed-IP
 * cap) and the compare-and-swap writes in ./store.ts.
 */

import {
  chessClick,
  chessMoveFromTo,
  chessNewGame,
  chessPublic,
  initialChess,
  newChess,
  parseChessRow,
  sameMover,
  type ChessState,
  type Mover,
} from "./chesslogic";
import { playPage } from "./play";
import {
  clientIp,
  CountLimiter,
  hashIp,
  hashVisitor,
  isBotUa,
  newVid,
  PROFILE_DEFAULT,
  RateLimiter,
  readVid,
  secFetchAllows,
  vidSetCookie,
} from "./security";
import { D1Store, MemoryStore, type StateRow, type StoreLike } from "./store";
import {
  BANNER_HEIGHT,
  CHESS_BANNER_WIDTH,
  CHESS_BUTTON_WIDTH,
  CHESS_TILE_SIZE,
  chessRecentSvg,
  chessStatusSvg,
  chessTileSvg,
  buttonSvg,
  FOOTER_HEIGHT,
  FOOTER_WIDTH,
  footerSvg,
  HEADER_HEIGHT,
  headerSvg,
  parseTheme,
  placeholderSvg,
  TTT_BANNER_WIDTH,
  TTT_BUTTON_WIDTH,
  TTT_TILE_SIZE,
  tttStatusSvg,
  tttTileSvg,
  type Theme,
} from "./svg";
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

/** Debug headers for a move response. Values only: never a hash, a cookie or an address. */
interface Trace {
  identity: "cookie" | "minted";
  reason: string | null;
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
  trace: Trace;
}

/** Per-visitor cooldown: one move every 5 s, selection clicks get a lighter 1 s gate. */
const moveLimiter = new RateLimiter(5_000);
const selectLimiter = new RateLimiter(1_000);
/**
 * Coarse bot cap: 120 moves per hour per hashed IP. It has to stay loose, because a classroom or
 * an office shares one address; the per-visitor cooldown does the fine-grained work.
 */
const ipMoveCap = new CountLimiter(60 * 60 * 1000, 120);

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
    trace: { identity: readVid(request) ? "cookie" : "minted", reason: null },
  };

  if (request.method === "POST") {
    if (path === "/api/move") return traced(ctx, await apiMove(request, ctx));
    return plain("method not allowed", 405, { Allow: "GET, POST" });
  }
  if (request.method !== "GET") return plain("method not allowed", 405, { Allow: "GET, POST" });

  let m: RegExpExecArray | null;

  if ((m = /^\/t\/tile\/([0-8])\.svg$/.exec(path))) return tttTile(ctx, Number(m[1]), theme, request);
  if ((m = /^\/t\/click\/([0-8])$/.exec(path))) return traced(ctx, await tttClick(ctx, Number(m[1]), request));
  if (path === "/t/new") return traced(ctx, await tttNew(ctx, request));
  if (path === "/t/status.svg") return tttStatusImage(ctx, theme, request);

  if ((m = /^\/c\/tile\/([a-h][1-8])\.svg$/.exec(path))) return chessTile(ctx, m[1], theme, request);
  if ((m = /^\/c\/click\/([a-h][1-8])$/.exec(path))) return traced(ctx, await chessClickRoute(ctx, m[1], request));
  if (path === "/c/status.svg") return chessStatusImage(ctx, theme, request);
  if (path === "/c/recent.svg") return chessRecentImage(ctx, theme, request);

  // Static chrome: the README's headers, buttons and credit line. They carry no game state, so
  // they exist only because GitHub strips CSS and a themed strip has to be an image.
  if (path === "/c/header.svg") return chrome(() => headerSvg("chess", theme), "chess-header", CHESS_BANNER_WIDTH, HEADER_HEIGHT, theme, request);
  if (path === "/t/header.svg") return chrome(() => headerSvg("ttt", theme), "ttt-header", TTT_BANNER_WIDTH, HEADER_HEIGHT, theme, request);
  if (path === "/c/button.svg") return chrome(() => buttonSvg("chess", theme), "chess-button", CHESS_BUTTON_WIDTH, BANNER_HEIGHT, theme, request);
  if (path === "/t/button.svg") return chrome(() => buttonSvg("ttt", theme), "ttt-button", TTT_BUTTON_WIDTH, BANNER_HEIGHT, theme, request);
  if (path === "/footer.svg") return chrome(() => footerSvg(theme), "footer", FOOTER_WIDTH, FOOTER_HEIGHT, theme, request);

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

/* ------------------------------------------------------------------ visitor identity */

interface Visitor {
  /** The cookie value to set on this response, or null when the request already had one. */
  vid: string | null;
  /** Hash of the visitor cookie: the only identity, and the cooldown key. */
  visitor: string;
  /** Hash of the client IP: the coarse hourly cap key, and nothing else. */
  ip: string;
  /** True when this request minted the cookie. */
  minted: boolean;
  /** What the chess turn rule compares against. */
  mover: Mover;
}

/**
 * One identity per move request, always the cookie.
 *
 * A request without a cookie mints a `vid`, and that freshly minted value is this visitor for
 * *this* request too: the first click of a visit is already attributable to them, so their next
 * click can be refused as a second move in a row. The address is only a coarse bot cap; it never
 * decides whose turn it is and no two visitors ever share a cooldown. Only salted hashes of the
 * cookie and the address are used, and neither raw value is stored or logged.
 */
async function identify(ctx: Ctx, request: Request): Promise<Visitor> {
  const existing = readVid(request);
  const vid = existing ?? newVid();
  const minted = existing === null;
  ctx.trace.identity = minted ? "minted" : "cookie";
  const visitor = await hashVisitor(vid, ctx.salt);
  const ip = await hashIp(ctx.ip, ctx.salt, ctx.now());
  return { vid: minted ? vid : null, visitor, ip, minted, mover: { visitor } };
}

/** Attaches the new cookie, if this request is the one that minted it. */
function withVid(response: Response, who: Visitor): Response {
  if (!who.vid) return response;
  const stamped = new Response(response.body, response);
  stamped.headers.append("Set-Cookie", vidSetCookie(who.vid));
  return stamped;
}

/** Adds X-Arena-Identity and, when there is something to say, X-Arena-Reason. */
function traced(ctx: Ctx, response: Response): Response {
  const stamped = new Response(response.body, response);
  stamped.headers.set("X-Arena-Identity", ctx.trace.identity);
  if (ctx.trace.reason) stamped.headers.set("X-Arena-Reason", ctx.trace.reason);
  return stamped;
}

/** Redirect back to the profile, carrying the visitor cookie when it was just minted. */
function moveDone(ctx: Ctx, who: Visitor, kind: string, version: number): Response {
  return withVid(profileRedirect(ctx, kind, version), who);
}

/* ------------------------------------------------------------------ tic-tac-toe routes */

async function tttTile(ctx: Ctx, i: number, theme: Theme, request: Request): Promise<Response> {
  const { state, version } = await loadTtt(ctx);
  return safeSvg(() => tttTileSvg(state, i, theme), {
    tag: `ttt-${version}-${theme}-tile-${i}`,
    width: TTT_TILE_SIZE,
    height: TTT_TILE_SIZE,
    theme,
    request,
  });
}

async function tttStatusImage(ctx: Ctx, theme: Theme, request: Request): Promise<Response> {
  const { state, version } = await loadTtt(ctx);
  return safeSvg(() => tttStatusSvg(state, theme), {
    tag: `ttt-${version}-${theme}-status`,
    width: TTT_BANNER_WIDTH,
    height: BANNER_HEIGHT,
    theme,
    request,
  });
}

async function tttClick(ctx: Ctx, i: number, request: Request): Promise<Response> {
  if (!isTile(String(i))) return plain("not found", 404);
  const pre = preflight(ctx);
  if (pre) return pre;

  const who = await identify(ctx, request);
  const { row, state, version } = await loadTtt(ctx);
  const next = applyVisitorMove(state, i, ctx.rnd);
  if (next === state) return moveDone(ctx, who, "ttt", version);

  const limited = await limitResponse(ctx, "move", who);
  if (limited) return limited;

  const v = version + 1;
  const ok = await commit(ctx, "ttt", row, next, v);
  ctx.trace.reason = "moved";
  return moveDone(ctx, who, "ttt", ok ? v : version);
}

async function tttNew(ctx: Ctx, request: Request): Promise<Response> {
  const pre = preflight(ctx);
  if (pre) return pre;

  const who = await identify(ctx, request);
  const { row, state, version } = await loadTtt(ctx);
  const next = tttStartNewGame(state);
  if (!next) return moveDone(ctx, who, "ttt", version);

  const limited = await limitResponse(ctx, "move", who);
  if (limited) return limited;

  const v = version + 1;
  const ok = await commit(ctx, "ttt", row, next, v);
  ctx.trace.reason = "moved";
  return moveDone(ctx, who, "ttt", ok ? v : version);
}

/* ------------------------------------------------------------------ chess routes */

async function chessTile(ctx: Ctx, sq: string, theme: Theme, request: Request): Promise<Response> {
  const { state, version } = await loadChess(ctx);
  return safeSvg(() => chessTileSvg(state, sq, theme, ctx.now()), {
    tag: `chess-${version}-${theme}-${sq}`,
    width: CHESS_TILE_SIZE,
    height: CHESS_TILE_SIZE,
    theme,
    request,
  });
}

async function chessStatusImage(ctx: Ctx, theme: Theme, request: Request): Promise<Response> {
  const { state, version } = await loadChess(ctx);
  return safeSvg(() => chessStatusSvg(state, theme), {
    tag: `chess-${version}-${theme}-status`,
    width: CHESS_BANNER_WIDTH,
    height: BANNER_HEIGHT,
    theme,
    request,
  });
}

async function chessRecentImage(ctx: Ctx, theme: Theme, request: Request): Promise<Response> {
  const { state, version } = await loadChess(ctx);
  return safeSvg(() => chessRecentSvg(state, theme), {
    tag: `chess-${version}-${theme}-recent`,
    width: CHESS_BANNER_WIDTH,
    height: BANNER_HEIGHT,
    theme,
    request,
  });
}

async function chessClickRoute(ctx: Ctx, sq: string, request: Request): Promise<Response> {
  if (!isSquare(sq)) return plain("not found", 404);
  const pre = preflight(ctx);
  if (pre) return pre;

  const who = await identify(ctx, request);
  const { row, state, version } = await loadChess(ctx);
  const step = chessClick(state, sq, ctx.now(), who.mover);
  if (step.reason === "same-visitor") ctx.trace.reason = "same-visitor";
  if (step.action === "ignore") {
    // A refused move still clears the stored selection so the next visitor starts clean; it
    // is not a move and does not spend the cooldown.
    if (step.state === state) return moveDone(ctx, who, "chess", version);
    const cleared = version + 1;
    const committed = await commit(ctx, "chess", row, step.state, cleared);
    return moveDone(ctx, who, "chess", committed ? cleared : version);
  }

  const limited = await limitResponse(ctx, step.action === "move" ? "move" : "select", who);
  if (limited) return limited;

  const v = version + 1;
  const ok = await commit(ctx, "chess", row, step.state, v);
  if (step.action === "move" || step.action === "reset") ctx.trace.reason = "moved";
  return moveDone(ctx, who, "chess", ok ? v : version);
}

/* ------------------------------------------------------------------ JSON API */

async function apiMove(request: Request, ctx: Ctx): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ ok: false, error: "cross-origin move rejected" }, 403);
  }
  if (isBotUa(ctx.ua)) {
    ctx.trace.reason = "bot";
    return json({ ok: false, error: "automated clients cannot move" }, 403);
  }

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

  const who = await identify(ctx, request);
  if (body.game === "ttt") return apiTtt(body, ctx, who);
  if (body.game === "chess") return apiChess(body, ctx, who);
  return json({ ok: false, error: 'game must be "ttt" or "chess"' }, 400);
}

async function apiTtt(body: Record<string, unknown>, ctx: Ctx, who: Visitor): Promise<Response> {
  const { row, state, version } = await loadTtt(ctx);

  if (body.new === true) {
    const next = tttStartNewGame(state);
    if (!next) return json({ ok: false, error: "the current game is still running" }, 409);
    const limited = await limitResponse(ctx, "move", who);
    if (limited) return limited;
    const v = version + 1;
    if (!(await commit(ctx, "ttt", row, next, v))) return raced();
    ctx.trace.reason = "moved";
    return withVid(await snapshot(ctx), who);
  }

  const raw = body.cell;
  const cell =
    typeof raw === "number" ? Math.floor(raw) : typeof raw === "string" && /^[0-8]$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    return json({ ok: false, error: "cell must be an integer 0..8" }, 400);
  }
  if (state.over) return json({ ok: false, error: "this game is over — start a new one" }, 409);
  if (state.board[cell] !== null) return json({ ok: false, error: "that tile is already taken" }, 409);

  const limited = await limitResponse(ctx, "move", who);
  if (limited) return limited;

  const next = applyVisitorMove(state, cell, ctx.rnd);
  if (next === state) return json({ ok: false, error: "that move is not possible" }, 409);

  const v = version + 1;
  if (!(await commit(ctx, "ttt", row, next, v))) return raced();
  ctx.trace.reason = "moved";
  return withVid(await snapshot(ctx), who);
}

async function apiChess(body: Record<string, unknown>, ctx: Ctx, who: Visitor): Promise<Response> {
  const { row, state, version } = await loadChess(ctx);

  if (body.new === true) {
    const next = chessNewGame(state);
    if (!next) return json({ ok: false, error: "the current game is still running" }, 409);
    const limited = await limitResponse(ctx, "move", who);
    if (limited) return limited;
    const v = version + 1;
    if (!(await commit(ctx, "chess", row, next, v))) return raced();
    ctx.trace.reason = "moved";
    return withVid(await snapshot(ctx), who);
  }

  const { from, to } = body;
  if (!isSquare(from) || !isSquare(to)) {
    return json({ ok: false, error: "from and to must be squares like e2 and e4" }, 400);
  }
  if (from === to) return json({ ok: false, error: "pick a different destination square" }, 400);

  if (sameMover(state, who.mover)) {
    ctx.trace.reason = "same-visitor";
    return json({ ok: false, error: "one move per person in a row — wait for another player" }, 409);
  }

  const limited = await limitResponse(ctx, "move", who);
  if (limited) return limited;

  const step = chessMoveFromTo(state, from, to, ctx.now(), who.mover);
  if (step.action !== "move") {
    const turn = newChess(state.fen).turn() === "w" ? "white" : "black";
    return json({ ok: false, error: `illegal move — ${turn} to move` }, 409);
  }

  const v = version + 1;
  if (!(await commit(ctx, "chess", row, step.state, v))) return raced();
  ctx.trace.reason = "moved";
  return withVid(await snapshot(ctx), who);
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
  if (isBotUa(ctx.ua) || !secFetchAllows(ctx.dest, ctx.mode)) {
    ctx.trace.reason = "bot";
    return plain("forbidden — automated fetch or embed blocked", 403);
  }
  return null;
}

async function limitResponse(ctx: Ctx, kind: "move" | "select", who: Visitor): Promise<Response | null> {
  // The cooldown is per visitor, always: two people on one Wi-Fi never share a clock.
  const limiter = kind === "move" ? moveLimiter : selectLimiter;
  if (!limiter.allow(`${kind}:${who.visitor}`, ctx.now())) {
    ctx.trace.reason = "cooldown";
    // A throttled first-time visitor still gets their cookie: the retry is theirs.
    return withVid(plain("slow down — one move every 5 seconds", 429, { "Retry-After": "5" }), who);
  }
  // Selections are free; only real moves spend the coarse hourly IP allowance.
  if (kind === "move" && !ipMoveCap.allow(who.ip, ctx.now())) {
    ctx.trace.reason = "ip-cap";
    return withVid(plain("too many moves from this network — try again later", 429, { "Retry-After": "60" }), who);
  }
  return null;
}

/**
 * FNV-1a over the rendered document.
 *
 * The ETag used to be the state tag alone ("chess-3-light-a8"), so a rendering change produced
 * identical validators while the bytes differed. GitHub's image proxy revalidated, got its 304
 * and kept serving the old broken image for that URL. Hashing the body makes every change a new
 * validator, so a stale copy can never survive a deploy.
 */
function bodyHash(svg: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < svg.length; i += 1) {
    h ^= svg.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Renders behind a try/catch: a failure is a quiet placeholder, never a broken image. */
function safeSvg(
  render: () => string,
  opts: { tag: string; width: number; height: number; theme: Theme; request: Request },
): Response {
  let svg: string;
  try {
    svg = render();
  } catch (err) {
    console.error(`[arena] svg ${opts.tag} failed: ${String(err)}`);
    return new Response(placeholderSvg(opts.width, opts.height, opts.theme), {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return svgResponse(svg, opts.tag, opts.request);
}

/** Chrome renders are pure functions of (kind, theme): safeSvg with a fixed tag. */
function chrome(
  render: () => string,
  tag: string,
  width: number,
  height: number,
  theme: Theme,
  request: Request,
): Response {
  return safeSvg(render, { tag, width, height, theme, request });
}

function svgResponse(svg: string, tag: string, request: Request): Response {
  const etag = `"${tag}-${bodyHash(svg)}"`;
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
