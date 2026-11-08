# Anonymous-Ekansh Profile System — Setup & Architecture Guide

A minimalist, high-fidelity GitHub profile README for **Anonymous-Ekansh** (repo `Anonymous-Ekansh/Anonymous-Ekansh`, branch `main`).

Inspired by the editorial monochrome aesthetic of `Sharann-del/Sharann-del`, this architecture features stacked monochrome SVG panels rendered from a single JSON source of truth, automated repository telemetry, and GitHub-Issue-driven interactive profile games.

---

## 1. System Architecture

```
                  ┌────────────────────────┐
                  │      profile.json      │ (Single Source of Truth)
                  └───────────┬────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
┌───────────────────────┐           ┌───────────────────────┐
│ tools/build_assets.py │           │   tools/telemetry.py  │
└───────────┬───────────┘           └───────────┬───────────┘
            │                                   │ (Updates stats in profile.json)
            ├──────────────────────┬────────────┘
            ▼                      ▼
  assets/*.svg (Light)    assets/dark/*.svg (Dark)
            ▲                      ▲
            └──────────┬───────────┘
                       │ Embedded via <picture> tags
                       ▼
                   README.md
```

### Core Tenets
1. **Single Source of Truth:** All content (name, links, bio, projects, experience, stack, focus, footer) resides in `profile.json`.
2. **Dual-Theme Baking (No CSS Variables):** Every panel is written twice: `assets/X.svg` (light) and `assets/dark/X.svg` (dark). Colors are baked directly into SVG elements, avoiding CSS variables and dark-mode caching artifacts.
3. **Responsive Dark/Light Embedding:** Embedded in `README.md` via HTML5 `<picture>` tags with media query `(prefers-color-scheme: dark)`.
4. **Idempotency:** Re-running generation scripts produces deterministic, bit-for-bit identical assets.
5. **Zero External Dependencies for Asset Building:** `tools/build_assets.py` runs on pure Python standard library.

---

## 2. Design System

### Palettes
| Token | Light Value | Dark Value | Role |
| :--- | :--- | :--- | :--- |
| **bone** | `#333333` | `#E6E6E6` | Primary high-contrast body text & titles |
| **muted** | `#777777` | `#8C8C8C` | Secondary description & metadata text |
| **dim** | `#9A9A9A` | `#666666` | Subtle labels, timestamps & prompt markers |
| **rule** | `#C4C4C4` | `#3A3A3A` | Structural divider lines & borders |
| **accent** | `#000000` | `#FFFFFF` | Emphasized keywords, active indicators & cursors |
| **ghost** | `#D4D4D4` | `#2C2C2C` | Large section watermark numbers (`01`–`07`) |

### Typography & Canvas
- **Font:** `ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace`
- **Canvas:** `viewBox 0 0 1000 H`, content margins strictly bounded between `x=48` and `x=952`.

### Motion & Micro-animations
- `rise`: 0.7s cubic-bezier upward translation (`translateY(8px) → 0`) with fade-in.
- `fade`: Smooth 0.6s opacity entrance.
- `line-draw`: 1.4s stroke-dasharray drawing effect across horizontal rules.
- `cursor`: 1.0s step-end infinite blinking block cursor.
- `dot` / `ring`: 2.4s pulsing status indicator and radar ping animation.
- **Accessibility:** Full `@media (prefers-reduced-motion: reduce)` block disabling all animations, resetting offsets, and locking opacity to 1.

---

## 3. Directory Layout

```
.
├── .github/
│   └── workflows/
│       ├── game.yml           # Issue-triggered game runner (Tic-Tac-Toe & Chess)
│       ├── snake.yml          # Nightly contribution grid snake generator
│       └── telemetry.yml      # Scheduled telemetry updater & asset rebuilder
├── assets/
│   ├── dark/
│   │   ├── games/
│   │   │   ├── chess.svg      # Dark chess board
│   │   │   └── ttt.svg        # Dark tic-tac-toe board
│   │   ├── experience.svg
│   │   ├── focus.svg
│   │   ├── footer.svg
│   │   ├── header.svg
│   │   ├── projects.svg
│   │   ├── s01.svg .. s07.svg # Section dividers
│   │   ├── stack.svg
│   │   ├── telemetry.svg
│   │   └── whoami.svg
│   ├── games/
│   │   ├── chess.svg          # Light chess board
│   │   └── ttt.svg            # Light tic-tac-toe board
│   └── *.svg                  # Light panels (header, whoami, projects, etc.)
├── games/
│   ├── __init__.py
│   ├── common.py              # Shared SVG helpers, issue links, state loader
│   ├── chess_game.py          # Monochrome Chess engine (python-chess)
│   ├── run.py                 # CLI & GitHub Actions runner
│   ├── ttt.py                 # Minimax Tic-Tac-Toe engine
│   └── state/
│       ├── chess.json         # Serialized FEN and move history
│       └── ttt.json           # Serialized 3x3 board state
├── tools/
│   ├── build_assets.py        # Pure Python SVG generator
│   └── telemetry.py          # GitHub API statistics aggregator
├── profile.json               # Canonical profile configuration
├── requirements.txt           # chess==1.11.2
├── SETUP.md                   # Architecture & operations documentation
└── README.md                  # Rendered profile README
```

---

## 4. Local Development & Workflow Commands

### 1. Rebuild All Profile Assets
To regenerate all SVGs from `profile.json`:
```bash
python3 tools/build_assets.py
```
*Note:* The script automatically checks project descriptions and warns if any line exceeds 122 characters.

### 2. Update Live Telemetry
To fetch live GitHub repository statistics and rebuild the telemetry panel:
```bash
# Optional: set GITHUB_TOKEN to avoid rate limits
export GITHUB_TOKEN="ghp_xxx"
python3 tools/telemetry.py
```

### 3. Play Games via CLI
You can test the interactive games locally:
```bash
# Re-render all game SVGs
python3 -m games.run --render-all

# Play cell 4 in Tic-Tac-Toe
python3 -m games.run --game ttt --move 4 --player "Ekansh"

# Reset Tic-Tac-Toe
python3 -m games.run --game ttt --move reset

# Play an opening move in Chess
python3 -m games.run --game chess --move e4 --player "Ekansh"

# Reset Chess board
python3 -m games.run --game chess --move reset
```

---

## 5. GitHub Actions Automation

1. **`game.yml`:** Triggers when visitors open an issue titled `game|<game>|<move>`. It parses the move, executes it against the bot, regenerates SVG assets, commits the changes with `[skip ci]`, and closes the issue with a status comment.
2. **`telemetry.yml`:** Runs daily at 06:00 UTC (and via manual dispatch) to poll GitHub repo languages and recalculate development velocity.
3. **`snake.yml`:** Runs nightly at midnight UTC to regenerate the animated contribution snake and deploy to the `output` branch.
