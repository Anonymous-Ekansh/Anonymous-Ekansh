/**
 * Abuse control for GET-based moves.
 *
 * A move is a plain link, so anything that fetches images or unfurls URLs could otherwise
 * advance a shared board. Three cheap gates, in order:
 *
 *  1. User-Agent screen (prefetchers, crawlers, unfurlers, HTTP clients).
 *  2. Fetch metadata: a real click sends Sec-Fetch-Dest: document + Sec-Fetch-Mode: navigate.
 *     Embeds (<img>, fetch, script) send image/no-cors/empty. Missing headers are allowed but
 *     still rate limited, because some privacy browsers strip them.
 *  3. Hashed-IP rate limit: 5 s between moves, 1 s between selection clicks, per hashed IP.
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
 * Salted, daily-rotating hash of the visitor IP. The raw IP is never stored or logged; the
 * hash is only used for the rate limiter and the "two chess moves in a row" rule.
 */
export async function hashIp(ip: string, salt: string, now: number): Promise<string> {
  const day = new Date(now).toISOString().slice(0, 10);
  const material = `${salt}|${day}|${ip.slice(0, 64)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  const bytes = new Uint8Array(digest).slice(0, 10);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** CF-Connecting-IP is authoritative on Workers; the fallback is for local dev only. */
export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf && cf.trim()) return cf.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "127.0.0.1";
}
