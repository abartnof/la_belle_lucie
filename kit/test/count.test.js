// The count ritual's sequencing: a line a beat, a player's next popup
// waiting for the last, each counted card turned up as its popup comes, the
// pace at the speeds, and the quiet window the talk system keeps. All timing
// is pure data on the plan's clock (ms); a game's choreography moves cards by it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HUD_TIMING, countSchedule, muted, paceOf, quietWindow, scalePace } from "../js/count.js";
import { defineGame } from "../js/scoring.js";
import { counting, fake } from "./fixtures/games.js";

const line = (item, who, points, suit = null) => ({ item, suit, who, points });
const g = defineGame(fake);

test("the pace of a count: whose popup each line brings, and how long one is busy", () => {
  const lines = [line("cards", "them", 3), line("ace", "them", 1, "S"), line("ace", "them", 1, "H"), line("sweeps", "you", 1)];
  assert.deepEqual(paceOf(g, lines), { popups: ["opp", "opp", null, null], busy: HUD_TIMING.busy });
  assert.ok(HUD_TIMING.busy > HUD_TIMING.line, "a popup outlasts a beat, so one player's lines queue");
});

test("a line a beat from the start; a side's popups spaced by how long one is busy", () => {
  const lines = [line("cards", "you", 3), line("spades", "them", 1), line("big_one", "you", 2), line("little_one", "them", 1)];
  const s = countSchedule(g, lines, { start: 500, line: 1000, pace: paceOf(g, lines) });
  // you: line 0 at 500; them: line 1 at 1500; you again waits for its first
  // popup (500 + busy), them again likewise.
  const busy = HUD_TIMING.busy;
  assert.deepEqual(s.lines, [500, 1500, Math.max(2500, 500 + busy), Math.max(Math.max(2500, 500 + busy) + 1000, 1500 + busy)]);
  assert.equal(s.end, s.lines[3] + 1000, "the count ends a beat after its last line");
});

test("with no pace, lines come a beat apart and nothing waits for a popup (Instant)", () => {
  const lines = [line("cards", "you", 3), line("spades", "you", 1), line("big_one", "you", 2)];
  const s = countSchedule(g, lines, { start: 0, line: 100 });
  assert.deepEqual(s.lines, [0, 100, 200]);
  assert.equal(s.end, 300);
});

test("each counted card turns up as its line's popup comes", () => {
  const lines = [line("cards", "you", 3), line("big_one", "them", 2), line("ace", "you", 1, "S"), line("ace", "them", 1, "C"), line("sweeps", "you", 1)];
  const s = countSchedule(g, lines, { start: 0, line: 1000, pace: paceOf(g, lines) });
  assert.deepEqual(s.turns.map((t) => [t.line, t.cards]), [[1, ["TD"]], [2, ["AS"]], [3, ["AC"]]], "lines that name no card turn none");
  for (const t of s.turns) assert.equal(t.at, s.lines[t.line]);
  assert.deepEqual(s.turns.map((t) => t.side), ["opp", "you", "opp"]);
});

test("counting in threes: three cards turn up with each popup", () => {
  const c = defineGame(counting);
  const lines = [
    { kind: "count", who: "you", thirds: 7, cards: ["K1", "Q2", "J3"] },
    { kind: "count", who: "you", thirds: 5, cards: ["K2", "XXI", "I"] },
  ];
  const s = countSchedule(c, lines, { start: 0, line: 1000, pace: paceOf(c, lines) });
  assert.deepEqual(s.turns.map((t) => t.cards), [["K1", "Q2", "J3"], ["K2", "XXI", "I"]]);
  assert.equal(s.lines[1], HUD_TIMING.busy, "the same player's second popup waits for the first");
});

test("the pace at the speeds: a popup lasts wall-time whatever the speed; at Instant nothing waits", () => {
  const pace = { popups: ["you"], busy: 1960 };
  assert.deepEqual(scalePace(pace, 1), pace);
  assert.equal(scalePace(pace, 2).busy, 3920, "the plan's clock is divided by the speed, so a popup's wall time is multiplied back");
  assert.equal(scalePace(pace, 20), null, "Instant: nothing waits for the popups");
  assert.equal(scalePace(null, 1), null);
});

test("the quiet window runs from the count's start to its end; talk inside it is dropped", () => {
  const count = { at: 5, lines: [800, 1800], end: 2800 };
  const quiet = quietWindow(count, { 5: 300 });
  assert.deepEqual(quiet, { from: 300, to: 2800 });
  assert.deepEqual(quietWindow(count, {}), { from: 800, to: 2800 }, "no beat for the event: the first line");
  assert.equal(quietWindow(null, {}), null, "no count: no quiet");
  const words = "Well played.";
  assert.equal(muted(quiet, -900, words), false, "said and done before the count");
  assert.equal(muted(quiet, 250, words), true, "still being said as the count begins");
  assert.equal(muted(quiet, 1000, words), true, "inside the count");
  assert.equal(muted(quiet, 2800, words), false, "from the count's end");
  assert.equal(muted(null, 1000, words), false, "no quiet, no silence");
});
