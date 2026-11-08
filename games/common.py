"""
games/common.py
Shared utilities, palettes, and helpers for interactive README games.
"""

import json
from html import escape as html_escape
from pathlib import Path
from urllib.parse import quote

REPO = "Anonymous-Ekansh/Anonymous-Ekansh"

PALETTE_LIGHT = {
    "bone": "#333333",
    "muted": "#777777",
    "dim": "#9A9A9A",
    "rule": "#C4C4C4",
    "accent": "#000000",
    "ghost": "#D4D4D4",
    "cell_bg": "#F5F5F5",
    "cell_alt": "#EBEBEB",
}

PALETTE_DARK = {
    "bone": "#E6E6E6",
    "muted": "#8C8C8C",
    "dim": "#666666",
    "rule": "#3A3A3A",
    "accent": "#FFFFFF",
    "ghost": "#2C2C2C",
    "cell_bg": "#1A1A1A",
    "cell_alt": "#222222",
}

FONT_STACK = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'


def xml_escape(text: str) -> str:
    """Escapes string for safe embedding into SVG text elements."""
    if not isinstance(text, str):
        text = str(text)
    return html_escape(text, quote=True).replace("'", "&#39;")


def make_issue_link(game: str, move: str) -> str:
    """Generates an issue creation URL to trigger a move via GitHub Action."""
    title = f"game|{game}|{move}"
    body = f"Click 'Submit new issue' to play move `{move}` in `{game}`. You do not need to edit anything."
    return f"https://github.com/{REPO}/issues/new?title={quote(title)}&body={quote(body)}"


def load_state(game_name: str, default_factory) -> dict:
    """Loads game state from games/state/<game_name>.json."""
    state_file = Path(__file__).resolve().parent / "state" / f"{game_name}.json"
    if state_file.exists():
        try:
            with open(state_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    state = default_factory()
    save_state(game_name, state)
    return state


def save_state(game_name: str, state: dict) -> None:
    """Saves game state to games/state/<game_name>.json."""
    state_dir = Path(__file__).resolve().parent / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    state_file = state_dir / f"{game_name}.json"
    with open(state_file, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def wrap_game_svg(height: int, aria_label: str, body: str, palette: dict) -> str:
    """SVG wrapper for game panels adhering to the design system."""
    return f"""<svg viewBox="0 0 1000 {height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="{xml_escape(aria_label)}">
  <style>
    .mono {{ font-family: {FONT_STACK}; }}
    .rise {{ opacity: 0; animation: rise 0.7s cubic-bezier(.2,.7,.2,1) forwards; }}
    @keyframes rise {{ from {{ opacity: 0; transform: translateY(6px); }} to {{ opacity: 1; transform: translateY(0); }} }}
    .fade {{ opacity: 0; animation: fade 0.6s ease forwards; }}
    @keyframes fade {{ to {{ opacity: 1; }} }}
    .hover-cell:hover {{ fill-opacity: 0.8; cursor: pointer; }}
    @media (prefers-reduced-motion: reduce) {{
      .rise, .fade {{ animation: none !important; opacity: 1 !important; transform: none !important; }}
    }}
  </style>
{body}
</svg>
"""
