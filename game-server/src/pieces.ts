/**
 * Geometric monochrome chess pieces, drawn for this project (public domain / CC0).
 * No Unicode chess glyphs and no web fonts: every shape is a plain path or primitive in a
 * 44x44 view box, so rendering is identical in every browser and font stack.
 *
 * White pieces are stroked outlines, black pieces are filled silhouettes; the colour comes
 * from the wrapper <g> (server) or CSS (the /play page).
 */

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export const PIECE_SHAPES: Record<PieceType, string> = {
  p: '<circle cx="22" cy="15.4" r="4.1"/><path d="M16.9 31.4h10.2l-2-7.5h-6.2z"/><rect x="13.9" y="32.2" width="16.2" height="2.8" rx="1.4"/>',
  n: '<path d="M27.2 11.2 29.4 17.2 33.6 19.2 30.6 25.2 32.4 33.6H13.6L15.4 26.6 21.4 19.4 19.8 13.2Z"/><rect x="12.6" y="33.4" width="18.8" height="2.9" rx="1.4"/>',
  b: '<circle cx="22" cy="11.6" r="2.1"/><path d="M22 15.4c4.1 3.5 6.3 6.6 6.3 9.6 0 2.6-2.8 4.3-6.3 4.3s-6.3-1.7-6.3-4.3c0-3 2.2-6.1 6.3-9.6z"/><rect x="15.3" y="29.9" width="13.4" height="2.6" rx="1.3"/><rect x="13.6" y="33.4" width="16.8" height="2.8" rx="1.4"/>',
  r: '<path d="M14.2 13h3.4v2.6h3.6V13h1.6v2.6h3.6V13h3.4v6l-2.9 2.4v9.2l2.9 2.4v1.4H14.2v-1.4l2.9-2.4v-9.2L14.2 19z"/>',
  q: '<circle cx="13" cy="16.2" r="2"/><circle cx="22" cy="11.8" r="2.2"/><circle cx="31" cy="16.2" r="2"/><path d="M12.6 18.4 17.4 30.6h9.2l4.8-12.2-6 4.6L22 14.6l-3.4 8.4z"/><rect x="13.2" y="31.8" width="17.6" height="3" rx="1.5"/>',
  k: '<path d="M22 8.4v6.2M18.9 11.5h6.2" stroke-width="2.2"/><path d="M12.8 19.2 17.6 30.6h8.8l4.8-11.4-5.8 4.4L22 15.4l-3.4 8.2z"/><rect x="13.4" y="31.8" width="17.2" height="3" rx="1.5"/>',
};

export const PIECE_NAMES: Record<PieceType, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** The transform that keeps a piece clear of the coordinate labels in a 44x44 tile. */
export const PIECE_TRANSFORM = "translate(6.2 5.6) scale(0.72)";

export function isPieceType(v: string): v is PieceType {
  return v === "p" || v === "n" || v === "b" || v === "r" || v === "q" || v === "k";
}

/** Server-side piece markup, coloured from the palette (outline = white, solid = black). */
export function pieceSvg(type: PieceType, color: "w" | "b", ink: string): string {
  const paint =
    color === "w"
      ? `fill="none" stroke="${ink}" stroke-width="1.9"`
      : `fill="${ink}" stroke="${ink}" stroke-width="1.1"`;
  return `<g ${paint} stroke-linejoin="round" stroke-linecap="round" transform="${PIECE_TRANSFORM}">${PIECE_SHAPES[type]}</g>`;
}
