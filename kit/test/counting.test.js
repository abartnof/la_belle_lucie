// A Strohmandeln-like game through the whole HUD path: a count told in
// threes, each group of three cards turned up as its popup comes, scores in
// exact thirds, 36 of 70. The seams are tested one by one elsewhere; this is
// the game's definition driving them together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HUD_TIMING, countSchedule, paceOf } from "../js/count.js";
import { createHud } from "../js/hud.js";
import { blank, countEvents, countLedger, defineGame, ledgerTotals, segmentState } from "../js/scoring.js";
import { counting } from "./fixtures/games.js";

class FakeElement {
  constructor() {
    this.children = [];
    this.attributes = {};
    this.style = { setProperty() {} };
    this.own = "";
    this.className = "";
    const el = this;
    this.classList = {
      add: (...c) => (el.className = [...new Set([...el.className.split(" ").filter(Boolean), ...c])].join(" ")),
      remove: (...c) => (el.className = el.className.split(" ").filter((x) => x && !c.includes(x)).join(" ")),
      toggle: (c, on) => (on ? el.classList.add(c) : el.classList.remove(c)),
      contains: (c) => el.className.split(" ").includes(c),
    };
  }
  set textContent(t) {
    this.children = [];
    this.own = t;
  }
  get textContent() {
    return this.own;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  append(...nodes) {
    for (const n of nodes) this.children.push(typeof n === "string" ? Object.assign(new FakeElement(), { textContent: n }) : n);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  addEventListener() {}
  set innerHTML(_) {}
  get offsetWidth() {
    return 0;
  }
}
const find = (node, cls, out = []) => {
  if (node.classList?.contains(cls)) out.push(node);
  for (const c of node.children) find(c, cls, out);
  return out;
};

// Counting in threes: 7 groups of three cards, the thirds each is worth.
const group = (who, thirds, ...cards) => ({ kind: "count", who, thirds, cards });

test("a count of groups of three plays out: cards turn up with their popups, the thirds add exactly", () => {
  const game = defineGame(counting);
  const lines = [
    group("you", 14, "K1", "Q1", "J1"), // 4⅔
    group("opp", 9, "K2", "Q2", "J2"), // 3
    group("you", 13, "XXI", "I", "II"), // 4⅓
    group("you", 5, "C1", "C2", "C3"), // 1⅔
    { kind: "bonus", who: "opp", thirds: 6, name: "Pagat ultimo", cards: [] },
  ];
  const pace = paceOf(game, lines);
  assert.deepEqual(pace.popups, ["you", "opp", "you", "you", "opp"]);
  const schedule = countSchedule(game, lines, { start: 0, pace });

  // The cards turn up exactly when their popups are due, a player's next popup after the last.
  assert.deepEqual(schedule.turns.map((t) => [t.at, t.cards.length]), [[0, 3], [1000, 3], [2000, 3], [2000 + HUD_TIMING.busy, 3]]);

  // The HUD, on the same clock, plays the events at their lines' times.
  globalThis.document = { createElement: () => new FakeElement() };
  const queue = [];
  let now = 0;
  const hud = createHud(new FakeElement(), game, { later: (ms, fn) => queue.push({ at: now + ms, fn }) });
  hud.reset({ hands: [], live: blank(game) });
  hud.dealt(1);
  for (const e of countEvents(game, lines, { at: 0, hand: 1 })) {
    queue.push({ at: schedule.lines[e.line] ?? schedule.end, fn: () => (e.end ? hud.endHand(e.hand) : hud.score(e)) });
  }
  const run = (until) => {
    for (;;) {
      queue.sort((a, b) => a.at - b.at);
      if (!queue.length || queue[0].at > until) break;
      const e = queue.shift();
      now = e.at;
      e.fn();
    }
    now = until;
  };
  run(schedule.end + 5000);

  const total = ledgerTotals(game, { hands: [countLedger(game, lines)], live: null });
  assert.deepEqual(hud.totals(), total);
  assert.deepEqual(total, { you: 32, opp: 15 }, "thirds: 10⅔ and 5");
  assert.deepEqual(find(hud.node, "hud-num").map((n) => n.textContent), ["5", "10⅔"], "opponent first, then you");
  assert.equal(hud.hands(), 1);
  assert.ok(hud.idle());
  assert.equal(segmentState(10, total.you, game.segments, game.scale), "cursor", "10⅔ lights ten segments of 36");
  delete globalThis.document;
});

test("thirds that reach 36 exactly, and one third short of it", () => {
  const game = defineGame(counting);
  assert.equal(game.format(36 * 3), "36");
  assert.equal(game.format(36 * 3 - 1), "35⅔");
  assert.equal(segmentState(35, 36 * 3 - 1, game.segments, game.scale), "cursor", "35⅔ is on the 35th segment");
  assert.equal(segmentState(36, 36 * 3, game.segments, game.scale), "cursor", "36 reaches the finish");
});
