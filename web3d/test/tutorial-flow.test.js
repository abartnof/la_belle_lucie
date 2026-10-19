import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTutorial } from "../../kit/js/tutorial.js";
import { duePage, pageNote, PAGE_KEYS } from "../src/tutorial-flow.js";

const base = { prompt: "play", moves: 0, legal: ["f1>f2"], draw: "off", fans: [["AS"]], redeals_left: 2 };
const st = (o) => ({ ...base, ...o });

// Plays a sequence of states as the ui does: ask, mark seen, ask again.
function run(states, options = {}) {
  const seen = new Set();
  const order = [];
  let prev = null;
  for (const s of states) {
    for (let key; (key = duePage(prev, s, seen, options)); ) {
      order.push(key);
      seen.add(key);
    }
    prev = s;
  }
  return order;
}

test("tutorial.md has a page for every key, in order, and each is short", () => {
  const pages = parseTutorial(readFileSync(new URL("../tutorial.md", import.meta.url), "utf8"), PAGE_KEYS);
  assert.deepEqual(pages.map((p) => p.key), PAGE_KEYS);
  for (const p of pages) {
    const words = p.blocks.flatMap((b) => (b.type === "p" ? [b.spans] : b.items ?? [])).flat().map((s) => s.text).join(" ").split(/\s+/).length;
    assert.ok(words < 80, `${p.key}: ${words} words`);
  }
});

test("before the first move: table, foundations, building, then nothing", () => {
  assert.deepEqual(run([st({})]), ["table", "foundations", "building"]);
});

test("nothing later falls due before it is needed", () => {
  const played = [st({}), st({ moves: 3 }), st({ moves: 9, fans: [["AS"], []] })];
  assert.deepEqual(run(played, { king: false }), ["table", "foundations", "building"]);
});

test("redeal falls due the first time it is legal, once", () => {
  const states = [st({}), st({ moves: 5 }), st({ moves: 6, legal: ["redeal"] }), st({ moves: 7, legal: ["redeal"] }), st({ moves: 8, legal: ["f1>f2"] }), st({ moves: 9, legal: ["redeal"] })];
  assert.deepEqual(run(states), ["table", "foundations", "building", "redeal"]);
});

test("draw when ready; king when a fan empties and kings fill", () => {
  const states = [
    st({}),
    st({ moves: 4, fans: [["AS"], []] }),
    st({ moves: 5, legal: ["redeal"], fans: [["AS"], []] }),
    st({ moves: 30, draw: "ready", legal: ["draw f0:0>h"], fans: [["AS"], []] }),
  ];
  assert.deepEqual(run(states, { king: true }), ["table", "foundations", "building", "king", "redeal", "draw"]);
  assert.deepEqual(run(states, { king: false }), ["table", "foundations", "building", "redeal", "draw"]);
});

// The check: the first time a build on the table would cover something wanted before the card's suit gets there.
const risky = (o = {}) => st({ moves: 1, home: [1, 0, 0, 0], fans: [["2S", "7H"], ["9C", "6H"]], legal: ["f1>f0"], ...o });
const safe = (o = {}) => risky({ fans: [["JS", "7H"], ["9C", "6H"]], ...o });

test("the check falls due the first time a build would freeze what is wanted soon, once", () => {
  assert.deepEqual(run([st({}), safe(), risky(), risky({ moves: 2 })]), ["table", "foundations", "building", "check"]);
});

test("the check is not due at the deal, nor for a lock of a lower card of the same suit it is, nor for a safe build", () => {
  assert.deepEqual(run([risky({ moves: 0 })]), ["table", "foundations", "building"]);
  assert.equal(duePage(null, safe(), new Set(["table", "foundations", "building"]), {}), null);
  const lock = risky({ fans: [["2H", "7H"], ["9C", "6H"]] });
  assert.equal(duePage(null, lock, new Set(["table", "foundations", "building"]), {}), "check");
});

test("the check ignores moves home, redeals and draws", () => {
  const seen = new Set(["table", "foundations", "building", "redeal", "draw", "king"]);
  for (const legal of [["f1>h"], ["redeal"], ["draw f0:0>f1"]]) assert.equal(duePage(null, risky({ legal }), seen, {}), null);
});

test("pages already seen never come back; a finished game asks for none", () => {
  assert.equal(duePage(null, st({}), new Set(PAGE_KEYS), {}), null);
  assert.equal(duePage(null, st({ prompt: "won" }), new Set(), {}), null);
  assert.equal(duePage(null, st({ moves: 2, legal: ["redeal"] }), ["redeal"], {}), null);
});

test("a game resumed past its start does not replay the opening pages", () => {
  assert.equal(duePage(null, st({ moves: 12 }), new Set(), {}), null);
});

test("the foundations page adds a note only in Trefoil: aces already home, 16 fans", () => {
  assert.equal(pageNote("foundations", {}), null);
  assert.equal(pageNote("foundations", { trefoil: false }), null);
  assert.equal(pageNote("table", { trefoil: true }), null);
  const note = pageNote("foundations", { trefoil: true });
  assert.match(note, /aces/i);
  assert.match(note, /16 fans/);
  assert.ok(note.split(/\s+/).length < 30);
});
