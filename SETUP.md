# Anonymous-Ekansh Profile System — Setup & Architecture Guide

A minimalist, editorial monochrome GitHub profile README for **Anonymous-Ekansh** (repo `Anonymous-Ekansh/Anonymous-Ekansh`, branch `main`): every panel is a hand-built SVG rendered from one JSON file, live numbers arrive from the GitHub GraphQL API, and the interactive boards are served by a Cloudflare Worker.

---

## 1. System Architecture

```
                      profile.json  ──────────────┐   (copy, content, starter numbers)
                           │                      │
                           ▼                      ▼
                 tools/build_assets.py     tools/telemetry.py
                           ▲                      │  GitHub GraphQL API
                           │  build_all()         ▼
                           └──────────────  assets/telemetry.json
                           │
                  assets/*.svg  +  assets/dark/*.svg
                           │
                           ▼
                       README.md   (each panel embedded as a <picture> pair)
```

### Core tenets
1. **Single source of truth.** Copy, dates, stacks, focus items and starter numbers live in `profile.json`. The only exception is `assets/telemetry.json`, which is machine-written by the daily workflow.
2. **Dual-theme baking.** Every panel exists twice — `assets/X.svg` (light) and `assets/dark/X.svg` (dark) — with colours baked in. No CSS variables, no dark-mode caching artifacts.
3. **Live data never fabricates.** If the API call fails, `tools/telemetry.py` keeps the previous `assets/telemetry.json` and rebuilds from it. An empty series renders as a dotted baseline and `awaiting first live run`, never as zeros.
4. **Idempotent by construction.** Re-running the generator produces byte-identical SVGs.
5. **Standard library only.** Both Python tools run on a bare Python 3.11 with no packages.

---

## 2. Design System

### Palettes
| Token | Light | Dark | Role |
| :--- | :--- | :--- | :--- |
| **bone** | `#333333` | `#E6E6E6` | Body text, titles, numerals |
| **muted** | `#777777` | `#8C8C8C` | Descriptions, labels, dates |
| **dim** | `#9A9A9A` | `#666666` | Captions, prompt markers, trailing dots |
| **rule** | `#C4C4C4` | `#3A3A3A` | Dividers, borders, baselines |
| **accent** | `#000000` | `#FFFFFF` | Emphasis, first-entry dot, last sparkline point, cursor |
| **ghost** | `#D4D4D4` | `#2C2C2C` | Section watermark numbers `01`–`07` |

### Typography & canvas
- **Font:** `ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace`
- **Canvas:** `viewBox 0 0 1000 H`, content bounded between `x=48` and `x=952`.
- **Pitch:** experience rows 74 px, stack rows 32 px, telemetry language rows 32 px, counters 58 px.

### Panels
| Panel | Height | Layout |
| :--- | :--- | :--- |
| `telemetry.svg` | 330 | three columns split by faint rules at `x=360` / `x=688`: language bars → 12-month sparkline → four counters |
| `experience.svg` | 606 | date at `x=48`, rule + dot at `x=196`, title at `x=222`, one description line below |
| `stack.svg` | 320 | label at `x=48`, rule at `x=138`, value at `x=154` |
| `focus.svg` | 454 | thin-bordered terminal window, `NOW.YML` in the title bar, 0.09 s stagger |
| `footer.svg` | 110 | pulsing status dot, tagline, right-aligned location/© |

### Motion
`rise` (0.7 s), `fade` (0.6 s), `line-draw` (1.4 s), `bar` grow (1.2 s), `spark` draw (2.2 s), blinking block cursor, pulsing dot. Every panel carries a `prefers-reduced-motion: reduce` block that disables all of it and locks opacity to 1.

---

## 3. Directory Layout

```
.
├── .github/workflows/
│   ├── game.yml          # issue-triggered game runner (legacy boards, kept working)
│   ├── snake.yml         # nightly contribution grid snake → output branch
│   └── telemetry.yml     # daily GraphQL telemetry refresh + panel rebuild
├── assets/
│   ├── telemetry.json    # machine-written live numbers (committed)
│   ├── *.svg             # light panels
│   ├── dark/*.svg        # dark panels
│   └── games/            # legacy Python-rendered boards
├── game-server/          # Cloudflare Worker: the live chess + tic-tac-toe arena
├── games/                # Python game engines used by game.yml
├── tools/
│   ├── build_assets.py   # profile.json (+ telemetry.json) → every SVG
│   ├── build_arena.py    # prints the README arena block from profile.json
│   └── telemetry.py      # GitHub GraphQL → assets/telemetry.json → rebuild
├── profile.json
├── requirements.txt      # chess==1.11.2 (game.yml only)
├── SETUP.md
└── README.md
```

---

## 4. Local Commands

```bash
# Every SVG, from profile.json and assets/telemetry.json
python3 tools/build_assets.py

# Live telemetry, then a rebuild
GITHUB_TOKEN=ghp_xxx python3 tools/telemetry.py

# Regenerate the arena block printed to stdout (never written to disk)
python3 tools/build_arena.py            # prints the block; writes nothing

# Game boards (legacy, driven by game.yml)
pip install -r requirements.txt
python3 -m games.run --render-all
python3 -m games.run --game ttt --move 4 --player "Ekansh"
python3 -m games.run --game chess --move e4 --player "Ekansh"

# The same render path the workflow uses
TITLE="admin|render" EVENT_NAME=workflow_dispatch python3 -m games.run
```

`build_assets.py` warns on stderr when a project description line exceeds 122 characters.

---

## 5. Automation

1. **`telemetry.yml`** — daily 06:00 UTC and manual dispatch. Runs `tools/telemetry.py` with `GITHUB_TOKEN`, writes `assets/telemetry.json` (`languages`, `series`, `counters`), rebuilds every panel and commits with `[skip ci]`.
   - Public repo count, language bytes and the 12 monthly contribution sums come from GraphQL.
   - **Private contributions need a PAT**, not the default token: create a classic token with `read:user` and add it as the repository secret `TELEMETRY_TOKEN`, then change the workflow's `GITHUB_TOKEN` line to `secrets.TELEMETRY_TOKEN`. Without it the panel shows public activity only.
   - `LIVE DEPLOYMENTS` is not an API field; set `telemetry.live_deployments` in `profile.json` and the script carries it through.
   - Publishing `assets/telemetry.json` is what makes the panel live; an API failure never empties it.
2. **`snake.yml`** — nightly, on push to `main`, and manual dispatch. `Platane/snk/svg-only@v3` writes two monochrome SVGs (light `000000` / `ebedf0,c4c4c4,9a9a9a,666666,333333`; dark `ffffff` / `161b22,2c2c2c,444444,777777,aaaaaa`) and `crazy-max/ghaction-github-pages@v4` pushes them to the `output` branch, which the README reads through `raw.githubusercontent.com`.
3. **`game.yml`** — legacy issue-driven boards (`game|ttt|4`). The README now embeds the Cloudflare Worker arena instead; keep this workflow only if you still want the issue games.
4. **Worker** — `game-server/` owns `/t/*`, `/c/*`, `/play` and the JSON API. Deploy with `cd game-server && npx wrangler deploy`; the README block is regenerated by `tools/build_arena.py` from `profile.json → worker_url`.

### Analytics cards
Only the streak card is embedded (`streak-stats.demolab.com`, transparent, themed to the palette) because it already carries the total contribution count. The stats card, top-languages card and activity graph were deliberately removed — the local telemetry panel covers that ground with numbers we control.

---

## 6. Publish Checklist

1. Replace the README on `main`; commit `assets/`, `games/`, `tools/`, `profile.json`, `requirements.txt` and all three workflows.
2. **Settings → Actions → General → Workflow permissions → Read and write.**
3. Actions tab: run **Generate Contribution Snake** once, run the game workflow with `admin|render`, run **Update Telemetry** once. Confirm `assets/telemetry.json` and the `output` branch appear.
4. Chess, with a second account: a move is accepted, the issue is commented on and closed, the board updates, the same user cannot move twice in a row, illegal moves are rejected, and the board restarts after mate.
5. Tic-tac-toe: win, loss, draw, and *play again*.
6. Check GitHub in **light and dark** and at mobile width: no horizontal scroll, no stale images (stale tiles resolve by reloading; `/play` exists for the instant view).
7. Security review: issue titles are only read through the workflow's environment, usernames are validated, workflow permissions stay minimal, and no secrets live in the repo.

---

## 7. Known Constraints

- GitHub's image proxy (Camo) caches every embedded SVG; a move can take minutes to appear in the README. `/play` and the JSON API are always current.
- `README.md` images are static `<img>` embeds: no JavaScript, no CSS variables, no external fonts. All motion is SMIL-free CSS inside the SVG itself.
- The telemetry panel falls back to the starter numbers in `profile.json` until the first successful workflow run.
- `streak-stats.demolab.com` is a third-party service; if it is down the card shows a broken image and nothing else changes.
