// From cassino web3d/src/hud.js @ 73f0cd7 (the model half, made generic)
// The scoring model a counting game shares: the per-hand ledger and the
// popups a hand's count brings, parameterised by the game's definition.
// Cassino's hud.js had its six categories, its 21 and its event names built
// in; here the game supplies them (README.md, "The score HUD"):
//
//   defineGame({
//     categories: [[key, ledgerLabel], ...],   // in the counting order
//     target: 21,                              // points to win: the line's length
//     line(l) -> { side, cat, pts },           // a count line, read ("you" | "opp")
//     popup?(l, i, lines, info) -> { pts, label } | null,
//                                              // what a line tells; null: nothing
//     cards?(l, i, lines) -> [code, ...],      // the cards it turns up
//     scale?: 1,                               // units to a point (3: thirds)
//     format?(units, cat?) -> string,          // how a value reads ("35⅔")
//     lit?(units) -> n,                        // segments lit by a score (default: whole points;
//                                              // 107 thirds, 35 2/3, reaches the finish of 36: units+1)
//     total?: 70,                              // points in play, for the goal text
//     apart?: ["bonus"],                       // categories paid beside the count: listed and shown
//                                              // in the ledger, but in no total, segment or subtotal
//     goal?: "to 21",                          // the target as the HUD says it
//     names?: { you, opp },
//     words?: { ... }                          // the HUD's own words (hud.js)
//   })
//
// Values are whole numbers of units: a game scoring in thirds passes
// scale 3 and keeps every score an integer count of thirds, so sums are
// exact and `format` alone decides how they read.

export const defaultNames = Object.freeze({ you: "You", opp: "Opp" });

export function defineGame(def) {
  if (!Array.isArray(def.categories) || def.categories.length === 0) throw new Error("a game needs its categories, in order");
  const keys = def.categories.map(([k]) => k);
  const twice = keys.find((k, i) => keys.indexOf(k) !== i);
  if (twice !== undefined) throw new Error(`category ${twice} is listed twice`);
  if (!(def.target > 0)) throw new Error("a game needs a target above 0");
  if (typeof def.line !== "function") throw new Error("a game needs `line`, which reads a count line into { side, cat, pts }");
  const scale = def.scale ?? 1;
  if (!(Number.isInteger(scale) && scale >= 1)) throw new Error("scale is a whole number of units to a point");
  const apart = def.apart ?? [];
  const unknown = apart.find((k) => !keys.includes(k));
  if (unknown !== undefined) throw new Error(`apart names a category the game does not list: ${unknown}`);
  const labelOf = Object.fromEntries(def.categories);
  return Object.freeze({
    categories: Object.freeze(def.categories.map(([k, l]) => Object.freeze([k, l]))),
    target: def.target,
    segments: def.segments ?? def.target,
    total: def.total ?? null,
    apart: Object.freeze([...apart]),
    scale,
    format: def.format ?? ((units) => String(units / scale)),
    // Strohmandeln kit change: how many segments a score lights. Whole points
    // by default; a game whose finish is reached part-way through a point
    // (36 of 70 is 35 2/3) says so.
    lit: def.lit ?? ((units) => Math.floor(units / scale)),
    goal: def.goal ?? `to ${def.target}`,
    names: Object.freeze({ ...defaultNames, ...def.names }),
    words: Object.freeze({ ...def.words }),
    line: def.line,
    labelOf: (cat) => labelOf[cat],
    // What a line tells; without a reader, each line tells itself.
    popup: def.popup ?? ((l, i, lines, info) => ({ pts: info.pts, label: labelOf[info.cat] })),
    cards: def.cards ?? (() => []),
  });
}

// ---- the ledger ------------------------------------------------------------

export const blank = (game) => Object.fromEntries(game.categories.map(([k]) => [k, { you: 0, opp: 0 }]));
export const handTotal = (game, h, side) => game.categories.reduce((sum, [k]) => (game.apart.includes(k) ? sum : sum + h[k][side]), 0);

// A line, read by the game and checked against its categories.
function read(game, l) {
  const info = game.line(l);
  if (!game.categories.some(([k]) => k === info.cat)) throw new Error(`a count line in a category the game does not list: ${info.cat}`);
  if (info.side !== "you" && info.side !== "opp") throw new Error(`a count line's side is "you" or "opp", not ${info.side}`);
  return info;
}

// One counted hand's ledger from its count's lines.
export function countLedger(game, lines) {
  const h = blank(game);
  for (const l of lines) {
    const { side, cat, pts } = read(game, l);
    h[cat][side] += pts;
  }
  return h;
}

// Both sides' totals over the counted hands and the hand under way, if any.
export function ledgerTotals(game, { hands, live }) {
  const all = live ? [...hands, live] : hands;
  return { you: all.reduce((s, h) => s + handTotal(game, h, "you"), 0), opp: all.reduce((s, h) => s + handTotal(game, h, "opp"), 0) };
}

// Where a segment (1-based) stands against a score: reached, the cursor
// ("where I am"), or unreached. A score in units of 1/`scale` of a point
// lights its whole points. Past `end` the line stops: the finish is the cursor.
export function segmentState(n, score, end = 21, scale = 1, lit = null) {
  const s = Math.min(end, lit ? lit(score) : Math.floor(score / scale));
  return n < s ? "reached" : n === s ? "cursor" : "unreached";
}

// ---- the count's popups ------------------------------------------------------

// The popup a line brings, or null: { side, cat, pts, label }.
function popupFor(game, lines, i) {
  const info = read(game, lines[i]);
  const told = game.popup(lines[i], i, lines, info);
  return told ? { side: info.side, cat: info.cat, pts: told.pts ?? info.pts, label: told.label ?? game.labelOf(info.cat) } : null;
}

// Whose popup each line of a count brings ("you", "opp"), or null. The count
// is paced by this (countSchedule): a player's next popup waits for the last,
// and each comes as its line is said.
export function popupsOf(game, lines) {
  return lines.map((_, i) => popupFor(game, lines, i)?.side ?? null);
}

// The scoring events of a count to play out: a popup for each told line
// { side, cat, label, pts, at, line, hand, cards }, `at` the scoring event's
// index, `line` the line to show it with; and { end: true, at, line, hand }
// once the hand's count has been said.
export function countEvents(game, lines, { at, hand }) {
  const out = [];
  lines.forEach((l, i) => {
    const p = popupFor(game, lines, i);
    if (p) out.push({ ...p, at, line: i, hand, cards: game.cards(l, i, lines) });
  });
  out.push({ end: true, at, line: lines.length, hand });
  return out;
}

// ---- the ledger's list --------------------------------------------------------

export const LINE_H = 22; // a category's line in a hand's block, in px (css .hud-ln)
export const HAND_FOOT = 38; // its subtotal (30) and the gap after it (8)
// A hand's block in the list: a line a category and its subtotal.
export const handHeight = (game) => game.categories.length * LINE_H + HAND_FOOT;
export const HAND_H = 6 * LINE_H + HAND_FOOT; // six categories: 170
// The ledger's own rules, heads and total, round its list.
export const PANEL_CHROME = 90;

// The ledger's list, in px: all of its `hands` (each `hand` px tall), or as
// tall as the `room` the page measures for the whole ledger allows, less its
// chrome, scrolling past it (the seventh play-testing: the score "collides
// with the bottom drawer"); with no room, only the totals.
export function listHeight(hands, room, hand = HAND_H) {
  return Math.max(0, Math.min(hands * hand, room - PANEL_CHROME));
}
