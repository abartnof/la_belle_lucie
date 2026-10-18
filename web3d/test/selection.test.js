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

// ---- the draw from the keyboard: D cycles the buried cards with a legal draw
const drawing = (extra = {}) => state({ draw: "ready", legal: ["draw f2:0>f3", "draw f2:0>h", "draw f2:1>f3", "f0>f3"], ...extra });
const cycle = (fan) => ({ fan, home: false, card: null, action: "cycle" });

test("drawCandidates lists the buried cards with a draw, with their targets, in order", async () => {
  const { drawCandidates } = await import("../src/selection.js");
  const c = drawCandidates(drawing(), 2);
  assert.deepEqual(c.map((x) => [x.card, x.pos]), [["7S", 0], ["5C", 1]]);
  assert.deepEqual(targetsOf(drawing(), c[0]), [{ fan: 3 }, { home: true, suit: "S" }]);
  assert.deepEqual(drawCandidates(drawing(), 0), []);
  assert.deepEqual(drawCandidates(state({ legal: drawing().legal }), 2), [], "draw not ready");
});

test("D chooses the first candidate, then the next, wrapping round", () => {
  const s = drawing();
  const a = decide(s, null, cycle(2));
  assert.deepEqual(a, { kind: "select", sel: { fan: 2, card: "7S", pos: 0 } });
  const b = decide(s, a.sel, cycle(2));
  assert.deepEqual(b, { kind: "select", sel: { fan: 2, card: "5C", pos: 1 } });
  assert.deepEqual(decide(s, b.sel, cycle(2)), a);
});

test("D with nothing to draw in that fan, or none chosen fan, does nothing", () => {
  assert.deepEqual(decide(drawing(), null, cycle(0)), { kind: "none" });
  assert.deepEqual(decide(drawing(), null, cycle(null)), { kind: "none" });
  assert.deepEqual(decide(state(), null, cycle(2)), { kind: "none" });
});

test("a top-card selection elsewhere does not stop D choosing in this fan", () => {
  const s = drawing();
  const top = { fan: 0, card: "6H", pos: null };
  assert.deepEqual(decide(s, top, cycle(2)).sel, { fan: 2, card: "7S", pos: 0 });
});

test("Enter on a target fan plays the drawn card; H plays it home from its own fan", () => {
  const s = drawing();
  const sel = { fan: 2, card: "7S", pos: 0 };
  assert.deepEqual(decide(s, sel, click(3, null)), { kind: "send", command: "draw f2:0>f3" });
  assert.deepEqual(decide(s, sel, { fan: 2, home: false, card: "KD", action: "home" }), { kind: "send", command: "draw f2:0>h" });
  // H with no home draw for that card leaves the selection alone
  const t = drawing({ legal: ["draw f2:0>f3", "f2>h"] });
  assert.deepEqual(decide(t, sel, { fan: 2, home: false, card: "KD", action: "home" }), { kind: "send", command: "move f2>h" });
});

test("H with a drawn card chosen prefers it to the fan's top card", () => {
  const s = drawing({ legal: ["draw f2:0>h", "f2>h"] });
  assert.deepEqual(decide(s, { fan: 2, card: "7S", pos: 0 }, { fan: 2, home: false, card: "KD", action: "home" }), { kind: "send", command: "draw f2:0>h" });
});
