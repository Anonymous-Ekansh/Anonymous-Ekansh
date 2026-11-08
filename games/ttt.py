"""
games/ttt.py
Tic-Tac-Toe game engine and SVG generator.
Human plays X, Bot plays O.
"""

from typing import Optional, Tuple
from pathlib import Path
from games.common import (
    load_state,
    save_state,
    wrap_game_svg,
    xml_escape,
    make_issue_link,
    PALETTE_LIGHT,
    PALETTE_DARK,
)


def default_ttt_state() -> dict:
    return {
        "board": [""] * 9,
        "turn": "X",
        "winner": None,
        "moves_count": 0,
        "last_player": "System",
        "last_move": None,
    }


def check_winner(b: list) -> Optional[str]:
    lines = [
        (0, 1, 2), (3, 4, 5), (6, 7, 8),  # rows
        (0, 3, 6), (1, 4, 7), (2, 5, 8),  # cols
        (0, 4, 8), (2, 4, 6),              # diagonals
    ]
    for x, y, z in lines:
        if b[x] and b[x] == b[y] == b[z]:
            return b[x]
    if all(cell != "" for cell in b):
        return "draw"
    return None


def get_best_bot_move(b: list) -> int:
    """Minimax-based optimal AI move for 'O'."""
    # 1. Can bot win in one move?
    for i in range(9):
        if b[i] == "":
            b[i] = "O"
            if check_winner(b) == "O":
                b[i] = ""
                return i
            b[i] = ""

    # 2. Can player win in one move? Block it.
    for i in range(9):
        if b[i] == "":
            b[i] = "X"
            if check_winner(b) == "X":
                b[i] = ""
                return i
            b[i] = ""

    # 3. Take center if open
    if b[4] == "":
        return 4

    # 4. Take corners
    for i in [0, 2, 6, 8]:
        if b[i] == "":
            return i

    # 5. Take any remaining open cell
    for i in range(9):
        if b[i] == "":
            return i
    return -1


class TicTacToe:
    def __init__(self):
        self.state = load_state("ttt", default_ttt_state)

    def play(self, cell_idx: int, player_name: str = "Anonymous") -> Tuple[bool, str]:
        """Plays human move 'X' then responds with bot move 'O'."""
        if self.state["winner"] is not None:
            return False, f"Game is already finished ({self.state['winner']}). Reset to play again."

        if not (0 <= cell_idx <= 8):
            return False, f"Invalid cell index: {cell_idx}. Must be 0..8."

        if self.state["board"][cell_idx] != "":
            return False, f"Cell {cell_idx} is already occupied by {self.state['board'][cell_idx]}."

        # Player plays X
        self.state["board"][cell_idx] = "X"
        self.state["moves_count"] += 1
        self.state["last_player"] = player_name
        self.state["last_move"] = f"X on cell {cell_idx}"

        w = check_winner(self.state["board"])
        if w:
            self.state["winner"] = w
            save_state("ttt", self.state)
            return True, f"X played cell {cell_idx}. Game over: {w}."

        # Bot plays O
        bot_cell = get_best_bot_move(self.state["board"])
        if bot_cell != -1:
            self.state["board"][bot_cell] = "O"
            self.state["moves_count"] += 1
            self.state["last_move"] = f"Bot played O on cell {bot_cell}"
            w2 = check_winner(self.state["board"])
            if w2:
                self.state["winner"] = w2

        save_state("ttt", self.state)
        return True, "Move recorded."

    def reset(self) -> None:
        self.state = default_ttt_state()
        save_state("ttt", self.state)

    def render_svg(self, palette: dict) -> str:
        board = self.state["board"]
        winner = self.state["winner"]
        last_move = self.state.get("last_move", "No moves yet")

        if winner == "draw":
            status_text = "GAME OVER — DRAW"
            status_color = palette["dim"]
        elif winner in ("X", "O"):
            status_text = f"GAME OVER — {winner} WON"
            status_color = palette["accent"]
        else:
            status_text = "YOUR TURN — PLAY X"
            status_color = palette["bone"]

        body = []
        # Header banner
        body.append(f'  <line x1="48" y1="36" x2="952" y2="36" stroke="{palette["rule"]}" stroke-width="1"/>')
        body.append(f'  <text class="mono" x="48" y="24" font-size="11" letter-spacing="3" fill="{palette["muted"]}">INTERACTIVE SYSTEM · TIC-TAC-TOE</text>')
        body.append(f'  <text class="mono" x="952" y="24" font-size="11" letter-spacing="3" text-anchor="end" fill="{palette["muted"]}">CPU VS VISITOR</text>')

        # Left Info column (x=48..320)
        body.append('  <g class="mono">')
        body.append(f'    <text x="48" y="74" font-size="16" font-weight="700" fill="{status_color}">{xml_escape(status_text)}</text>')
        body.append(f'    <text x="48" y="104" font-size="12" fill="{palette["muted"]}">last: {xml_escape(last_move)}</text>')
        body.append(f'    <text x="48" y="128" font-size="12" fill="{palette["muted"]}">moves played: {self.state["moves_count"]}</text>')
        body.append(f'    <text x="48" y="160" font-size="12" fill="{palette["dim"]}">Click any open number</text>')
        body.append(f'    <text x="48" y="180" font-size="12" fill="{palette["dim"]}">below to play a move</text>')
        body.append(f'    <text x="48" y="200" font-size="12" fill="{palette["dim"]}">via GitHub Issues.</text>')

        # Reset button link
        reset_link = make_issue_link("ttt", "reset")
        body.append(f'    <a href="{reset_link}" target="_blank">')
        body.append(f'      <rect x="48" y="234" width="160" height="32" rx="0" fill="none" stroke="{palette["rule"]}" stroke-width="1" class="hover-cell"/>')
        body.append(f'      <text x="128" y="254" font-size="11.5" letter-spacing="2" text-anchor="middle" fill="{palette["bone"]}">[ RESET GAME ]</text>')
        body.append('    </a>')
        body.append('  </g>')

        # Center Board (Grid at x=410, y=56; 3x3 of 70x70)
        gx, gy = 410, 56
        cs = 70
        body.append(f'  <!-- Board Grid -->')
        # Grid vertical lines
        body.append(f'  <line x1="{gx + cs}" y1="{gy}" x2="{gx + cs}" y2="{gy + cs * 3}" stroke="{palette["rule"]}" stroke-width="1"/>')
        body.append(f'  <line x1="{gx + cs * 2}" y1="{gy}" x2="{gx + cs * 2}" y2="{gy + cs * 3}" stroke="{palette["rule"]}" stroke-width="1"/>')
        # Grid horizontal lines
        body.append(f'  <line x1="{gx}" y1="{gy + cs}" x2="{gx + cs * 3}" y2="{gy + cs}" stroke="{palette["rule"]}" stroke-width="1"/>')
        body.append(f'  <line x1="{gx}" y1="{gy + cs * 2}" x2="{gx + cs * 3}" y2="{gy + cs * 2}" stroke="{palette["rule"]}" stroke-width="1"/>')

        for i in range(9):
            r = i // 3
            c = i % 3
            cx = gx + c * cs
            cy = gy + r * cs
            val = board[i]

            if val == "X":
                # Draw sleek X
                p = 18
                body.append(f'  <line x1="{cx + p}" y1="{cy + p}" x2="{cx + cs - p}" y2="{cy + cs - p}" stroke="{palette["accent"]}" stroke-width="2.2"/>')
                body.append(f'  <line x1="{cx + cs - p}" y1="{cy + p}" x2="{cx + p}" y2="{cy + cs - p}" stroke="{palette["accent"]}" stroke-width="2.2"/>')
            elif val == "O":
                # Draw sleek O
                body.append(f'  <circle cx="{cx + cs // 2}" cy="{cy + cs // 2}" r="17" stroke="{palette["bone"]}" stroke-width="2.2" fill="none"/>')
            else:
                # Open cell with number
                issue_link = make_issue_link("ttt", str(i))
                body.append(f'  <a href="{issue_link}" target="_blank">')
                body.append(f'    <rect x="{cx + 2}" y="{cy + 2}" width="{cs - 4}" height="{cs - 4}" fill="{palette["cell_bg"]}" fill-opacity="0.2" class="hover-cell"/>')
                body.append(f'    <text class="mono" x="{cx + cs // 2}" y="{cy + cs // 2 + 5}" font-size="15" text-anchor="middle" fill="{palette["dim"]}">{i}</text>')
                body.append('  </a>')

        # Right Legend (x=680..952)
        body.append('  <g class="mono">')
        body.append(f'    <text x="680" y="74" font-size="12" letter-spacing="2" fill="{palette["dim"]}">QUICK MOVES</text>')
        body.append(f'    <line x1="680" y1="88" x2="952" y2="88" stroke="{palette["rule"]}" stroke-width="1" opacity="0.4"/>')
        legend_y = 114
        for row in range(3):
            row_cells = []
            for col in range(3):
                idx = row * 3 + col
                if board[idx] == "":
                    row_cells.append(f'cell {idx}')
                else:
                    row_cells.append(f'{board[idx]}')
            body.append(f'    <text x="680" y="{legend_y}" font-size="12" fill="{palette["muted"]}">row {row}:  {"  |  ".join(row_cells)}</text>')
            legend_y += 28

        body.append(f'    <text x="680" y="210" font-size="11" fill="{palette["dim"]}">ENGINE: MINIMAX DECISION TREE</text>')
        body.append(f'    <text x="680" y="230" font-size="11" fill="{palette["dim"]}">AUTOMATION: GITHUB ACTIONS DISPATCH</text>')
        body.append('  </g>')

        return wrap_game_svg(290, "Interactive Tic-Tac-Toe Game", "\n".join(body), palette)

    def write_assets(self, assets_dir: Path) -> None:
        """Writes both light and dark SVGs."""
        games_light = assets_dir / "games"
        games_dark = assets_dir / "dark" / "games"
        games_light.mkdir(parents=True, exist_ok=True)
        games_dark.mkdir(parents=True, exist_ok=True)

        light_svg = self.render_svg(PALETTE_LIGHT)
        dark_svg = self.render_svg(PALETTE_DARK)

        (games_light / "ttt.svg").write_text(light_svg, encoding="utf-8")
        (games_dark / "ttt.svg").write_text(dark_svg, encoding="utf-8")
