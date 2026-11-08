# Asset licences

## Chess pieces — `game-server/src/pieces.ts`

The twelve piece bodies are the **Cburnett** chess set, the default set on Lichess and the
most widely used free set on Wikimedia Commons.

- Author: Colin M.L. Burnett
- Source: <https://github.com/lichess-org/lila/tree/master/public/piece/cburnett>
- Licence: **CC BY-SA 3.0** — <https://creativecommons.org/licenses/by-sa/3.0/>
- Changes: recoloured at render time (fills, strokes and detail lines) for the light and dark
  palettes. The geometry is unmodified.

Attribution appears in three places: this file, the README footer under the arena table
(`pieces: Cburnett, CC BY-SA 3.0`) and `game-server/README.md`.

CC BY-SA 3.0 permits commercial and non-commercial reuse of the artwork as long as the
attribution stays and derivative artwork is shared under the same licence. Keeping the
pieces in a public profile repository under those terms is fine; it would not be fine to
present the set as original work.

## Tic-tac-toe marks — `game-server/src/brushes.ts`

Original geometry, generated from scratch in this repository (filled paths with tapered
brush ends, three variants per mark). No bitmap was traced and no Unicode glyph is used.
Released with the rest of the repository.

## Everything else

The panels in `assets/`, the game boards and the Worker's chrome are original work for this
profile.
