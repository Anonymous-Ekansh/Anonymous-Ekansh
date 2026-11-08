# Asset licences

## Chess pieces — Cburnett

`game-server/src/pieces.ts` draws the chess pieces from the **Cburnett** set, the default set on
Lichess.

- Source: <https://github.com/lichess-org/lila/tree/master/public/piece/cburnett>
- Author: Colin M.L. Burnett
- Licence: **CC BY-SA 3.0** — <https://creativecommons.org/licenses/by-sa/3.0/>

The artwork is used under that licence: attribution is given here, in the README next to the
arena block, and in the `/play` page footer, and this project's distribution of the pieces stays
under the same licence (share-alike). The path data is unmodified; only the ink colours are
applied at render time so one set works in both the light and the dark theme.

No other binary assets are stored in this repository: every board, banner, button and mark is an
SVG generated at request time by the Worker.

## Everything else

The worker source, the geometric board/mark artwork, the generator and the README block are
original work released with the repository. Third-party code is limited to `chess.js`
(BSD-2-Clause) and the tooling in `package.json`.
