import { describe, expect, it } from "vitest";

import { hashIp, isBotUa, RateLimiter, secFetchAllows } from "../src/security";

describe("rate limiter", () => {
  it("allows one action per window and then blocks", () => {
    const limiter = new RateLimiter(5_000);
    expect(limiter.allow("ip-a", 1_000)).toBe(true);
    expect(limiter.allow("ip-a", 1_001)).toBe(false);
    expect(limiter.allow("ip-a", 5_999)).toBe(false);
    expect(limiter.allow("ip-a", 6_000)).toBe(true);
  });

  it("counts each key separately", () => {
    const limiter = new RateLimiter(5_000);
    expect(limiter.allow("ip-a", 0)).toBe(true);
    expect(limiter.allow("ip-b", 1)).toBe(true);
    expect(limiter.allow("ip-a", 2)).toBe(false);
    expect(limiter.allow("select:ip-a", 2)).toBe(true);
  });

  it("keeps its map bounded", () => {
    const limiter = new RateLimiter(1_000, 100);
    for (let i = 0; i < 400; i += 1) limiter.allow(`ip-${i}`, i * 1_000);
    expect(limiter.size()).toBeLessThanOrEqual(100);
  });
});

describe("hashed IPs", () => {
  it("is stable inside a day and rotates across days", async () => {
    const a = await hashIp("203.0.113.7", "salt", Date.UTC(2026, 0, 1, 10));
    const b = await hashIp("203.0.113.7", "salt", Date.UTC(2026, 0, 1, 22));
    const c = await hashIp("203.0.113.7", "salt", Date.UTC(2026, 0, 2, 1));

    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{20}$/);
  });

  it("never returns the raw address", async () => {
    const hash = await hashIp("198.51.100.42", "salt", Date.UTC(2026, 0, 1));
    expect(hash).not.toContain("198.51.100.42");
  });

  it("changes with the salt", async () => {
    const at = Date.UTC(2026, 0, 1);
    expect(await hashIp("198.51.100.42", "one", at)).not.toBe(await hashIp("198.51.100.42", "two", at));
  });
});

describe("fetch metadata gate", () => {
  it("accepts a real navigation", () => {
    expect(secFetchAllows("document", "navigate")).toBe(true);
  });

  it("rejects image and script embeds", () => {
    expect(secFetchAllows("image", "no-cors")).toBe(false);
    expect(secFetchAllows("script", "cors")).toBe(false);
    expect(secFetchAllows("empty", "cors")).toBe(false);
    expect(secFetchAllows("document", "no-cors")).toBe(false);
  });

  it("allows missing headers, which are then rate limited", () => {
    expect(secFetchAllows(null, null)).toBe(true);
    expect(secFetchAllows("", "")).toBe(true);
  });
});

describe("user agent screen", () => {
  it("blocks prefetchers, crawlers and HTTP clients", () => {
    for (const ua of [
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "Slackbot-LinkExpanding 1.0",
      "facebookexternalhit/1.1",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "Mozilla/5.0 HeadlessChrome/126.0",
      "Mozilla/5.0 (compatible; GPTBot/1.0)",
      "",
    ]) {
      expect(isBotUa(ua)).toBe(true);
    }
  });

  it("allows a normal browser", () => {
    expect(
      isBotUa(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      ),
    ).toBe(false);
    expect(
      isBotUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"),
    ).toBe(false);
  });
});
