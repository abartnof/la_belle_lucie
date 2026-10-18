// The scoring model any counting game shares: its definition, the per-hand
// ledger, the segments, the count's popups and their sequencing. Everything
// here is parameterised by a game definition (test/fixtures/games.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HAND_H, PANEL_CHROME, blank, countEvents, countLedger, defineGame, handHeight, handTotal, ledgerTotals, listHeight, popupsOf, segmentState,
} from "../js/scoring.js";
import { counting, fake } from "./fixtures/games.js";

const line = (item, who, points, suit = null) => ({ item, suit, who, points });

test("a game is defined by its categories in order, a target and how it reads a count line", () => {
  const g = defineGame(fake);
  assert.deepEqual(g.categories.map(([k]) => k), ["cards", "spades", "big", "little", "aces", "sweeps"]);
  assert.equal(g.target, 21);
  assert.equal(g.segments, 21, "the line has a segment a point of the target");
  assert.equal(g.scale, 1);
  assert.equal(g.format(7), "7");
  assert.deepEqual(g.names, { you: "You", opp: "Opp" });
});

test("a definition without categories, a target or a line reader is refused, saying which", () => {
  assert.throws(() => defineGame({ ...fake, categories: [] }), /categories/);
  assert.throws(() => defineGame({ ...fake, target: 0 }), /target/);
  assert.throws(() => defineGame({ ...fake, line: undefined }), /line/);
  assert.throws(() => defineGame({ ...fake, scale: 0 }), /scale/);
  assert.throws(() => defineGame({ ...fake, categories: [["a", "A"], ["a", "B"]] }), /twice/);
});

test("a blank hand has every category at nothing for both sides; a hand's total is its sum", () => {
  const g = defineGame(fake);
  const h = blank(g);
  assert.deepEqual(Object.keys(h), ["cards", "spades", "big", "little", "aces", "sweeps"]);
  h.aces.you = 3;
  h.big.opp = 2;
  assert.equal(handTotal(g, h, "you"), 3);
  assert.equal(handTotal(g, h, "opp"), 2);
});

test("a segment is reached, the cursor, or unreached; the line stops at its end", () => {
  assert.equal(segmentState(3, 5), "reached");
  assert.equal(segmentState(5, 5), "cursor");
  assert.equal(segmentState(6, 5), "unreached");
  assert.equal(segmentState(1, 0), "unreached", "a score of 0 lights nothing");
  assert.equal(segmentState(21, 24), "cursor", "past the end, the finish is the cursor");
  assert.equal(segmentState(20, 24), "reached");
  assert.equal(segmentState(36, 40, 36), "cursor", "another length");
});

test("a score in thirds lights the segments of its whole points", () => {
  assert.equal(segmentState(11, 35, 36, 3), "cursor", "35 thirds is 11 whole points");
  assert.equal(segmentState(12, 35, 36, 3), "unreached");
  assert.equal(segmentState(10, 35, 36, 3), "reached");
  assert.equal(segmentState(1, 2, 36, 3), "unreached", "two thirds is not yet a point");
});

test("a count's lines into one hand's ledger, by the game's own reading", () => {
  const g = defineGame(fake);
  const h = countLedger(g, [line("cards", "you", 3), line("ace", "them", 1, "S"), line("ace", "them", 1, "D"), line("sweeps", "you", 1)]);
  assert.deepEqual(h.cards, { you: 3, opp: 0 });
  assert.deepEqual(h.aces, { you: 0, opp: 2 });
  assert.deepEqual(h.sweeps, { you: 1, opp: 0 });
  assert.deepEqual(ledgerTotals(g, { hands: [h], live: null }), { you: 4, opp: 2 });
  const live = blank(g);
  live.sweeps.opp = 1;
  assert.deepEqual(ledgerTotals(g, { hands: [h], live }), { you: 4, opp: 3 }, "the hand under way counts");
});

test("a line of a category the game does not list is refused, not dropped", () => {
  const g = defineGame(fake);
  assert.throws(() => countLedger(g, [{ item: "nonsense", who: "you", points: 1 }]), /category/);
});

test("the count's popups: whose each line brings, a side's aces told once", () => {
  const g = defineGame(fake);
  const lines = [
    line("cards", "them", 3), line("spades", "them", 1), line("big_one", "you", 2),
    line("ace", "them", 1, "S"), line("ace", "them", 1, "H"), line("ace", "you", 1, "D"), line("sweeps", "you", 2),
  ];
  assert.deepEqual(popupsOf(g, lines), ["opp", "opp", "you", "opp", null, "you", null]);
});

test("the count's events: a popup a told line with its line index, then the hand's end", () => {
  const g = defineGame(fake);
  const lines = [line("cards", "you", 3), line("big_one", "them", 2), line("ace", "you", 1, "S"), line("ace", "them", 1, "C"), line("ace", "you", 1, "H"), line("sweeps", "them", 1)];
  const out = countEvents(g, lines, { at: 4, hand: 2 });
  assert.deepEqual(
    out.map((e) => (e.end ? "end" : `${e.side}:${e.cat}:${e.pts}@${e.line}`)),
    ["you:cards:3@0", "opp:big:2@1", "you:aces:2@2", "opp:aces:1@3", "end"],
  );
  assert.equal(out[2].label, "Aces");
  assert.ok(out.every((e) => e.at === 4 && e.hand === 2));
  assert.equal(out.at(-1).line, 6, "the hand ends once its count has been said");
});

test("the events, played out, take the totals where the ledger says", () => {
  const g = defineGame(fake);
  const lines = [line("cards", "you", 3), line("ace", "them", 1, "S"), line("ace", "them", 1, "D"), line("big_one", "you", 2)];
  const shown = { you: 0, opp: 0 };
  for (const e of countEvents(g, lines, { at: 0, hand: 1 })) if (!e.end) shown[e.side] += e.pts;
  assert.deepEqual(shown, ledgerTotals(g, { hands: [countLedger(g, lines)], live: null }));
});

test("a game without a popup reader tells each line as it stands", () => {
  const g = defineGame({ ...fake, popup: undefined });
  const out = countEvents(g, [line("cards", "you", 3), line("ace", "you", 1, "S")], { at: 0, hand: 1 });
  assert.deepEqual(out.filter((e) => !e.end).map((e) => [e.cat, e.pts, e.label]), [["cards", 3, "Most cards"], ["aces", 1, "Aces"]]);
});

test("counting in threes: exact thirds, a popup a line, the cards it turns up", () => {
  const g = defineGame(counting);
  assert.equal(g.scale, 3);
  assert.equal(g.segments, 36);
  assert.equal(g.format(107), "35⅔");
  assert.equal(g.format(2), "⅔");
  assert.equal(g.format(105), "35");
  const lines = [
    { kind: "count", who: "you", thirds: 7, cards: ["K1", "Q2", "J3"] },
    { kind: "count", who: "you", thirds: 5, cards: ["K2", "XXI", "I"] },
    { kind: "bonus", who: "them", thirds: 6, name: "Pagat", cards: [] },
  ];
  const events = countEvents(g, lines, { at: 0, hand: 1 }).filter((e) => !e.end);
  assert.deepEqual(events.map((e) => [e.side, e.label, e.pts]), [["you", "Three cards", 7], ["you", "Three cards", 5], ["opp", "Pagat", 6]]);
  assert.deepEqual(events.map((e) => g.format(e.pts)), ["2⅓", "1⅔", "2"]);
  assert.deepEqual(events.map((e) => e.cards), [["K1", "Q2", "J3"], ["K2", "XXI", "I"], []]);
  assert.equal(handTotal(g, countLedger(g, lines), "you"), 12, "twelve thirds, summed exactly as integers");
});

test("the ledger's list: all its hands where there is room, and no taller than the room", () => {
  assert.equal(listHeight(2, 1000), 2 * HAND_H);
  assert.equal(listHeight(5, 600), 600 - PANEL_CHROME);
  assert.equal(listHeight(5, 40), 0);
  assert.equal(listHeight(0, 600), 0);
  assert.equal(listHeight(9, Infinity), 9 * HAND_H);
  assert.equal(handHeight(defineGame(fake)), HAND_H, "six categories: Cassino's 170");
  assert.equal(handHeight(defineGame(counting)), 2 * 22 + 38, "a block is as tall as the game's categories");
  assert.equal(listHeight(3, 1000, handHeight(defineGame(counting))), 3 * 82);
});

test("a game says how many segments a score lights: 107 thirds (35 2/3) reaches the finish of 36", () => {
  const g = defineGame({ categories: [["count", "Won cards"]], target: 107, segments: 36, scale: 3, line: () => ({ side: "you", cat: "count", pts: 0 }), lit: (u) => Math.min(36, Math.floor((u + 1) / 3)) });
  assert.equal(g.lit(107), 36);
  assert.equal(g.lit(106), 35, "106 thirds (35 1/3) stops one short");
  assert.equal(segmentState(36, 107, g.segments, g.scale, g.lit), "cursor");
  assert.equal(segmentState(35, 106, g.segments, g.scale, g.lit), "cursor");
  assert.equal(segmentState(36, 106, g.segments, g.scale, g.lit), "unreached");
  const plain = defineGame({ categories: [["a", "A"]], target: 21, line: () => ({ side: "you", cat: "a", pts: 0 }) });
  assert.equal(plain.lit(7), 7, "without `lit`, whole points");
});

test("an `apart` category is listed and shown but is not part of any total", () => {
  const g = defineGame({ ...counting, apart: ["bonus"] });
  assert.deepEqual(g.apart, ["bonus"]);
  assert.deepEqual(defineGame(counting).apart, [], "none by default");
  assert.throws(() => defineGame({ ...counting, apart: ["nothing"] }), /apart/);
  const h = blank(g);
  h.count.you = 12;
  h.bonus.you = 2;
  assert.equal(handTotal(g, h, "you"), 12);
  assert.deepEqual(ledgerTotals(g, { hands: [h], live: null }), { you: 12, opp: 0 });
});
