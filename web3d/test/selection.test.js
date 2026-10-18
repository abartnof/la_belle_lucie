import assert from "node:assert/strict";
import { test } from "node:test";
import { commandFor, decide, pickable, targetsOf } from "../src/selection.js";

const state = (extra = {}) => ({
  prompt: "play",
  draw: "off",
  fans: [["7H", "2S", "6H"], ["AS"], ["7S", "5C", "KD"], []],
  legal: ["f0>h", "f1>h", "f0>f3", "redeal"],
  ...extra,
});
const click = (fan, card, action = "click") => ({ fan, home: false, card, action });

test("a top card with a move is chosen, with its targets", () => {
  const s = state({ legal: ["f1>h", "f1>f3", "f0>f2"] });
  const d = decide(s, null, click(1, "AS"));
  assert.deepEqual(d, { kind: "select", sel: { fan: 1, card: "AS", pos: null } });
  assert.deepEqual(targetsOf(s, d.sel), [{ home: true, suit: "S" }, { fan: 3 }]);
});

test("a click on a target sends the move; a buried or stuck card is not chosen", () => {
  const s = state({ legal: ["f1>h", "f1>f3"] });
  const sel = { fan: 1, card: "AS", pos: null };
  assert.deepEqual(decide(s, sel, click(3, null)), { kind: "send", command: "move f1>f3" });
  assert.deepEqual(decide(s, sel, { fan: null, home: true, card: null, suit: "S", action: "click" }), { kind: "send", command: "move f1>h" });
  assert.deepEqual(decide(s, null, click(0, "7H")), { kind: "none" }); // buried
  assert.deepEqual(decide(s, null, click(2, "KD")), { kind: "none" }); // no move
});

test("clicking elsewhere clears, the same card again puts it down, another movable card takes over", () => {
  const s = state({ legal: ["f1>h", "f0>f3"] });
  const sel = { fan: 1, card: "AS", pos: null };
  assert.deepEqual(decide(s, sel, click(2, "KD")), { kind: "clear" });
  assert.deepEqual(decide(s, sel, { fan: null, home: false, card: null, action: "clear" }), { kind: "clear" });
  assert.deepEqual(decide(s, sel, click(1, "AS")), { kind: "clear" });
  assert.deepEqual(decide(s, sel, click(0, "6H")), { kind: "select", sel: { fan: 0, card: "6H", pos: null } });
});

test("a double click (or H) sends the top card home when it may go, else does nothing", () => {
  const s = state({ legal: ["f1>h", "f0>f3"] });
  assert.deepEqual(decide(s, { fan: 1, card: "AS", pos: null }, click(1, "AS", "dblclick")), { kind: "send", command: "move f1>h" });
  assert.deepEqual(decide(s, null, click(1, "AS", "home")), { kind: "send", command: "move f1>h" });
  assert.deepEqual(decide(s, { fan: 0, card: "6H", pos: null }, click(0, "6H", "dblclick")), { kind: "none" });
});

test("autoHome sends a card that can go home as soon as it is clicked", () => {
  const s = state({ legal: ["f1>h", "f1>f3"] });
  assert.deepEqual(decide(s, null, click(1, "AS"), { autoHome: true }), { kind: "send", command: "move f1>h" });
  const t = state({ legal: ["f0>f3"] });
  assert.deepEqual(decide(t, null, click(0, "6H"), { autoHome: true }).kind, "select");
});

test("the draw: a buried card is chosen only when the draw is ready", () => {
  const legal = ["draw f2:1>h", "draw f2:1>f3", "f0>f3"];
  assert.equal(pickable(state({ legal }), click(2, "5C")), null);
  const s = state({ legal, draw: "ready" });
  const d = decide(s, null, click(2, "5C"));
  assert.deepEqual(d, { kind: "select", sel: { fan: 2, card: "5C", pos: 1 } });
  assert.deepEqual(targetsOf(s, d.sel), [{ home: true, suit: "C" }, { fan: 3 }]);
  assert.deepEqual(decide(s, d.sel, click(3, null)), { kind: "send", command: "draw f2:1>f3" });
  assert.equal(commandFor(d.sel, "h"), "draw f2:1>h");
});

test("nothing is played once the game is over", () => {
  assert.deepEqual(decide(state({ prompt: "won", legal: [] }), null, click(1, "AS")), { kind: "none" });
});
