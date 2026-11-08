/**
 * Abuse control for GET-based moves.
 *
 * A move is a plain link, so anything that fetches images or unfurls URLs could otherwise
 * advance a shared board. Four cheap gates, in order:
 *
 *  1. User-Agent screen (prefetchers, crawlers, unfurlers, HTTP clients).
 *  2. Fetch metadata: a real click sends Sec-Fetch-Dest: document + Sec-Fetch-Mode: navigate.
 *     Embeds (<img>, fetch, script) send image/no-cors/empty. Missing headers are allowed but
 *     still rate limited, because some privacy browsers strip them.
 *  3. Visitor cookie `vid`: 128 random bits, set on the first move click. The cooldown and the
 *     chess turn rule hang off its salted hash, so one person on a shared network is one
 *     visitor without punishing everybody else behind the same address.
 *  4. Hashed-IP cap: 30 moves per hour per hashed IP, whatever the cookie says. That is the
 *     only IP-based limit, so ordinary play behind NAT stays unaffected.
 *
 * If the cookie is missing (cookies disabled) the hashed IP is used for the limits instead.
 * Neither the raw address nor the cookie value is ever stored: only SHA-256 prefixes are.
 */

const BOT_UA =
  /(bot\b|bot\/|crawl|spider|scrap|slurp|preview|unfurl|embed|facebookexternalhit|slackbot|discordbot|telegrambot|whatsapp|skypeuripreview|linkedinbot|twitterbot|redditbot|pinterest|vkshare|w3c_validator|feedfetcher|google-inspectiontool|headlesschrome|phantomjs|selenium|puppeteer|playwright|lighthouse|pagespeed|pingdom|uptimerobot|statuscake|datadog|newrelic|monitor|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|go-http-client|java\/|okhttp|axios\/|node-fetch|undici|scrapy|httpclient|libwww|postmanruntime|insomnia|httpie|ahrefs|semrush|mj12bot|dotbot|bytespider|gptbot|claudebot|anthropic|perplexity|ccbot|amazonbot|applebot|bingpreview|yandex|baiduspider)/i;

export const PROFILE_DEFAULT = "https://github.com/Anonymous-Ekansh";

export function isBotUa(ua: string | null): boolean {
  if (!ua || ua.trim().length === 0) return true;
  if (ua.trim().length < 12) return true;
  return BOT_UA.test(ua);
}

/**
 * True when the request looks like a person following a link.
 * A present-but-wrong value is a hard no; an absent value is allowed (and rate limited).
 */
export function secFetchAllows(dest: string | null, mode: string | null): boolean {
  const d = (dest ?? "").trim().toLowerCase();
  const m = (mode ?? "").trim().toLowerCase();
  if (d && d !== "document") return false;
  if (m && m !== "navigate") return false;
  return true;
}

/** Fixed-window (per-key timestamp) limiter. Memory-only: one isolate, no extra D1 reads. */
export class RateLimiter {
  private last = new Map<string, number>();
  private swept = 0;

  constructor(private windowMs: number, private maxKeys = 5000) {}

  allow(key: string, now: number): boolean {
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < this.windowMs) return false;
    this.last.set(key, now);
    this.sweep(now);
    return true;
  }

  /** Test/debug helper. */
  clear(): void {
    this.last.clear();
    this.swept = 0;
  }

  size(): number {
    return this.last.size;
  }

  private sweep(now: number): void {
    if (now - this.swept < 60_000) return;
    this.swept = now;
    if (this.last.size < this.maxKeys) return;
    for (const [key, at] of this.last) {
      if (now - at > this.windowMs * 4) this.last.delete(key);
    }
    // Still oversized: drop the oldest entries rather than growing without bound.
    if (this.last.size >= this.maxKeys) {
      const keep = [...this.last.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.floor(this.maxKeys / 2));
      this.last = new Map(keep);
    }
  }
}

/**
 * Counts actions per key inside a sliding window and allows at most `max` of them.
 * Used for the coarse "30 moves per hour per IP" cap, which is not a cooldown: the same key
 * may spend its allowance in one burst and then has to wait for the window to slide.
 */
export class CountLimiter {
  private hits = new Map<string, number[]>();
  private swept = 0;

  constructor(private windowMs: number, private max: number, private maxKeys = 5000) {}

  /** Records the action when there is room left in the window; false means over the cap. */
  allow(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    this.sweep(now);
    return true;
  }

  /** Actions still recorded for this key inside the window. */
  count(key: string, now: number): number {
    return (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs).length;
  }

  /** Test/debug helper. */
  clear(): void {
    this.hits.clear();
    this.swept = 0;
  }

  size(): number {
    return this.hits.size;
  }

  private sweep(now: number): void {
    if (now - this.swept < 60_000) return;
    this.swept = now;
    if (this.hits.size < this.maxKeys) return;
    for (const [key, list] of this.hits) {
      const last = list[list.length - 1] ?? 0;
      if (now - last > this.windowMs) this.hits.delete(key);
    }
    if (this.hits.size >= this.maxKeys) {
      const keep = [...this.hits.entries()].sort((a, b) => (b[1][b[1].length - 1] ?? 0) - (a[1][a[1].length - 1] ?? 0)).slice(0, Math.floor(this.maxKeys / 2));
      this.hits = new Map(keep);
    }
  }
}

/* ------------------------------------------------------------------ hashed identity */

/** First 80 bits of SHA-256, hex encoded. Every stored identity is one of these. */
async function shortHash(material: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  const bytes = new Uint8Array(digest).slice(0, 10);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Salted, daily-rotating hash of the visitor IP. The raw IP is never stored or logged; the
 * hash keys the coarse hourly move cap and stands in for the cookie when cookies are off.
 */
export async function hashIp(ip: string, salt: string, now: number): Promise<string> {
  const day = new Date(now).toISOString().slice(0, 10);
  return shortHash(`${salt}|${day}|${ip.slice(0, 64)}`);
}

/**
 * Salted hash of the visitor cookie. Not rotated by day: a visitor keeps one identity so the
 * cooldown and the chess turn rule hold across midnight.
 */
export async function hashVisitor(vid: string, salt: string): Promise<string> {
  return shortHash(`${salt}|vid|${vid}`);
}

/* ------------------------------------------------------------------ visitor cookie */

export const VID_COOKIE = "vid";

/** 128 bits of randomness, lower-case hex. */
export const VID_PATTERN = /^[0-9a-f]{32}$/;

/** 30 days. */
export const VID_MAX_AGE = 60 * 60 * 24 * 30;

/** The visitor id from the request cookie, or null when absent or malformed. */
export function readVid(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== VID_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return VID_PATTERN.test(value) ? value : null;
  }
  return null;
}

/** A fresh 128-bit visitor id. */
export function newVid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Set-Cookie value for the visitor id: HttpOnly, Secure, SameSite=Lax, 30 days, Worker domain. */
export function vidSetCookie(vid: string): string {
  return `${VID_COOKIE}=${vid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${VID_MAX_AGE}`;
}

/** CF-Connecting-IP is authoritative on Workers; the fallback is for local dev only. */
export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf && cf.trim()) return cf.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "127.0.0.1";
}
