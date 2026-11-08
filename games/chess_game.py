"""
games/chess_game.py
Monochrome minimal Chess game engine and SVG generator.
White: Human / Visitors
Black: Ekansh's Engine Bot
Uses python-chess if available, with built-in FEN fallback.
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

try:
    import chess
    HAS_CHESS = True
except ImportError:
    HAS_CHESS = False

DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

# Monospace representation of pieces
PIECE_SYMBOLS = {
    "P": "P", "N": "N", "B": "B", "R": "R", "Q": "Q", "K": "K",
    "p": "p", "n": "n", "b": "b", "r": "r", "q": "q", "k": "k",
}


def default_chess_state() -> dict:
    return {
        "fen": DEFAULT_FEN,
        "turn": "white",
        "moves_count": 0,
        "history": [],
        "status": "WHITE TO MOVE",
        "last_move": None,
    }


def parse_fen_to_grid(fen: str) -> list:
    """Parses FEN into an 8x8 grid of piece characters or empty strings."""
    board_part = fen.split(" ")[0]
    ranks = board_part.split("/")
    grid = []
    for rank in ranks:
        row = []
        for ch in rank:
            if ch.isdigit():
                row.extend([""] * int(ch))
            else:
                row.append(ch)
        grid.append(row)
    return grid


class ChessGame:
    def __init__(self):
        self.state = load_state("chess", default_chess_state)

    def play(self, move_str: str, player_name: str = "Anonymous") -> Tuple[bool, str]:
        """Plays white move (UCI or SAN) and responds with bot countermove."""
        if not HAS_CHESS:
            return False, "python-chess package is required to execute moves. Please install requirements.txt."

        board = chess.Board(self.state["fen"])
        if board.is_game_over():
            return False, f"Game is already over: {board.result()}. Reset to play again."

        # Parse move
        move = None
        move_str_clean = move_str.strip()
        try:
            move = board.parse_san(move_str_clean)
        except Exception:
            try:
                move = chess.Move.from_uci(move_str_clean)
                if move not in board.legal_moves:
                    return False, f"Illegal move: {move_str_clean}"
            except Exception:
                return False, f"Invalid move notation: '{move_str_clean}'"

        if move not in board.legal_moves:
            return False, f"Illegal move: {move_str_clean}"

        # Play human move
        san_move = board.san(move)
        board.push(move)
        self.state["history"].append(san_move)
        self.state["moves_count"] += 1
        self.state["last_move"] = f"White ({player_name}): {san_move}"

        # Check if game over after white's move
        if board.is_game_over():
            self.state["status"] = f"GAME OVER: {board.result()}"
            self.state["fen"] = board.fen()
            save_state("chess", self.state)
            return True, f"Move {san_move} played. Game over: {board.result()}."

        # Bot countermove (Black)
        # Simple material/position greedy heuristic or legal move selection
        legal_moves = list(board.legal_moves)
        best_move = legal_moves[0]
        best_score = -9999

        # Value map
        values = {
            chess.PAWN: 10, chess.KNIGHT: 30, chess.BISHOP: 30,
            chess.ROOK: 50, chess.QUEEN: 90, chess.KING: 900
        }

        for m in legal_moves:
            score = 0
            if board.is_capture(m):
                captured = board.piece_at(m.to_square)
                if captured:
                    score += values.get(captured.piece_type, 10) * 2
            # Center control
            if m.to_square in (chess.D4, chess.D5, chess.E4, chess.E5):
                score += 3
            if score > best_score:
                best_score = score
                best_move = m

        bot_san = board.san(best_move)
        board.push(best_move)
        self.state["history"].append(bot_san)
        self.state["moves_count"] += 1
        self.state["last_move"] = f"Bot played: {bot_san}"

        if board.is_game_over():
            self.state["status"] = f"GAME OVER: {board.result()}"
        else:
            self.state["status"] = "WHITE TO MOVE"

        self.state["fen"] = board.fen()
        save_state("chess", self.state)
        return True, f"Move {san_move} played. Bot answered {bot_san}."

    def reset(self) -> None:
        self.state = default_chess_state()
        save_state("chess", self.state)

    def render_svg(self, palette: dict) -> str:
        grid = parse_fen_to_grid(self.state["fen"])
        status = self.state.get("status", "WHITE TO MOVE")
        last_move = self.state.get("last_move", "Opening position")
        moves_count = self.state.get("moves_count", 0)

        body = []
        # Header banner
        body.append(f'  <line x1="48" y1="36" x2="952" y2="36" stroke="{palette["rule"]}" stroke-width="1"/>')
        body.append(f'  <text class="mono" x="48" y="24" font-size="11" letter-spacing="3" fill="{palette["muted"]}">INTERACTIVE SYSTEM · CHESS TERMINAL</text>')
        body.append(f'  <text class="mono" x="952" y="24" font-size="11" letter-spacing="3" text-anchor="end" fill="{palette["muted"]}">COMMUNITY (WHITE) VS BOT (BLACK)</text>')

        # Left Info column (x=48..320)
        body.append('  <g class="mono">')
        body.append(f'    <text x="48" y="74" font-size="16" font-weight="700" fill="{palette["bone"]}">{xml_escape(status)}</text>')
        body.append(f'    <text x="48" y="104" font-size="12" fill="{palette["muted"]}">last: {xml_escape(last_move)}</text>')
        body.append(f'    <text x="48" y="128" font-size="12" fill="{palette["muted"]}">half-moves: {moves_count}</text>')
        body.append(f'    <text x="48" y="160" font-size="12" fill="{palette["dim"]}">Play moves using GitHub Issues</text>')
        body.append(f'    <text x="48" y="180" font-size="12" fill="{palette["dim"]}">e.g., e4, d4, Nf3, c4</text>')

        # Sample quick moves or reset link
        reset_link = make_issue_link("chess", "reset")
        body.append(f'    <a href="{reset_link}" target="_blank">')
        body.append(f'      <rect x="48" y="220" width="160" height="32" fill="none" stroke="{palette["rule"]}" stroke-width="1" class="hover-cell"/>')
        body.append(f'      <text x="128" y="240" font-size="11.5" letter-spacing="2" text-anchor="middle" fill="{palette["bone"]}">[ RESET BOARD ]</text>')
        body.append('    </a>')
        body.append('  </g>')

        # Board grid (x=380, y=50; 8x8 of 30x30 = 240x240)
        bx, by = 380, 50
        sq = 30

        # Outer border
        body.append(f'  <rect x="{bx - 1}" y="{by - 1}" width="{sq * 8 + 2}" height="{sq * 8 + 2}" fill="none" stroke="{palette["rule"]}" stroke-width="1"/>')

        ranks_labels = ["8", "7", "6", "5", "4", "3", "2", "1"]
        files_labels = ["a", "b", "c", "d", "e", "f", "g", "h"]

        for r in range(8):
            # Rank label on left
            body.append(f'  <text class="mono" x="{bx - 8}" y="{by + r * sq + 20}" font-size="10" text-anchor="end" fill="{palette["dim"]}">{ranks_labels[r]}</text>')
            for f in range(8):
                cx = bx + f * sq
                cy = by + r * sq
                is_dark = (r + f) % 2 == 1
                bg_col = palette["cell_alt"] if is_dark else palette["cell_bg"]
                body.append(f'  <rect x="{cx}" y="{cy}" width="{sq}" height="{sq}" fill="{bg_col}"/>')

                # Piece
                p = grid[r][f]
                if p:
                    is_white = p.isupper()
                    p_fill = palette["accent"] if is_white else palette["muted"]
                    p_weight = "700" if is_white else "400"
                    body.append(f'  <text class="mono" x="{cx + sq // 2}" y="{cy + 20}" font-size="13" font-weight="{p_weight}" text-anchor="middle" fill="{p_fill}">{p}</text>')

        # File labels at bottom
        for f in range(8):
            body.append(f'  <text class="mono" x="{bx + f * sq + sq // 2}" y="{by + sq * 8 + 14}" font-size="10" text-anchor="middle" fill="{palette["dim"]}">{files_labels[f]}</text>')

        # Right Moves helper (x=670..952)
        body.append('  <g class="mono">')
        body.append(f'    <text x="670" y="74" font-size="12" letter-spacing="2" fill="{palette["dim"]}">POPULAR FIRST MOVES</text>')
        body.append(f'    <line x1="670" y1="88" x2="952" y2="88" stroke="{palette["rule"]}" stroke-width="1" opacity="0.4"/>')

        starter_moves = ["e4", "d4", "Nf3", "c4"]
        sm_y = 114
        for m in starter_moves:
            mlink = make_issue_link("chess", m)
            body.append(f'    <a href="{mlink}" target="_blank">')
            body.append(f'      <text x="670" y="{sm_y}" font-size="12" fill="{palette["bone"]}">▸ Play {m}  <tspan fill="{palette["dim"]}">(click to open issue)</tspan></text>')
            body.append('    </a>')
            sm_y += 26

        body.append(f'    <text x="670" y="240" font-size="11" fill="{palette["dim"]}">FEN: {xml_escape(self.state["fen"][:32])}...</text>')
        body.append('  </g>')

        return wrap_game_svg(310, "Interactive Monochrome Chess Board", "\n".join(body), palette)

    def write_assets(self, assets_dir: Path) -> None:
        """Writes both light and dark SVGs."""
        games_light = assets_dir / "games"
        games_dark = assets_dir / "dark" / "games"
        games_light.mkdir(parents=True, exist_ok=True)
        games_dark.mkdir(parents=True, exist_ok=True)

        light_svg = self.render_svg(PALETTE_LIGHT)
        dark_svg = self.render_svg(PALETTE_DARK)

        (games_light / "chess.svg").write_text(light_svg, encoding="utf-8")
        (games_dark / "chess.svg").write_text(dark_svg, encoding="utf-8")
