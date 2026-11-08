/**
 * Proof sheet for the tic-tac-toe brush marks, rendered through the real tile route renderer so
 * what you see is exactly what the README loads:
 *
 *   - every mark (three X variants, three O variants) at 76px, in both themes;
 *   - a won board, where the winning three stay at full ink and the rest fade to 45%.
 *
 *   cd game-server && npx vite-node tools/marks-sheet.ts    # writes .preview/marks-sheet.html
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { tttTileSvg, TTT_TILE_SIZE, type Theme } from "../src/svg";
import type { TttState } from "../src/ttt";

type Cell = "X" | "O" | null;

function state(board: Cell[], line: number[] | null): TttState {
  return {
    board,
    over: line !== null,
    line,
    result: line ? "X" : null,
    game: 7,
    record: { w: 1, d: 0, l: 0 } as TttState["record"],
    version: 1,
  };
}

function board(st: TttState, theme: Theme): string {
  let html = `<div style="display:grid;grid-template-columns:repeat(3,${TTT_TILE_SIZE}px);gap:0">`;
  for (let i = 0; i < 9; i += 1) {
    const svg = tttTileSvg(st, i, theme);
    html += `<img src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}" width="${TTT_TILE_SIZE}" height="${TTT_TILE_SIZE}" alt="tile ${i}"/>`;
  }
  return `${html}</div>`;
}

const ALL: Cell[] = ["X", "O", "X", "O", "X", "O", "X", "O", "X"];
const WON: Cell[] = ["X", "O", "X", "O", "O", "X", "X", "X", "O"];

function sheet(): string {
  const sections = (["light", "dark"] as const).map((theme) => {
    const bg = theme === "dark" ? "#111" : "#fff";
    const fg = theme === "dark" ? "#ddd" : "#333";
    return (
      `<section style="background:${bg};color:${fg};padding:10px 12px;margin-bottom:10px;border-radius:6px">` +
      `<h2 style="font:600 11px ui-monospace,monospace;margin:0 0 8px">${theme}</h2>` +
      `<div style="display:flex;gap:26px;align-items:flex-start">` +
      `<div><p style="font:10px ui-monospace,monospace;margin:0 0 4px;opacity:.7">all marks · 3 variants each</p>${board(state(ALL, null), theme)}</div>` +
      `<div><p style="font:10px ui-monospace,monospace;margin:0 0 4px;opacity:.7">won line · others at 45%</p>${board(state(WON, [0, 1, 2]), theme)}</div>` +
      `</div></section>`
    );
  }).join("");

  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>brush marks</title></head>` +
    `<body style="margin:0;padding:8px;background:#7a7a7a;font:11px ui-monospace,monospace">` +
    `<p style="margin:0 0 8px;color:#111">brush marks · 76px tiles · ink #111111 light / #F2F2F2 dark</p>` +
    `${sections}</body></html>`
  );
}

const out = resolve(process.cwd(), "../.preview/marks-sheet.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sheet(), "utf8");
console.log(`[marks-sheet] wrote ${out}`);
