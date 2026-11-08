#!/usr/bin/env python3
"""
tools/build_arena.py
Print the static README block for the ARENA boards.

Reads WORKER from profile.json -> "worker_url" (no other input, no network).

    python3 tools/build_arena.py                 # print the chosen variant
    python3 tools/build_arena.py --variant a     # (a) nested <table> per board
    python3 tools/build_arena.py --variant b     # (b) inline <a><img> rows
    python3 tools/build_arena.py --compare       # both, plus the gap estimate

The block is plain HTML: no <script>, no style attributes, no markers, so a bot cannot
rewrite it and a reader can paste it anywhere. Nothing is written to disk.

Gap comparison
--------------
GitHub gives every table cell padding, and it also gives adjacent inline images one
whitespace gap. Variant (a) therefore adds dead space at every interior cell boundary
(~12 px on GitHub), while variant (b) joins the anchors with no whitespace at all
(`</a><a`), so its only gaps are the deliberate ones. The script scores both on that
basis and prints the lower one by default.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROFILE = ROOT / "profile.json"

FILES = "abcdefgh"
RANKS = range(8, 0, -1)

# One padded table cell on GitHub is roughly 12 px wider than the image it holds.
CELL_GAP_PX = 12


def load_worker() -> str:
    if not PROFILE.exists():
        sys.exit(f"[build_arena] missing {PROFILE}")
    with PROFILE.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    worker = str(data.get("worker_url") or "").strip().rstrip("/")
    if not worker.startswith("https://"):
        sys.exit(
            "[build_arena] profile.json needs \"worker_url\": \"https://<name>.<account>.workers.dev\" "
            "(printed by `npx wrangler deploy`)"
        )
    return worker


def picture(url: str, width: int, height: int, alt: str) -> str:
    """Light/dark pair, the same pattern the rest of the profile uses."""
    return (
        f'<picture><source media="(prefers-color-scheme: dark)" srcset="{url}?theme=dark"/>'
        f'<img src="{url}?theme=light" width="{width}" height="{height}" alt="{alt}"/></picture>'
    )


def chess_tile(worker: str, sq: str) -> str:
    return f'<a href="{worker}/c/click/{sq}">{picture(f"{worker}/c/tile/{sq}.svg", 44, 44, sq)}</a>'


def ttt_tile(worker: str, cell: int) -> str:
    return f'<a href="{worker}/t/click/{cell}">{picture(f"{worker}/t/tile/{cell}.svg", 72, 72, f"tile {cell}")}</a>'


# --- variant (a): one nested table per board (one padded <td> per square) -------------

def chess_board_table(worker: str) -> str:
    rows = []
    for rank in RANKS:
        cells = "".join(f"<td>{chess_tile(worker, f + str(rank))}</td>" for f in FILES)
        rows.append(f"<tr>{cells}</tr>")
    return '<table cellpadding="0" cellspacing="0" border="0">' + "".join(rows) + "</table>"


def ttt_board_table(worker: str) -> str:
    rows = []
    for r in range(3):
        cells = "".join(f"<td>{ttt_tile(worker, r * 3 + c)}</td>" for c in range(3))
        rows.append(f"<tr>{cells}</tr>")
    return '<table cellpadding="0" cellspacing="0" border="0">' + "".join(rows) + "</table>"


# --- variant (b): inline images, no whitespace between anchors ------------------------

def chess_board_inline(worker: str) -> str:
    rows = ["".join(chess_tile(worker, f + str(rank)) for f in FILES) for rank in RANKS]
    return "<br/>".join(rows)


def ttt_board_inline(worker: str) -> str:
    rows = ["".join(ttt_tile(worker, r * 3 + c) for c in range(3)) for r in range(3)]
    return "<br/>".join(rows)


def gap_estimate(variant: str) -> int:
    if variant == "a":
        chess_boundaries = 8 * (8 - 1)
        ttt_boundaries = 3 * (3 - 1)
        return (chess_boundaries + ttt_boundaries) * CELL_GAP_PX
    return 0


def build(worker: str, variant: str) -> str:
    if variant == "a":
        chess_board = chess_board_table(worker)
        ttt_board = ttt_board_table(worker)
    else:
        chess_board = chess_board_inline(worker)
        ttt_board = ttt_board_inline(worker)

    status = picture(f"{worker}/c/status.svg", 540, 40, "community chess — status")
    recent = picture(f"{worker}/c/recent.svg", 540, 40, "community chess — last five moves")
    ttt_status = picture(f"{worker}/t/status.svg", 320, 40, "tic-tac-toe — status")
    chess_btn = picture(f"{worker}/c/button.svg", 124, 26, "play full-screen")
    ttt_btn = picture(f"{worker}/t/button.svg", 92, 26, "new game")

    return f"""<table width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td valign="top" width="62%">
  <b><code>COMMUNITY CHESS</code></b> <sub>— click a piece, then a square</sub><br/>
  {status}<br/>
{chess_board}<br/>
  {recent}<br/>
  <a href="{worker}/play">{chess_btn}</a>
</td>
<td valign="top" width="38%">
  <b><code>NO TIME? QUICK TIC-TAC-TOE</code></b><br/>
{ttt_board}<br/>
  {ttt_status}<br/>
  <a href="{worker}/t/new">{ttt_btn}</a>
</td></tr></table>"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Print the README block for the ARENA boards.")
    parser.add_argument("--variant", choices=["a", "b"], help="force one layout")
    parser.add_argument("--compare", action="store_true", help="print both layouts and the gap estimate")
    args = parser.parse_args()

    worker = load_worker()
    chosen = "b" if gap_estimate("b") <= gap_estimate("a") else "a"

    if args.compare:
        for variant in ("a", "b"):
            print(f"<!-- variant {variant} · estimated gap {gap_estimate(variant)} px -->", file=sys.stderr)
            print(build(worker, variant))
            print()
        print(f"[build_arena] chosen variant: {chosen} (fewest gaps)", file=sys.stderr)
        return

    variant = args.variant or chosen
    print(build(worker, variant))
    if args.variant and args.variant != chosen:
        print(
            f"[build_arena] note: variant {args.variant} was forced; variant {chosen} has fewer gaps",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
