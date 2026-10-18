// Two stand-in game definitions for the HUD's tests (kit/js/scoring.js): one
// shaped like the game the HUD was worked out in (six categories to 21, a
// category shown as it happens and not again in the count, one category's
// lines told as one popup), and one shaped like Strohmandeln (cards counted
// in threes, scores in exact thirds, 36 of 70). Neither is a real game.

// ---- a category-and-target game: six categories to 21 ----------------------
export const ORDER = [
  ["cards", "Most cards"],
  ["spades", "Most spades"],
  ["big", "Big one"],
  ["little", "Little one"],
  ["aces", "Aces"],
  ["sweeps", "Sweeps"],
];

// The game's own lines: { item, who, points }; `who` is "you" or "them".
const CAT_OF = { cards: "cards", spades: "spades", big_one: "big", little_one: "little", ace: "aces", sweeps: "sweeps" };
const POPUP = { cards: "Most cards", spades: "Most spades", big: "Big one", little: "Little one", aces: "Aces", sweeps: "Sweep" };
const side = (l) => (l.who === "you" ? "you" : "opp");

export const fake = {
  categories: ORDER,
  target: 21,
  line: (l) => ({ side: side(l), cat: CAT_OF[l.item], pts: l.points }),
  // Sweeps were shown as they were made; a side's aces come as one popup at
  // the first ace's line.
  popup(l, i, lines, info) {
    if (info.cat === "sweeps") return null;
    if (info.cat === "aces") {
      if (lines.some((m, j) => j < i && m.item === "ace" && side(m) === info.side)) return null;
      const pts = lines.filter((m) => m.item === "ace" && side(m) === info.side).reduce((s, m) => s + m.points, 0);
      return { pts, label: POPUP.aces };
    }
    return { pts: info.pts, label: POPUP[info.cat] };
  },
  cards: (l) => (l.item === "ace" ? [`A${l.suit}`] : l.item === "big_one" ? ["TD"] : l.item === "little_one" ? ["2S"] : []),
};

// ---- a counting game: cards in threes, thirds of a point, 36 of 70 ---------
// A count line is three cards, worth `thirds` thirds of a point; "bonus"
// lines have no cards of their own.
const THIRDS = "⅓⅔";
export const thirdsFormat = (units) => {
  const whole = Math.floor(units / 3);
  const rest = units % 3;
  return rest === 0 ? String(whole) : `${whole > 0 ? whole : ""}${THIRDS[rest - 1]}`;
};

export const counting = {
  categories: [
    ["count", "Cards counted"],
    ["bonus", "Bonuses"],
  ],
  target: 36,
  total: 70,
  scale: 3,
  format: thirdsFormat,
  goal: "36 of 70 to win",
  line: (l) => ({ side: side(l), cat: l.kind, pts: l.thirds }),
  popup: (l, i, lines, info) => ({ pts: info.pts, label: l.kind === "count" ? "Three cards" : l.name }),
  cards: (l) => l.cards ?? [],
};
