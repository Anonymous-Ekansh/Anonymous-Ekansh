#!/usr/bin/env python3
"""
tools/build_arena.py
Print the README block for the ARENA boards.

Reads WORKER from profile.json -> "worker_url" (no other input, no network).

Layout
------
<table width="100%"> with two fixed-width columns, content centred in each:

    left td  width="58%"   chess: header strip, status banner, 8x8 board, recent banner, button
    right td width="42%"   tic-tac-toe, vertically centred: header, 3x3 board, status, button

Sizes come from game-server/src/svg.ts: 52px chess tiles (8 x 52 = 416), 76px tic-tac-toe tiles
(3 x 76 = 228), 26px banners, 28px headers, 26px buttons. Every banner is exactly as wide as the
board above it.

Why the boards are not nested <table>s
--------------------------------------
GitHub pads and borders every table cell, nested tables included:

    .markdown-body table td { padding: 6px 13px; border: 1px solid ... }

and it strips both `style` and `border="0"` before rendering, so that padding cannot be removed.
A nested cell per tile renders each square as a bordered box 26px apart — a 52px board becomes
about 700px wide and the third tic-tac-toe column drops out of view. So each rank is a plain run
of <a><picture>…</picture></a> inside the cell, with no whitespace between tags: GitHub renders
inline images that touch as one row and turns any whitespace into a visible gap.

Both columns carry nowrap, which survives sanitisation and pins their minimum width, so a narrow
viewport scrolls the block instead of rewrapping a rank into six tiles.

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
CHESS_TILE = 52
TTT_TILE = 76
BANNER_H = 26
HEADER_H = 28
BUTTON_H = 26
FOOTER_H = 18
CHESS_W = CHESS_TILE * 8  # 416
TTT_W = TTT_TILE * 3  # 228
CHESS_BUTTON_W = 124
TTT_BUTTON_W = 92
FOOTER_W = CHESS_W


def load_worker() -> str:
    if not PROFILE.exists():
        sys.exit(f"[build_arena] missing {PROFILE}")
    with PROFILE.open(encoding="utf-8") as fh:
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


def link(href: str, inner: str) -> str:
    return f'<a href="{href}">{inner}</a>'


def chess_tile(worker: str, sq: str) -> str:
    return link(f"{worker}/c/click/{sq}", picture(f"{worker}/c/tile/{sq}.svg", CHESS_TILE, CHESS_TILE, sq))


def ttt_tile(worker: str, cell: int) -> str:
    url = f"{worker}/t/tile/{cell}.svg"
    return link(f"{worker}/t/click/{cell}", picture(url, TTT_TILE, TTT_TILE, f"tile {cell + 1}"))


def chess_rows(worker: str) -> str:
    """Eight ranks, each a gapless row of eight tiles, one row per line."""
    return "<br/>".join("".join(chess_tile(worker, f + str(rank)) for f in FILES) for rank in RANKS)


def ttt_rows(worker: str) -> str:
    """Exactly three rows of three tiles."""
    return "<br/>".join("".join(ttt_tile(worker, r * 3 + c) for c in range(3)) for r in range(3))


def build(worker: str) -> str:
    def chrome(name: str, w: int, h: int, alt: str) -> str:
        return picture(f"{worker}/{name}.svg", w, h, alt)

    return f"""<table width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td valign="top" width="58%" align="center" nowrap>
{chrome("c/header", CHESS_W, HEADER_H, "Community chess")}<br/>
{chrome("c/status", CHESS_W, BANNER_H, "chess — status")}<br/>
{chess_rows(worker)}<br/>
{chrome("c/recent", CHESS_W, BANNER_H, "chess — recent moves")}<br/>
{link(f"{worker}/play", chrome("c/button", CHESS_BUTTON_W, BUTTON_H, "play full-screen"))}
</td>
<td valign="middle" width="42%" align="center" nowrap>
{chrome("t/header", TTT_W, HEADER_H, "Quick tic-tac-toe")}<br/>
{ttt_rows(worker)}<br/>
{chrome("t/status", TTT_W, BANNER_H, "tic-tac-toe — status")}<br/>
{link(f"{worker}/t/new", chrome("t/button", TTT_BUTTON_W, BUTTON_H, "new game"))}
</td>
</tr>
<tr>
<td colspan="2" align="center">{chrome("footer", FOOTER_W, FOOTER_H, "piece credit")}</td>
</tr></table>"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Print the README block for the ARENA boards.")
    parser.parse_args()
    print(build(load_worker()))


if __name__ == "__main__":
    main()
