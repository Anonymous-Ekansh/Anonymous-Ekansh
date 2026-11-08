/**
 * Tic-tac-toe marks, drawn as hand-painted brush strokes.
 *
 * Each mark is a filled shape, not a stroked line: an X is two tapered strokes that bow slightly
 * and cross off-centre, an O is one path with `fill-rule="evenodd"` — an irregular outer ring and
 * an irregular inner ring, so the paint looks thicker on one side and the ends overlap.
 *
 * Three variants of each are chosen by tile index, deterministically, so the board reads as nine
 * separate brush marks instead of one stamp repeated nine times. Nothing is traced from another
 * project: the geometry below is generated here from a tapered-stroke and a jittered-ring helper.
 */

import type { Theme } from "./svg";

const INK: Record<Theme, string> = { light: "#111111", dark: "#F2F2F2" };

const r = (v: number): number => Math.round(v * 100) / 100;

/** One tapered stroke: width w1 at `a`, w2 at `b`, bowed by `bow` perpendicular to the line. */
function stroke(a: [number, number], b: [number, number], w1: number, w2: number, bow: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (a[0] + b[0]) / 2 + nx * bow;
  const my = (a[1] + b[1]) / 2 + ny * bow;
  const wm = (w1 + w2) * 0.34;

  const at = (p: [number, number], off: number): string => `${r(p[0] + nx * off)} ${r(p[1] + ny * off)}`;

  return (
    `M${at(a, w1 / 2)} ` +
    `Q${r(mx + nx * wm)} ${r(my + ny * wm)} ${at(b, w2 / 2)} ` +
    `L${at(b, -w2 / 2)} ` +
    `Q${r(mx - nx * wm)} ${r(my - ny * wm)} ${at(a, -w1 / 2)} Z`
  );
}

/** Shortest distance between two angles, in radians. */
function angleGap(a: number, b: number): number {
  const twoPi = Math.PI * 2;
  let d = Math.abs(((a - b) % twoPi + twoPi) % twoPi);
  if (d > Math.PI) d = twoPi - d;
  return d;
}

/** Per-variant geometry: each one is a differently loaded brush. */
const X_STROKES: Array<{ w1: number; w2: number; bow: number; skew: number }> = [
  { w1: 7.4, w2: 3.2, bow: 1.8, skew: 0.06 },
  { w1: 6.6, w2: 2.6, bow: -2.2, skew: -0.08 },
  { w1: 8.2, w2: 3.6, bow: 1.1, skew: 0.1 },
];

const O_RINGS: Array<{
  jitter: number;
  phase: number;
  thickness: number;
  squash: number;
  press: number;
  seam: number;
  swell: number;
}> = [
  // jitter wobbles the radius, thickness is the paint width as a fraction of the radius, press
  // is the direction the inner edge drifts (so one side of the ring is loaded, the other thin),
  // seam is where the stroke lands back on itself and swell is how much it piles up there.
  { jitter: 0.05, phase: 0.35, thickness: 0.42, squash: 0.05, press: 2.1, seam: 0.9, swell: 0.5 },
  { jitter: 0.07, phase: 1.15, thickness: 0.46, squash: -0.07, press: -0.6, seam: 2.4, swell: 0.62 },
  { jitter: 0.04, phase: 2.2, thickness: 0.38, squash: 0.08, press: 1.2, seam: 4.4, swell: 0.44 },
];

function xPath(size: number, variant: number): string {
  const g = X_STROKES[variant % X_STROKES.length];
  const c = size / 2;
  const reach = size * 0.3; // ink spans about 70% of the tile once the taper is added
  const j = g.skew * size;

  const a: [number, number] = [c - reach, c - reach + j];
  const d: [number, number] = [c + reach, c + reach + j];
  const b: [number, number] = [c + reach - j, c - reach];
  const e: [number, number] = [c - reach + j, c + reach];

  return stroke(a, d, g.w1, g.w2, g.bow) + stroke(b, e, g.w1 * 0.94, g.w2 * 1.1, -g.bow * 0.8);
}

/*
 * The O is one outline with `fill-rule="evenodd"`: an outer edge and an inner edge sampled round
 * the same ellipse, joined at both ends. Two things make it read as paint rather than a donut: the
 * inner edge drifts off-centre, so the ring is heavy on one side and thin on the other, and the
 * paint swells where the stroke lands back on its start. The swell is thickness rather than a
 * self-intersecting spiral, because evenodd would cut a hole out of any region drawn twice.
 */
function oPath(size: number, variant: number): string {
  const g = O_RINGS[variant % O_RINGS.length];
  const c = size / 2;
  const outer = size * 0.325; // ink spans about 70% of the tile once the wobble is added
  const strides = 72;

  const edge = (angle: number, radius: number): [number, number] => {
    const wobble =
      1 + g.jitter * Math.sin(angle * 2 + g.phase * 1.7) + g.jitter * 0.6 * Math.sin(angle * 3 - 0.4);
    return [c + Math.cos(angle) * radius * wobble, c + Math.sin(angle) * radius * wobble * (1 + g.squash)];
  };

  const drift = g.thickness * outer * 0.34;
  const driftX = Math.cos(g.press) * drift;
  const driftY = Math.sin(g.press) * drift;

  const outerEdge: string[] = [];
  const innerEdge: string[] = [];

  for (let i = 0; i <= strides; i += 1) {
    const angle = g.phase + (i / strides) * Math.PI * 2;
    const gap = angleGap(angle, g.seam);
    const pile = 1 + g.swell * Math.exp(-(gap * gap) / 0.22); // paint piles up at the join
    const paint = g.thickness * outer * pile;

    const [ox, oy] = edge(angle, outer);
    const [ix, iy] = edge(angle, outer - paint);
    outerEdge.push(`${r(ox)} ${r(oy)}`);
    innerEdge.push(`${r(ix + driftX)} ${r(iy + driftY)}`);
  }

  return `M${outerEdge.join(" L")} L${innerEdge.reverse().join(" L")} Z`;
}

/**
 * One mark. `index` picks the variant (tile 0..8), `dim` fades the marks that are not part of the
 * winning line so the three that are read clearly.
 */
export function markSvg(mark: "X" | "O", theme: Theme, size: number, index: number, dim: number): string {
  const ink = INK[theme];
  const variant = index % 3;
  const opacity = dim < 1 ? ` opacity="${dim}"` : "";

  if (mark === "X") {
    return `<path d="${xPath(size, variant)}" fill="${ink}"${opacity}/>`;
  }
  return `<path d="${oPath(size, variant)}" fill="${ink}" fill-rule="evenodd"${opacity}/>`;
}
