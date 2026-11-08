#!/usr/bin/env python3
"""
tools/build_arena.py
Print the README block for the ARENA boards.

Reads WORKER from profile.json -> "worker_url" (no other input, no network).

Layout
------
An outer table splits the block into two fixed-width columns (no percentages):

    <td valign="top" width="352">  chess: status banner, 8x8 board, recent banner
    <td valign="top" width="192">  tic-tac-toe, centred: 3x3 board, status banner

352 = 8 x 44 and 192 = 3 x 64, so each banner is exactly as wide as the board it sits over.
The chess status banner is above the board and the recent-moves banner below it.

Why the boards are not nested <table>s
--------------------------------------
GitHub's markdown CSS pads every cell of every table, nested ones included:

    .markdown-body table td { padding: 6px 13px; border: 1px solid ... }

and it strips both `style` and `border="0"` from README HTML before rendering, so the padding
cannot be removed. A nested table with one <td> per tile therefore renders each tile as a
bordered box 26px apart, which is 560px wide for eight 44px tiles instead of 352.

So each rank is a plain run of <a><picture>…</picture></a> inside the cell, with no whitespace
between the tags: GitHub renders inline images that touch as one row, and any whitespace
becomes a visible gap. Ranks are separated by <br/>.

The block is plain HTML: no <script>, no style attributes, no markers. Nothing is written to
disk — paste the printed block between the ARENA markers in README.md.
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

# Geometry shared with game-server/src/svg.ts.
CHESS_TILE = 44
TTT_TILE = 64
BANNER_HEIGHT = 40
CHESS_WIDTH = CHESS_TILE * 8
TTT_WIDTH = TTT_TILE * 3


def load_worker() -> str:
    if not PROFILE.exists():
        sys.exit(f"[build_arena] missing {PROFILE}")
    with open(PROFILE, encoding="utf-8") as fh:
        data = json.load(fh)
    worker = str(data.get("worker_url") or "").strip().rstrip("/")
    if not worker.startswith("https://"):
        sys.exit(
            "[build_arena] profile.json needs \"worker_url\": \"https://<name>.<account>.workers.dev\" "
            "(printed by `npx wrangler deploy`)"
        )
    return worker


def picture(url: str, width: int, height: int, alt: str) -> str:
    """Light/dark pair on one line, so no whitespace creeps between image and anchor tags."""
    return (
        f'<picture><source media="(prefers-color-scheme: dark)" srcset="{url}?theme=dark"/>'
        f'<img src="{url}?theme=light" width="{width}" height="{height}" alt="{alt}"/></picture>'
    )


def chess_tile(worker: str, sq: str) -> str:
    url = f"{worker}/c/tile/{sq}.svg"
    return f'<a href="{worker}/c/click/{sq}">{picture(url, CHESS_TILE, CHESS_TILE, sq)}</a>'


def ttt_tile(worker: str, cell: int) -> str:
    url = f"{worker}/t/tile/{cell}.svg"
    return f'<a href="{worker}/t/click/{cell}">{picture(url, TTT_TILE, TTT_TILE, f"tile {cell + 1}")}</a>'


def chess_rows(worker: str) -> str:
    """Eight ranks, each a gapless row of eight tiles, one row per line."""
    return "<br/>".join("".join(chess_tile(worker, f + str(rank)) for f in FILES) for rank in RANKS)


def ttt_rows(worker: str) -> str:
    """Three rows of three 64px tiles, centred by the cell's align="center"."""
    return "<br/>".join("".join(ttt_tile(worker, r * 3 + c) for c in range(3)) for r in range(3))


def build(worker: str) -> str:
    status = picture(f"{worker}/c/status.svg", CHESS_WIDTH, BANNER_HEIGHT, "community chess — status")
    recent = picture(f"{worker}/c/recent.svg", CHESS_WIDTH, BANNER_HEIGHT, "community chess — last five moves")
    ttt_status = picture(f"{worker}/t/status.svg", TTT_WIDTH, BANNER_HEIGHT, "tic-tac-toe — status")

    return f"""<table cellspacing="0" cellpadding="0"><tr>
<td valign="top" width="{CHESS_WIDTH}" align="left">
<b><code>COMMUNITY CHESS</code></b> <sub>— click a piece, then a square</sub><br/>
{status}<br/>
{chess_rows(worker)}<br/>
{recent}<br/>
<a href="{worker}/play">play full-screen</a>
</td>
<td valign="top" width="{TTT_WIDTH}" align="center">
<b><code>NO TIME?</code></b><br/>
<b><code>QUICK TIC-TAC-TOE</code></b><br/>
{ttt_rows(worker)}<br/>
{ttt_status}<br/>
<a href="{worker}/t/new">new game</a>
</td>
</tr></table>"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Print the README block for the ARENA boards.")
    parser.parse_args()
    print(build(load_worker()))


if __name__ == "__main__":
    main()
