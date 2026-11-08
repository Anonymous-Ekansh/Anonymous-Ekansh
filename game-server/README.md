# ARENA — a Cloudflare Worker that renders two shared game boards as SVG tiles

Two boards live on one Worker and one D1 row each. Every tile is generated from the current
stored state, so a profile README is just `<img>` tags: no JavaScript, no sagas, no issue
templates. A "move" is a plain link (`/t/click/4`, `/c/click/e4`) that plays the move and
bounces the visitor back to the profile.

- Tic-tac-toe — visitor is X, bot is O, per-visitor game, board stays until `/t/new`.
- Community chess — one shared board, White and Black alternate between visitors.
- `/play` — a full-screen page with a real board, drag and drop, and keyboard support.

## Deploy

```bash
cd game-server
npm install
npx wrangler login                                        # signs in to Cloudflare
npx wrangler d1 create arena                              # prints a database_id
#   paste that id into wrangler.toml -> [[d1_databases]].database_id
npx wrangler d1 execute arena --file=schema.sql --remote   # creates + seeds the rows
npx wrangler deploy                                       # prints https://arena.<you>.workers.dev
```

`wrangler d1 create arena` creates the database *named* `arena`; the Worker sees it as the
`DB` binding declared in `wrangler.toml`. Deploying without the `database_id` filled in fails
fast rather than serving read-only defaults.

Optional secret (recommended): `npx wrangler secret put RATE_SALT`. It salts the cookie and IP
hashes used for rate limiting. Without it the Worker uses a fixed published salt, which still
means no raw IP or cookie value is ever stored, but it is not a secret. No secrets are in this
repo.

Then, from the repository root:

```bash
python3 -c 'import json,pathlib; p=pathlib.Path("profile.json"); d=json.loads(p.read_text()); d["worker_url"]="https://arena.<you>.workers.dev"; p.write_text(json.dumps(d, indent=2, ensure_ascii=False)+"\n")'
python3 tools/build_arena.py        # paste the printed block into README.md
```

`tools/build_arena.py` only prints; it never rewrites a file and emits no markers.

## Routes

| Route | What it does |
| --- | --- |
| `GET /t/tile/:i.svg?theme=light\|dark` | tile 0..8 of the current tic-tac-toe board |
| `GET /t/click/:i` | play X on tile `i`, bot replies, `302 -> profile` |
| `GET /t/new` | new game, only when the current one is over, `302 -> profile` |
| `GET /t/status.svg?theme=` | `your move — you are X, the bot is O` + the record |
| `GET /c/tile/:sq.svg?theme=` | one chess square, `a1..h8`, with pieces, tints and hints |
| `GET /c/click/:sq` | select / move / deselect / change selection, `302 -> profile` |
| `GET /c/status.svg?theme=` | `White to move · game #3 · last: Nf3` + the record |
| `GET /c/recent.svg?theme=` | the last five moves |
| `GET /play` | the full-screen page |
| `GET /api/state` | JSON snapshot of both boards (polled every 3 s by `/play`) |
| `POST /api/move` | `{game:"chess", from, to}` or `{game:"ttt", cell}` / `{new:true}` |

Unknown or out-of-range parameters (`/t/tile/9.svg`, `/c/tile/z9.svg`, `/c/click/e9`) are a
404, not a redirect.

## Storage

One table, two rows:

```sql
CREATE TABLE state (kind TEXT PRIMARY KEY, json TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL);
-- kind = 'ttt' | 'chess'
```

- Every request does **one** read of the row it needs (`/api/state` reads both in a single
  `IN (...)` query).
- Writes only happen when state actually changes, via compare-and-swap:

  ```sql
  UPDATE state SET json = ?, version = ?, updated_at = ? WHERE kind = ? AND version = ?
  ```

  `changes = 0` means another isolate won the race; that write is dropped and the other
  board stands. No lost updates, no interleaved boards, no extra round trips.

## Image responses

```
Content-Type: image/svg+xml; charset=utf-8
Cache-Control: no-cache, max-age=0, must-revalidate
ETag: "<kind>-<version>-<theme>-<square>"
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'
```

`If-None-Match` matching the current ETag gets a 304, so a revisiting browser revalidates
cheaply but never shows a stale board. Redirects are `302` with `Cache-Control: no-store`,
and the profile target carries `?arena=<game>&v=<version>` so a replayed redirect cannot
hand back a cached profile page.

## Abuse control (moves are GET links, so this matters)

1. **Fetch metadata.** `/t/click`, `/t/new` and `/c/click` require `Sec-Fetch-Dest: document`
   and `Sec-Fetch-Mode: navigate`. An `<img>`, an `<iframe>` with `no-cors`, a `fetch()` or a
   script embed all send something else and get `403`. If the headers are absent (privacy
   browsers) the request is allowed but still rate limited.
2. **User agent screen.** Crawlers, unfurlers, link previews, monitoring probes and HTTP
   clients are rejected; a missing or 11-character UA counts as a bot.
3. **Visitor cookie.** The first move click mints `vid`: 128 random bits, sent as
   `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000` (30 days) from the Worker origin.
   Only its salted SHA-256 prefix (20 hex characters) is ever used or stored, so one person is
   one visitor even behind a shared address.
4. **Per-visitor cooldown and the chess turn rule.** Both key on that hash: one move per 5
   seconds (selection clicks get 1 second), and the last mover's hash is stored in the chess
   row so the same visitor cannot play both White and Black in a row. A second cookie on the
   same address still can.
5. **Hashed-IP bot cap.** The only IP-based limit: 30 moves per hour per salted, daily-rotating
   `CF-Connecting-IP` hash. Normal play behind NAT never reaches it. When the cookie is absent
   (cookies disabled) the hashed IP also stands in for the cooldown and the turn rule.
6. **Strict parameters.** `/^[0-8]$/` and `/^[a-h][1-8]$/` before any work; nothing from a
   query string or header is echoed into a tile (status text is generated, XML is escaped).
   The `Referer` is never read.

The rate limiter lives in module memory, so it is per isolate: Cloudflare runs many isolates,
and a determined attacker spread across colos gets more attempts than 1/5 s globally. That is
a deliberate trade (zero extra D1 reads per request); the fetch-metadata gate is the real
defence, and it cannot be forged by an `<img>`.

## Chess rules and the shared board

`chess.js@1.4.0` (BSD-2-Clause) does the rules: legal moves, check, mate, stalemate,
insufficient material, threefold repetition and the fifty-move rule.

- No selection: clicking a piece of the side to move with at least one legal move selects it
  for 90 seconds.
- Same square: deselect. Legal destination: play it, pawns auto-queen.
- Another own piece: move the selection. Anything else: ignore.
- After mate/stalemate/draw the record is updated, the result is stored, and a fresh game is
  started immediately; the status banner shows `white wins · checkmate` until the next move
  or the "new game" button.

## The `/play` page

One HTML file served by the Worker — no framework, no build step, monochrome monospace, light
and dark from `prefers-color-scheme`, `prefers-reduced-motion` respected. It polls
`/api/state` every 3 s and pauses while the tab is hidden; moves go to `POST /api/move`.

Board squares are real `<button>`s with roving `tabindex`: arrow keys move focus, Enter or
Space selects, Escape clears, click and HTML5 drag-and-drop also work. Status text lives in
`aria-live="polite"` regions. `chess.js` is pinned at `1.4.0` on jsDelivr and fetched with a
Subresource Integrity hash, so the browser rejects a tampered file; if the CDN is unreachable
the board still renders from the server FEN and the server still validates every move.

## Tests

```bash
cd game-server
npm test            # vitest: ttt, chess, rate limiter, router
npm run typecheck   # tsc --noEmit
```

Covers: win / loss / draw / taken tile / click after game over, legal and illegal moves,
wrong colour, selection expiry, promotion, checkmate, stalemate, new game after a result, the
visitor cookie, two cookies alternating on one IP, the same-cookie turn rule, the 5-second
cooldown, the 30-moves-per-hour IP cap, the UA and fetch-metadata screens, ETag 304, the 302 to
the profile, an `<img>` embed rejection, and the JSON API.

## Notes and limits

- GitHub serves README images through its Camo proxy, which caches for a while. The ETag makes
  a browser revalidate every time, but Camo's own cache can delay the README by minutes. The
  `/play` page is the instant view; that is why it exists.
- The board tiles are square, so a `62%` column of an 880 px README (~545 px) holds the 8×44 px
  board with room to spare, and the 3×72 px tic-tac-toe board fits the `38%` column (~334 px).
- Chess pieces are drawn for this project — plain paths and primitives in a 44×44 view box,
  no Unicode glyphs and no font dependency. Released as CC0 / public domain.
