"""
games/run.py
CLI runner for processing game moves and rendering SVG assets.
Supports GitHub Actions issue dispatch and local execution.
"""

import argparse
import os
import sys
from pathlib import Path
from games.ttt import TicTacToe
from games.chess_game import ChessGame


def parse_issue_title(title: str):
    """
    Parses issue title in format:
      game|<game_name>|<move>
    e.g.:
      game|ttt|4
      game|ttt|reset
      game|chess|e4
      game|chess|reset
    """
    parts = title.strip().split("|")
    if len(parts) >= 3 and parts[0].strip().lower() == "game":
        return parts[1].strip().lower(), parts[2].strip()
    return None, None


def main():
    parser = argparse.ArgumentParser(description="Anonymous-Ekansh Interactive Profile Games Runner")
    parser.add_argument("--game", choices=["ttt", "chess"], help="Game to play (ttt or chess)")
    parser.add_argument("--move", help="Move value (e.g. 0..8 or reset for ttt; e4, d4, e2e4 or reset for chess)")
    parser.add_argument("--player", default="Community", help="Player username")
    parser.add_argument("--issue-title", help="GitHub issue title to parse (e.g. 'game|ttt|4')")
    parser.add_argument("--render-all", action="store_true", help="Render all game SVGs without playing a move")

    args = parser.parse_args()

    # Workflow escape hatch: TITLE="admin|render" re-renders both boards without a move.
    title_env = os.environ.get("TITLE", "").strip()
    if title_env == "admin|render":
        args.render_all = True

    base_dir = Path(__file__).resolve().parent.parent
    assets_dir = base_dir / "assets"

    ttt = TicTacToe()
    chess = ChessGame()

    if args.issue_title:
        g, m = parse_issue_title(args.issue_title)
        if not g or not m:
            print(f"[games.run] Unrecognized issue format: '{args.issue_title}'", file=sys.stderr)
            sys.exit(1)
        args.game = g
        args.move = m

    if args.game:
        move = args.move.strip()
        print(f"[games.run] Processing {args.game.upper()} move '{move}' by @{args.player}...")

        if args.game == "ttt":
            if move.lower() == "reset":
                ttt.reset()
                print("  ✓ Tic-Tac-Toe reset to starting state.")
            else:
                try:
                    cell_idx = int(move)
                except ValueError:
                    print(f"Invalid cell: '{move}'. Must be an integer 0..8.", file=sys.stderr)
                    sys.exit(1)
                ok, msg = ttt.play(cell_idx, args.player)
                print(f"  Result: {msg}")
                if not ok:
                    sys.exit(1)
            ttt.write_assets(assets_dir)

        elif args.game == "chess":
            if move.lower() == "reset":
                chess.reset()
                print("  ✓ Chess board reset to standard opening position.")
            else:
                ok, msg = chess.play(move, args.player)
                print(f"  Result: {msg}")
                if not ok:
                    sys.exit(1)
            chess.write_assets(assets_dir)

    elif args.render_all or not (args.game or args.issue_title):
        print(f"[games.run] admin render (EVENT_NAME={os.environ.get('EVENT_NAME', 'local')})")
        print("[games.run] Rendering all game SVGs...")
        ttt.write_assets(assets_dir)
        chess.write_assets(assets_dir)
        print("  ✓ ttt.svg (light & dark)")
        print("  ✓ chess.svg (light & dark)")


if __name__ == "__main__":
    main()
