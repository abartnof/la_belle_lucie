import assert from "node:assert/strict";
import { test } from "node:test";
import { arrowEnds, arrowOutline, curveAt, phase } from "../src/arrow.js";
import { layout } from "../src/layout.js";

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const state = {
  fans: [["KS", "5H", "9C"], ["4S"], [], ["QD", "8H"]],
  home: [0, 2, 0, 0], // AH 2H home
  prompt: "play",
};
const lay = layout(state, 16 / 9);
const at = (code) => lay.poses[code];

test("a fan-to-fan move runs from the card to the target fan's top card", () => {
  const e = arrowEnds(lay, { move: "f0>f3", card: "9C", onto: "8H" });
  assert.deepEqual(e.from, { x: at("9C").x, z: at("9C").z });
  assert.deepEqual(e.to, { x: at("8H").x, z: at("8H").z });
});

test("a king fill runs to the empty fan's slot", () => {
  const e = arrowEnds(lay, { move: "f0>f2", card: "9C" });
  assert.deepEqual(e.to, { x: lay.slots[2].cx, z: lay.slots[2].cz });
});

test("a move home runs to the foundation of the card's suit", () => {
  const e = arrowEnds(lay, { move: "f1>h", card: "4S" });
  assert.deepEqual(e.to, { x: lay.home[0].cx, z: lay.home[0].cz });
  const h = arrowEnds(lay, { move: "f0>h", card: "5H" });
  assert.deepEqual(h.to, { x: lay.home[1].cx, z: lay.home[1].cz });
});

test("a draw starts at the buried card", () => {
  const e = arrowEnds(lay, { move: "draw f0:1>f3", card: "5H", onto: "8H" });
  assert.deepEqual(e.from, { x: at("5H").x, z: at("5H").z });
  assert.deepEqual(e.to, { x: at("8H").x, z: at("8H").z });
  const h = arrowEnds(lay, { move: "draw f0:1>h", card: "5H" });
  assert.deepEqual(h.to, { x: lay.home[1].cx, z: lay.home[1].cz });
});

test("a redeal, no hint, or a nonsense move has no arrow", () => {
  assert.equal(arrowEnds(lay, { move: "redeal", card: "5H" }), null);
  assert.equal(arrowEnds(lay, null), null);
  assert.equal(arrowEnds(lay, { move: "f0>f3", card: "ZZ" }), null);
  assert.equal(arrowEnds(lay, { move: "f9>f9", card: "9C" }), null);
});

test("the path is a gentle curve from the source to the target", () => {
  const a = { x: 0, z: 0 };
  const b = { x: 20, z: -10 };
  const s = curveAt(a, b, 0);
  const m = curveAt(a, b, 0.5);
  const e = curveAt(a, b, 1);
  assert.ok(near(s.x, 0) && near(s.z, 0) && near(e.x, 20) && near(e.z, -10));
  // bowed off the straight line, but only gently
  const off = Math.abs((m.x - 10) * 10 + (m.z + 5) * 20) / Math.hypot(20, 10);
  assert.ok(off > 0.5 && off < 0.25 * Math.hypot(20, 10), `bow ${off}`);
  for (const t of [0, 0.3, 0.7, 1]) assert.ok(near(Math.hypot(curveAt(a, b, t).dx, curveAt(a, b, t).dz), 1));
  // the tangent heads towards the target at the start and the end
  assert.ok(curveAt(a, b, 0).dx > 0 && curveAt(a, b, 1).dx > 0);
  // vertical runs bow too
  const v = curveAt({ x: 0, z: 0 }, { x: 0, z: 20 }, 0.5);
  assert.ok(Math.abs(v.x) > 0.5);
});

test("the animation travels, rests, shrinks away and repeats", () => {
  const p = (ms) => phase(ms);
  assert.equal(p(0).t, 0);
  assert.equal(p(0).alpha, 0);
  let last = -1;
  for (let ms = 0; ms <= 800; ms += 25) {
    assert.ok(p(ms).t >= last, "never goes back");
    last = p(ms).t;
  }
  assert.equal(p(1000).t, 1);
  assert.equal(p(1000).alpha, 1);
  assert.ok(p(1600).alpha < 1 && p(1600).alpha > 0);
  assert.equal(p(1900).alpha, 0);
  assert.equal(p(2300).t, p(100).t); // loops
  // M3 emphasized decelerate: most of the way is covered early
  assert.ok(p(200).t > 0.4);
});

test("the outline is one closed polygon with the tip on the path", () => {
  const ends = { from: { x: 0, z: 0 }, to: { x: 20, z: -10 } };
  const fill = arrowOutline(ends, 0.6);
  assert.ok(fill.outline.length >= 5);
  assert.ok(fill.outline.flat().every(Number.isFinite));
  const c = curveAt(ends.from, ends.to, 0.6);
  assert.ok(near(fill.tip.x, c.x) && near(fill.tip.z, c.z));
  assert.ok(fill.outline.some((q) => near(q[0], c.x) && near(q[1], c.z)));
  // no repeated points (the polygon is simple enough to triangulate)
  const keys = new Set(fill.outline.map((q) => q.map((v) => v.toFixed(5)).join()));
  assert.equal(keys.size, fill.outline.length);
  // a smaller scale makes a smaller arrow
  const span = (o) => Math.max(...o.map((q) => q[0])) - Math.min(...o.map((q) => q[0]));
  assert.ok(span(arrowOutline(ends, 0.6, { scale: 0.5 }).outline) < span(fill.outline));
  // a still arrow (t = 1, whole tail) spans the whole path
  const still = arrowOutline(ends, 1, { tail: 1 });
  assert.ok(still.outline.some((q) => near(q[0], 0, 1.5) && near(q[1], 0, 1.5)));
  // at the very start there is only a head
  assert.ok(arrowOutline(ends, 0).outline.length >= 3);
});
