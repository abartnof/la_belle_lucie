// From cassino web3d/src/faces.js @ 73f0cd7
// From piquet web3d/src/faces.js @ 254cb3c; cassino's change is the strip
// (below).
// The Jumbo Index faces: for a phone, where a fanned hand shows each card
// only by its corner, faces that are nothing but index -- the rank large in
// the platform's bold UI font (San Francisco on an iPhone), the suit larger
// beneath it, on one axis, at the top left; and right of it, for the
// table, the rank over the suit again, as large as the card holds. Drawn here with
// Canvas 2D, so no font is bundled or fetched.
//
// From the user's own recipe (1 October 2026), kept as given in the commit
// that brought it, d2507ac. What differs, for the table: the face is paper
// from edge to edge, because the table's ink line draws every card's edge
// and rounds its corners (the classic art has no border either); the faces
// are drawn at the classic art's width for the screen (art.js); and, at the
// user's word (2 October), the index is fitted into the strip of each card
// a fanned hand shows, rather than drawn at the recipe's sizes and covered:
// "make the font on each card *just* big enough to be seen in that space,
// with a smidge of space on either side (a handful of pixels)".
//
// Settings calls them "Large Text (Optimized for smaller screens)" (the
// user's words). They are the default on phones and tablets, the classic
// faces on computers; Settings can choose either anywhere, and the change is
// live.

import { CanvasTexture } from "three";
import { cardTexture } from "./materials.js";

// All lengths in card units: the card is 7 wide by 9.8 tall, the 5:7 of the
// classic art.
export const JUMBO = Object.freeze({
  w: 7,
  h: 9.8,
  paper: "#fbfaf6",
  ink: "#15171c",
  red: "#c8202c",
  rankTop: 0.3, // y of the top of the rank's capitals
  rankSize: 2.2, // the recipe's sizes, one for every rank and one for every
  suitSize: 2.8, // suit: the most either is drawn at
  gap: 0.3, // between the rank's capitals and the suit's ink, at the recipe's sizes
  // What a full hand fanned on a phone shows of each card: a strip this
  // wide at its left, all down the index (faces.test.js measures it). The
  // index is fitted into it with `margin` clear either side -- about 3.5 px
  // on a phone -- so no rank or suit is ever under the next card (the user:
  // "shrink the card graphics to be visible within that space (with a few
  // pixels at least of space on the side, for visibility's sake)").
  // Cassino's change: its hand of four shows at least 3.0 units of each card
  // on a phone (faces.test.js measures it), so the strip is 2.9, and the
  // index reaches the recipe's own sizes: legible on the table's cards too.
  strip: 2.9,
  margin: 0.25,
  // The sixth play-testing: on an iPhone the table's cards were "still too
  // small to read". A card on the screen is never read upside down, so the
  // face has no turned corner (the user's choice); and in the room right of
  // the strip the corner is fitted to -- clear of it across the card (the
  // user: "put it in that 3/4, so that it does not overlap on the X axis
  // with the top left card value") -- a big rank over a big suit, for the
  // table, where all of a card shows: `margin` from the card's edges, `gap`
  // between them.
  big: Object.freeze({ margin: 0.3, gap: 0.3 }),
});

const RANK_FONT = "-apple-system, system-ui, sans-serif";
const SUIT_FONT = '"Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", system-ui, sans-serif';
// U+FE0E asks for the text glyph, so hearts and diamonds never turn into
// colour emoji.
const GLYPH = { S: "♠︎", H: "♥︎", D: "♦︎", C: "♣︎" };
const COLOUR = { S: JUMBO.ink, C: JUMBO.ink, H: JUMBO.red, D: JUMBO.red };

// Where Large Text is the automatic choice: a phone or a tablet, whose main
// pointer is a touch screen (play-testing: "on an ipad, default to
// large-view cards"). iPadOS's Safari says it is a Mac, and may say its
// pointer is fine; its touch points tell it from one. A computer with a
// touch screen and a mouse keeps the classic faces.
export function largeTextByDefault({ coarse, mac = false, touchPoints = 0 }) {
  return !!coarse || (mac && touchPoints > 1);
}

export function largeTextHere() {
  const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const mac = /Mac/.test(navigator.platform ?? "") || /Macintosh/.test(navigator.userAgent ?? "");
  return largeTextByDefault({ coarse, mac, touchPoints: navigator.maxTouchPoints ?? 0 });
}

// The faces to show for the setting: automatic is Jumbo Index on a phone or
// a tablet, classic elsewhere.
export function facesFor(choice, touch) {
  if (choice === "classic" || choice === "jumbo") return choice;
  return touch ? "jumbo" : "classic";
}

export const rankAndSuit = (code) => [code[0] === "T" ? "10" : code[0], code[1]];

// The sizes that fit the strip, in units: the rank's, the largest at which
// every one-character rank fits -- the 10, twice as wide, runs under the next
// card, and its 1 says what it is (the user: "don't worry about 10, there is
// no 1 so it's obvious when you're looking at 10") -- and the suit's, the
// largest at which every suit's ink fits. Measured in whatever fonts the
// system has.
function fitted(ctx) {
  const room = JUMBO.strip - 2 * JUMBO.margin;
  const widest = (font, texts) => {
    ctx.font = font;
    return Math.max(...texts.map((t) => {
      const m = ctx.measureText(t);
      return m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    }));
  };
  const rank = Math.min(JUMBO.rankSize, (100 * room) / widest(`700 100px ${RANK_FONT}`, ["7", "8", "9", "J", "Q", "K", "A"]));
  const suit = Math.min(JUMBO.suitSize, (100 * room) / widest(`100px ${SUIT_FONT}`, Object.values(GLYPH)));
  // The rank's capitals, and the tallest suit's ink.
  const tall = (font, texts) => {
    ctx.font = font;
    return Math.max(...texts.map((t) => {
      const m = ctx.measureText(t);
      return m.actualBoundingBoxAscent + (m.actualBoundingBoxDescent ?? 0);
    }));
  };
  const cap = tall(`700 100px ${RANK_FONT}`, ["H"]) / 100;
  const suitInk = tall(`100px ${SUIT_FONT}`, Object.values(GLYPH)) / 100;
  // The big rank and suit, one size for every card: the suit's ink as tall
  // as the rank's capitals, the widest one-character rank and the widest
  // suit each within the room right of the strip, the two of them one over
  // the other within the card's height (a 10 is narrowed to the room).
  const { margin, gap } = JUMBO.big;
  const singles = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "J", "Q", "K"];
  const rankWide = widest(`700 100px ${RANK_FONT}`, singles) / 100;
  const suitPer = cap / suitInk; // the suit's size for each unit of the rank's
  const suitWide = (widest(`100px ${SUIT_FONT}`, Object.values(GLYPH)) / 100) * suitPer;
  // The deepest any rank dips below the line (a J in some fonts).
  ctx.font = `700 100px ${RANK_FONT}`;
  const dip = Math.max(0, ...singles.map((t) => ctx.measureText(t).actualBoundingBoxDescent ?? 0)) / 100;
  const left = JUMBO.strip;
  const width = JUMBO.w - margin - left;
  const size = Math.min(width / rankWide, width / suitWide, (JUMBO.h - 2 * margin - gap) / (2 * cap + dip));
  const big = { rank: size, suit: size * suitPer, cap: cap * size, dip: dip * size, left, width };
  return { room, rank, suit, axis: JUMBO.margin + room / 2, big };
}

// One corner: the rank's capitals from rankTop, centred in the strip; the
// suit placed by its measured ink -- its top a gap below the rank, its
// centre under the rank's -- so the four suits line up whatever symbol font
// the system has.
function corner(ctx, u, rank, suit, fit) {
  ctx.fillStyle = COLOUR[suit];
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${fit.rank * u}px ${RANK_FONT}`;
  const cap = ctx.measureText("H").actualBoundingBoxAscent;
  // A 10 is centred as one character would be on its 1, and runs on.
  const wide = rank.length > 1;
  ctx.textAlign = wide ? "left" : "center";
  const left = wide ? (fit.axis - fit.room / 2) * u : fit.axis * u;
  ctx.fillText(rank, left, JUMBO.rankTop * u + cap);

  ctx.font = `${fit.suit * u}px ${SUIT_FONT}`;
  ctx.textAlign = "left";
  const glyph = GLYPH[suit];
  const m = ctx.measureText(glyph);
  const inkLeft = -m.actualBoundingBoxLeft;
  const inkRight = m.actualBoundingBoxRight;
  const suitTop = JUMBO.rankTop * u + cap + JUMBO.gap * (fit.rank / JUMBO.rankSize) * u;
  ctx.fillText(glyph, fit.axis * u - (inkLeft + inkRight) / 2, suitTop + m.actualBoundingBoxAscent);
}

// The big rank over the big suit, each centred in the room right of the
// strip, the two together centred on the card's height, the suit below
// whatever the rank inks; a 10 narrowed to the room.
function large(ctx, u, rank, suit, fit) {
  const { big } = fit;
  const centre = (big.left + big.width / 2) * u;
  const top = ((JUMBO.h - 2 * big.cap - big.dip - JUMBO.big.gap) / 2) * u;
  ctx.fillStyle = COLOUR[suit];
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `700 ${big.rank * u}px ${RANK_FONT}`;
  const r = ctx.measureText(rank);
  const rankInk = r.actualBoundingBoxLeft + r.actualBoundingBoxRight;
  const narrow = Math.min(1, (big.width * u) / rankInk);
  const rankLeft = centre - (rankInk * narrow) / 2;
  const baseline = top + big.cap * u;
  if (narrow < 1) {
    ctx.save();
    ctx.scale(narrow, 1);
    ctx.fillText(rank, (rankLeft + r.actualBoundingBoxLeft * narrow) / narrow, baseline);
    ctx.restore();
  } else ctx.fillText(rank, rankLeft + r.actualBoundingBoxLeft, baseline);
  ctx.font = `${big.suit * u}px ${SUIT_FONT}`;
  const glyph = GLYPH[suit];
  const g = ctx.measureText(glyph);
  const suitInk = g.actualBoundingBoxLeft + g.actualBoundingBoxRight;
  const inkTop = baseline + Math.max(0, r.actualBoundingBoxDescent ?? 0) + JUMBO.big.gap * u;
  ctx.fillText(glyph, centre - suitInk / 2 + g.actualBoundingBoxLeft, inkTop + g.actualBoundingBoxAscent);
}

// The face of the card `code` ("TH", "AS", ...) on a 2D context `width`
// pixels wide and 1.4 times as tall: the corner at the top left, and the
// big rank and suit right of it.
export function drawJumbo(ctx, width, code) {
  const [rank, suit] = rankAndSuit(code);
  const u = width / JUMBO.w;
  const height = JUMBO.h * u;
  ctx.fillStyle = JUMBO.paper;
  ctx.fillRect(0, 0, width, height);
  const fit = fitted(ctx);
  corner(ctx, u, rank, suit, fit);
  large(ctx, u, rank, suit, fit);
}

// The 32 faces as textures, keyed by the table's codes, `width` pixels wide.
export function jumboTextures(codes, { width, anisotropy = 1 }) {
  return Object.fromEntries(
    codes.map((code) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.round((width * JUMBO.h) / JUMBO.w);
      drawJumbo(canvas.getContext("2d"), width, code);
      return [code, cardTexture(new CanvasTexture(canvas), anisotropy)];
    }),
  );
}
