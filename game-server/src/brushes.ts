/**
 * Hand-drawn brush marks for tic-tac-toe.
 *
 * Original geometry, drawn from scratch in the style of a loaded brush: filled shapes with
 * tapered ends, wobbling outlines and a slight lean. Nothing here is traced from anyone's
 * bitmap, and no Unicode glyph is used.
 *
 * Three variants per mark are picked by tile index, so a board of five Xs is never five
 * identical stamps.
 */

type Pt = [number, number];

/** Deterministic pseudo-random in [0, 1): same seed, same wobble, every request. */
function noise(seed: number): number {
  const h = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}

const r = (v: number): number => Math.round(v * 100) / 100;

/** Smooth open curve through the points (Catmull-Rom, converted to cubic segments). */
function curve(points: Pt[]): string {
  if (points.length < 2) return "";
  const parts = [`M${r(points[0][0])} ${r(points[0][1])}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    parts.push(`C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(p2[0])} ${r(p2[1])}`);
  }
  return parts.join(" ");
}

/** Same, but closed and wrapping, for the ring. */
function ring(points: Pt[]): string {
  const n = points.length;
  const parts = [`M${r(points[0][0])} ${r(points[0][1])}`];
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i % n];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    parts.push(`C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(p2[0])} ${r(p2[1])}`);
  }
  return `${parts.join(" ")} Z`;
}

/**
 * One brush stroke as a filled shape: a centre line with a variable half-width on each
 * side, roughened so the edges are not mathematically clean.
 */
function stroke(
  from: Pt,
  to: Pt,
  thin: number,
  thick: number,
  bend: number,
  rough: number,
  seed: number,
): string {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const steps = 7;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    // thin at the ends, heavy through the middle: a loaded brush landing and lifting
    const width = thin + (thick - thin) * Math.sin(Math.PI * Math.pow(t, 0.86));
    const bow = Math.sin(Math.PI * t) * bend;
    const jitter = (noise(seed + i * 3.7) - 0.5) * rough;
    const cx = from[0] + dx * t + nx * (bow + jitter);
    const cy = from[1] + dy * t + ny * (bow + jitter);
    const wobble = (noise(seed + 40 + i * 2.3) - 0.5) * rough * 0.8;
    left.push([cx + nx * (width / 2 + wobble), cy + ny * (width / 2 + wobble)]);
    right.push([cx - nx * (width / 2 - wobble), cy - ny * (width / 2 - wobble)]);
  }

  const back = right.slice().reverse();
  return `${curve(left)} L${r(back[0][0])} ${r(back[0][1])} ${curve(back).replace(/^M[\d.\- ]+/, "")} Z`;
}

const X_STROKES: Array<{ a: Pt; b: Pt; c: Pt; d: Pt; bend: number; thick: number }> = [
  { a: [13.5, 15.5], b: [62, 60.5], c: [62.5, 15], d: [13, 60], bend: 2.6, thick: 8.2 },
  { a: [12.5, 18.5], b: [61.5, 62], c: [61, 13.5], d: [15.5, 61.5], bend: -3.4, thick: 7.4 },
  { a: [16, 12.5], b: [60, 62.5], c: [62.5, 18], d: [13.5, 57], bend: 4.1, thick: 8.8 },
];

/** Two crossing brush strokes, filled, 54 px across a 76 px tile. */
export function brushX(variant: number, ink: string): string {
  const v = X_STROKES[((variant % 3) + 3) % 3];
  const s1 = stroke(v.a, v.b, 1.7, v.thick, v.bend, 1.5, 11 + variant * 7);
  const s2 = stroke(v.c, v.d, 1.5, v.thick * 0.92, -v.bend * 0.8, 1.6, 57 + variant * 5);
  return `<path d="${s1}" fill="${ink}"/><path d="${s2}" fill="${ink}"/>`;
}

/**
 * A heavy, uneven ring: one filled path with an irregular outer edge and an irregular inner
 * edge, combined with fill-rule evenodd so the thickness breathes around the circle.
 */
export function brushO(variant: number, ink: string): string {
  const cx = 38;
  const cy = 38.2;
  const steps = 15;
  const outer: Pt[] = [];
  const inner: Pt[] = [];

  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const lean = 0.06 * Math.sin(angle * 2 + variant);
    const wobble = (noise(i * 5.3 + variant * 13.1) - 0.5) * 2.4;
    // thicker on one side, like a wrist that presses harder at the top of the loop
    const weight = 3.1 + 2.1 * (0.5 + 0.5 * Math.sin(angle + variant * 0.9)) + (noise(i + 21) - 0.5) * 1.1;
    const radius = 21.4 + wobble;
    const ox = radius + weight * 1.25;
    const ix = radius - weight * 0.85;
    outer.push([cx + Math.cos(angle + lean) * ox, cy + Math.sin(angle + lean) * ox]);
    inner.push([cx + Math.cos(angle + lean) * ix, cy + Math.sin(angle + lean) * ix]);
  }

  return `<path d="${ring(outer)} ${ring(inner)}" fill="${ink}" fill-rule="evenodd"/>`;
}

/** The mark for one tile: deterministic per index, so the board reads as one hand. */
export function brushMark(mark: "X" | "O", index: number, ink: string): string {
  const variant = index % 3;
  return mark === "X" ? brushX(variant, ink) : brushO(variant, ink);
}

const MARK_INK = { light: "#111111", dark: "#F2F2F2" } as const;

/**
 * Complete, self-contained SVGs for the interactive /play board, three variants per mark
 * and both themes, so the full-screen page uses the same hand as the README.
 */
export function markSet(): Record<"light" | "dark", { X: string[]; O: string[] }> {
  const out: Record<"light" | "dark", { X: string[]; O: string[] }> = { light: { X: [], O: [] }, dark: { X: [], O: [] } };
  for (const theme of ["light", "dark"] as const) {
    for (let variant = 0; variant < 3; variant += 1) {
      const ink = MARK_INK[theme];
      out[theme].X.push(
        `<svg viewBox="0 0 76 76" width="100%" height="100%" aria-hidden="true">${brushX(variant, ink)}</svg>`,
      );
      out[theme].O.push(
        `<svg viewBox="0 0 76 76" width="100%" height="100%" aria-hidden="true">${brushO(variant, ink)}</svg>`,
      );
    }
  }
  return out;
}
