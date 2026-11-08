/**
 * GET /play — a single self-contained page. No framework, no build step, monochrome and
 * monospace like the profile. Light/dark follows prefers-color-scheme.
 *
 * chess.js is loaded from a pinned jsDelivr URL with a Subresource Integrity hash: the fetch
 * carries `integrity`, so the browser refuses a modified file. It powers legal-move hints;
 * if it fails to load the board still renders from the server FEN and the server still
 * validates every move, so the page degrades instead of breaking.
 */

import { markSet } from "./brushes";
import { pieceSet } from "./pieces";

export function playPage(profile: string): string {
  // Both themes are embedded so the page never needs a flash of the wrong ink.
  const pieces = JSON.stringify(pieceSet()).replace(/</g, "\\u003c");
  const marks = JSON.stringify(markSet()).replace(/</g, "\\u003c");
  const esc = profile.replace(/"/g, "&quot;");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<meta name="robots" content="noindex"/>
<title>ARENA — community chess &amp; tic-tac-toe</title>
<style>
:root{
  --bone:#333333;--muted:#777777;--rule:#C4C4C4;--accent:#000000;--bg:#ffffff;--panel:#FAFAFA;
  --sq-l:#EDEDED;--sq-d:#B4B4B4;--tint:rgba(0,0,0,.07);--mark:var(--bone);
}
@media (prefers-color-scheme:dark){
  :root{--bone:#E6E6E6;--muted:#8C8C8C;--rule:#3A3A3A;--accent:#FFFFFF;--bg:#0d1117;--panel:#0f1620;
  --sq-l:#4D4D4D;--sq-d:#2A2A2A;--tint:rgba(255,255,255,.09);}
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--bone)}
body{font:13px/1.55 ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;max-width:1000px;margin:0 auto;padding:20px 16px 40px}
a{color:var(--bone);text-underline-offset:3px}
a:hover,a:focus-visible{color:var(--accent)}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:1px solid var(--rule);padding-bottom:12px}
.brand{color:var(--muted);font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;text-align:right}
.sub{color:var(--muted);font-size:11px;letter-spacing:.06em;margin:4px 0 0}
h1{font-size:19px;font-weight:600;letter-spacing:.3em;margin:16px 0 0}
main{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);gap:22px;margin-top:18px;align-items:start}
@media (max-width:880px){main{grid-template-columns:minmax(0,1fr)}}
section{border:1px solid var(--rule);background:var(--panel);padding:14px}
.hd{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px}
h2{font-size:10.5px;font-weight:600;letter-spacing:.2em;margin:0;color:var(--accent);text-transform:uppercase}
.idx{color:var(--muted);font-size:10.5px;letter-spacing:.12em}
.status{margin:0 0 10px;font-size:11.5px;color:var(--bone);min-height:17px}
.board{--size:clamp(30px,7vw,54px);display:grid;grid-template-columns:repeat(8,var(--size));grid-template-rows:repeat(8,var(--size));width:max-content;max-width:100%;border:1px solid var(--rule);touch-action:manipulation}
.sq{position:relative;width:100%;height:100%;margin:0;padding:0;border:0;border-radius:0;background:transparent;cursor:pointer;appearance:none;-webkit-appearance:none}
.sq.l{background:var(--sq-l)}
.sq.d{background:var(--sq-d)}
.sq.last::after{content:"";position:absolute;inset:0;background:var(--tint);pointer-events:none}
.sq.sel{outline:2px solid var(--accent);outline-offset:-2px}
.sq.chk{box-shadow:inset 0 0 0 3px var(--accent)}
.sq.tgt::before{content:"";position:absolute;left:50%;top:50%;width:26%;height:26%;margin:-13% 0 0 -13%;border-radius:50%;background:var(--accent);opacity:.33;pointer-events:none;z-index:2}
.sq.cap::before{width:66%;height:66%;margin:-33% 0 0 -33%;background:transparent;border:3px solid var(--accent);opacity:.45}
.sq:focus-visible{outline:3px dashed var(--accent);outline-offset:-3px;z-index:3}
.pc{display:block;width:100%;height:100%;pointer-events:none}
.pc g{pointer-events:none}
.ttt{--tile:clamp(58px,17vw,84px);display:grid;grid-template-columns:repeat(3,var(--tile));gap:7px;width:max-content}
.tcell{position:relative;width:var(--tile);height:var(--tile);padding:0;border:1.5px solid var(--rule);border-radius:9px;background:transparent;cursor:pointer;appearance:none;-webkit-appearance:none}
.tcell .tm{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;transition:opacity .2s ease}
.tcell.dim .tm{opacity:.45}
.tcell.win{border-color:var(--accent)}
.tcell:disabled{cursor:default}
.tcell:focus-visible{outline:3px dashed var(--accent);outline-offset:2px}
dl.meta{margin:10px 0 0;padding:0;display:grid;gap:3px}
dl.meta>div{display:flex;gap:10px;align-items:baseline}
dt{color:var(--muted);font-size:10px;letter-spacing:.14em;text-transform:uppercase;min-width:62px}
dd{margin:0;font-size:11.5px;overflow-wrap:anywhere}
.hint{margin:8px 0 0;color:var(--muted);font-size:10.5px;line-height:1.5}
.msg{margin:8px 0 0;color:var(--muted);font-size:11px;min-height:16px}
.msg.err{color:var(--accent);font-weight:600}
.act{font:inherit;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;background:transparent;color:var(--bone);border:1px solid var(--rule);padding:5px 9px;margin-top:10px;cursor:pointer;border-radius:2px}
.act:hover,.act:focus-visible{border-color:var(--accent);color:var(--accent)}
footer{margin-top:24px;border-top:1px solid var(--rule);padding-top:10px;color:var(--muted);font-size:10.5px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
@media (forced-colors:active){.sq.sel,.tcell.win{border:2px solid CanvasText}}
</style>
</head>
<body>
<header>
  <div>
    <a href="${esc}">&#8592; back to profile</a>
    <p class="sub">two boards, one monospace page</p>
  </div>
  <div class="brand">Anonymous-Ekansh<br/>arena</div>
</header>
<h1>ARENA</h1>
<main>
  <section aria-labelledby="chess-h">
    <div class="hd"><h2 id="chess-h">Community chess</h2><span class="idx" id="chess-game">game #1</span></div>
    <p class="status" id="chess-status" aria-live="polite">loading board…</p>
    <div id="chess-board" class="board" role="grid" aria-label="Community chess board, rank 8 at the top, file a on the left"></div>
    <p class="msg" id="chess-msg" role="status" aria-live="polite"></p>
    <dl class="meta">
      <div><dt>turn</dt><dd id="chess-turn">—</dd></div>
      <div><dt>last</dt><dd id="chess-last">—</dd></div>
      <div><dt>recent</dt><dd id="chess-recent">—</dd></div>
      <div><dt>record</dt><dd id="chess-record">—</dd></div>
    </dl>
    <p class="hint">Click a piece, then a square. Drag and drop works. Arrow keys move focus, Enter or Space selects, Escape clears. Both colours are shared: one move per person in a row.</p>
    <button type="button" class="act" id="chess-new" hidden>new game</button>
  </section>
  <section aria-labelledby="ttt-h">
    <div class="hd"><h2 id="ttt-h">No time? Quick tic-tac-toe</h2><span class="idx">you are X</span></div>
    <p class="status" id="ttt-status" aria-live="polite">loading board…</p>
    <div id="ttt-board" class="ttt" role="grid" aria-label="Tic-tac-toe board"></div>
    <p class="msg" id="ttt-msg" role="status" aria-live="polite"></p>
    <dl class="meta">
      <div><dt>turn</dt><dd id="ttt-turn">—</dd></div>
      <div><dt>game</dt><dd id="ttt-last">—</dd></div>
      <div><dt>record</dt><dd id="ttt-record">—</dd></div>
    </dl>
    <p class="hint">You are X, the bot is O. It blocks and takes the centre, but it blunders 20% of the time — a fork still beats it.</p>
    <button type="button" class="act" id="ttt-new" hidden>new game</button>
  </section>
</main>
<footer>
  <span>shared boards · moves are rate limited · <a href="${esc}">github.com/Anonymous-Ekansh</a></span>
  <span>pieces: Cburnett (CC BY-SA 3.0) · chess.js 1.4.0 (BSD-2)</span>
</footer>
<script type="module">
const CDN = "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/dist/esm/chess.js";
const SRI = "sha384-A9KE46F70Ao1BUdhGSxgP0+9OhPjBrpf6gsBehqG12SbeKbFWnO7bwtNT68I4xKh";
const PIECES = ${pieces};
const MARKS = ${marks};
const FILES = ["a","b","c","d","e","f","g","h"];
const NAMES = {p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"};
const SVGNS = "http://www.w3.org/2000/svg";

let lib = null;
let snap = null;
let sel = null;
let dragFrom = null;
let focusSq = "e4";
let busy = false;
const cells = new Map();
const tttCells = [];

function byId(id){ return document.getElementById(id); }

function note(which, message){
  const el = byId(which === "ttt" ? "ttt-msg" : "chess-msg");
  if (!el) return;
  el.textContent = message || "";
  el.className = "msg" + (message ? " err" : "");
}

function boardMap(fen){
  const out = {};
  const rows = String(fen || "").split(" ")[0].split("/");
  for (let r = 0; r < rows.length && r < 8; r += 1){
    let file = 0;
    for (const ch of rows[r]){
      if (ch >= "1" && ch <= "8"){ file += Number(ch); continue; }
      if (file > 7) break;
      out[FILES[file] + (8 - r)] = { type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? "w" : "b" };
      file += 1;
    }
  }
  return out;
}

function themeName(){
  try { return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
  catch (err) { return "light"; }
}

function pieceNode(piece){
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 45 45");
  svg.setAttribute("class", "pc");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const key = piece.color + piece.type.toUpperCase();
  svg.innerHTML = (PIECES[themeName()] || {})[key] || "";
  return svg;
}

function legalFrom(sq){
  if (!lib || !snap || !snap.chess) return null;
  try {
    const probe = new lib(snap.chess.fen);
    return probe.moves({ square: sq, verbose: true }).map(function(m){ return m.to; });
  } catch (err) {
    return [];
  }
}

function renderChess(){
  const st = snap && snap.chess;
  if (!st) return;
  const map = boardMap(st.fen);
  const targets = sel ? (legalFrom(sel) || []) : [];
  cells.forEach(function(el, sq){
    const piece = map[sq];
    el.textContent = "";
    if (piece) el.appendChild(pieceNode(piece));
    el.classList.toggle("sel", sel === sq);
    el.classList.toggle("last", !!st.last && (st.last.from === sq || st.last.to === sq));
    el.classList.toggle("tgt", targets.indexOf(sq) >= 0 && !piece);
    el.classList.toggle("cap", targets.indexOf(sq) >= 0 && !!piece);
    el.classList.toggle("chk", st.check === sq);
    el.draggable = !!piece && piece.color === st.turn;
    el.tabIndex = sq === focusSq ? 0 : -1;
    let label = sq + (piece ? " " + (piece.color === "w" ? "white " : "black ") + NAMES[piece.type] : " empty");
    if (sel === sq) label += ", selected";
    if (targets.indexOf(sq) >= 0) label += piece ? ", capture here" : ", legal move";
    if (st.check === sq) label += ", king in check";
    el.setAttribute("aria-label", label);
  });
  byId("chess-game").textContent = "game #" + st.game;
  byId("chess-turn").textContent = st.turn === "w" ? "white to move" : "black to move";
  byId("chess-last").textContent = st.last ? st.last.san + " (" + st.last.from + "→" + st.last.to + ")" : "—";
  byId("chess-recent").textContent = st.recent && st.recent.length ? st.recent.slice(-8).join(" ") : "no moves yet";
  byId("chess-record").textContent = "white " + st.record.white + " · black " + st.record.black + " · draw " + st.record.draw;
  let status = (st.turn === "w" ? "White" : "Black") + " to move · game #" + st.game;
  if (st.last) status += " · last: " + st.last.san;
  if (st.result) status += " · " + st.result;
  else if (st.check) status += " · check";
  byId("chess-status").textContent = status;
  byId("chess-new").hidden = !st.result;
}

function renderTtt(){
  const st = snap && snap.ttt;
  if (!st) return;
  for (let i = 0; i < 9; i += 1){
    const btn = tttCells[i];
    const v = st.board[i];
    const winning = !!st.line && st.line.indexOf(i) >= 0;
    btn.className = "tcell" + (winning ? " win" : "") + (st.line && !winning ? " dim" : "");
    const ink = v ? (MARKS[themeName()] || {})[v] : null;
    btn.innerHTML = ink ? ink[i % 3] || "" : "";
    btn.disabled = !!v || !!st.over;
    btn.setAttribute("aria-label", "cell " + (i + 1) + (v ? " " + v : " empty") + (winning ? ", winning line" : ""));
  }
  let line = "your move — you are X, the bot is O";
  if (st.over){
    if (st.result === "win") line = "game over — you won · play again";
    else if (st.result === "loss") line = "game over — the bot won · play again";
    else line = "game over — draw · play again";
  }
  byId("ttt-status").textContent = line;
  byId("ttt-turn").textContent = st.over ? "game over" : "your move (X)";
  byId("ttt-last").textContent = "game #" + st.game;
  byId("ttt-record").textContent = "visitors " + st.record.visitors + " · bot " + st.record.bot + " · draws " + st.record.draws;
  byId("ttt-new").hidden = !st.over;
}

function apply(data){
  if (!data || data.ok !== true) return;
  snap = data;
  renderChess();
  renderTtt();
}

async function refresh(){
  try {
    const res = await fetch("/api/state", { cache: "no-store", credentials: "omit" });
    if (!res.ok) return;
    const data = await res.json();
    apply(data);
  } catch (err) { /* offline: keep the last board on screen */ }
}

async function sendMove(payload){
  if (busy) return;
  busy = true;
  try {
    const res = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit"
    });
    const data = await res.json().catch(function(){ return null; });
    if (!res.ok || !data || data.ok !== true){
      note(payload.game, data && data.error ? data.error : "that move was not accepted");
      sel = null;
      renderChess();
      await refresh();
      return;
    }
    note(payload.game, "");
    sel = null;
    apply(data);
  } catch (err) {
    note(payload.game, "network error — the board may already be ahead");
  } finally {
    busy = false;
  }
}

function attempt(from, to){
  if (!snap || !snap.chess) return;
  const st = snap.chess;
  const map = boardMap(st.fen);
  const piece = map[from];
  if (!piece || piece.color !== st.turn){
    note("chess", "that is not a " + (st.turn === "w" ? "white" : "black") + " piece");
    return;
  }
  const targets = legalFrom(from);
  if (targets && targets.indexOf(to) < 0){
    note("chess", "that piece cannot go there");
    sel = from;
    renderChess();
    return;
  }
  sel = null;
  sendMove({ game: "chess", from: from, to: to });
}

function onSquare(sq){
  if (!snap || !snap.chess) return;
  const st = snap.chess;
  if (sel === sq){ sel = null; renderChess(); return; }
  if (sel){
    const targets = legalFrom(sel);
    if (targets === null || targets.indexOf(sq) >= 0){ attempt(sel, sq); return; }
  }
  const map = boardMap(st.fen);
  const piece = map[sq];
  if (piece && piece.color === st.turn){
    sel = sq;
    note("chess", "");
  } else {
    sel = null;
  }
  renderChess();
}

function onBoardKey(ev){
  const target = ev.target;
  if (!target || !target.dataset || !target.dataset.sq) return;
  if (ev.key === "Escape"){ sel = null; renderChess(); return; }
  const file = FILES.indexOf(target.dataset.sq[0]);
  const rank = Number(target.dataset.sq[1]);
  let nf = file;
  let nr = rank;
  if (ev.key === "ArrowLeft") nf = Math.max(0, file - 1);
  else if (ev.key === "ArrowRight") nf = Math.min(7, file + 1);
  else if (ev.key === "ArrowUp") nr = Math.min(8, rank + 1);
  else if (ev.key === "ArrowDown") nr = Math.max(1, rank - 1);
  else return;
  ev.preventDefault();
  focusSq = FILES[nf] + nr;
  const next = cells.get(focusSq);
  if (next) next.focus();
  renderChess();
}

const boardEl = byId("chess-board");
for (let rank = 8; rank >= 1; rank -= 1){
  for (let file = 0; file < 8; file += 1){
    const sq = FILES[file] + rank;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sq " + ((((file + (rank - 1)) % 2 === 1) ? "l" : "d"));
    btn.dataset.sq = sq;
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-label", sq);
    btn.tabIndex = sq === focusSq ? 0 : -1;
    btn.addEventListener("click", function(){ onSquare(sq); });
    btn.addEventListener("keydown", onBoardKey);
    btn.addEventListener("dragstart", function(ev){
      dragFrom = sq;
      if (ev.dataTransfer){
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", sq);
      }
    });
    btn.addEventListener("dragend", function(){ dragFrom = null; });
    btn.addEventListener("dragover", function(ev){ if (dragFrom) ev.preventDefault(); });
    btn.addEventListener("drop", function(ev){
      ev.preventDefault();
      const from = dragFrom;
      dragFrom = null;
      if (from && from !== sq) attempt(from, sq);
    });
    boardEl.appendChild(btn);
    cells.set(sq, btn);
  }
}

const tttEl = byId("ttt-board");
for (let i = 0; i < 9; i += 1){
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tcell";
  btn.dataset.cell = String(i);
  btn.setAttribute("role", "gridcell");
  btn.setAttribute("aria-label", "cell " + (i + 1) + " empty");
  btn.addEventListener("click", function(){ sendMove({ game: "ttt", cell: Number(btn.dataset.cell) }); });
  tttEl.appendChild(btn);
  tttCells.push(btn);
}

byId("chess-new").addEventListener("click", function(){ sendMove({ game: "chess", new: true }); });
byId("ttt-new").addEventListener("click", function(){ sendMove({ game: "ttt", new: true }); });

async function loadLib(){
  try {
    const res = await fetch(CDN, { integrity: SRI, mode: "cors", credentials: "omit", cache: "force-cache" });
    if (!res.ok) return null;
    const code = await res.text();
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const mod = await import(url);
    URL.revokeObjectURL(url);
    return mod && mod.Chess ? mod.Chess : null;
  } catch (err) {
    return null;
  }
}

async function init(){
  lib = await loadLib();
  if (!lib) note("chess", "legal-move hints are offline — moves are still checked by the server");
  await refresh();
  window.setInterval(function(){ if (!document.hidden) refresh(); }, 3000);
  document.addEventListener("visibilitychange", function(){ if (!document.hidden) refresh(); });
}

init();

try {
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  const repaint = function(){ renderChess(); renderTtt(); };
  if (scheme.addEventListener) scheme.addEventListener("change", repaint);
} catch (err) { /* older browsers keep the first render */ }
</script>
</body>
</html>`;
}
