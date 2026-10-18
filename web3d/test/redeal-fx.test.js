import assert from "node:assert/strict";
import { test } from "node:test";
import { Quaternion, Vector3 } from "three";
import { CARD as UNITS } from "../../kit/js/units.js";
import { lying } from "../../kit/js/kinematics.js";
import { layout } from "../src/layout.js";
import { EFFECTS, EFFECT_NAMES, createRedeal, seeded } from "../src/redeal-fx.js";

const RANKS = "A23456789TJQK";
const PACK = [..."SHDC"].flatMap((s) => [...RANKS].map((r) => r + s));

// A state with n cards in fans of three (the last maybe shorter), shuffled by seed.
function fansOf(n, seed) {
  const rnd = seeded(seed);
  const cards = PACK.slice(0, n);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const fans = [];
  for (let i = 0; i < cards.length; i += 3) fans.push(cards.slice(i, i + 3));
  return fans;
}

// What table.js hands the simulation: where each card lies now and its slot.
function setup(n, aspect, seed) {
  const before = layout({ fans: fansOf(n, seed), home: [0, 0, 0, 0] }, aspect);
  const next = fansOf(n, seed + 1);
  const after = layout({ fans: next, home: [0, 0, 0, 0] }, aspect);
  const codes = next.flat();
  const prior = Object.keys(before.poses);
  const pose = (p) => lying({ x: p.x, z: p.z, height: p.y, faceUp: true, yaw: p.yaw });
  // The card the engine puts in slot j was somewhere in the old fans.
  const from = codes.map((c) => {
    const p = before.poses[c] ?? before.poses[prior[0]];
    return { x: p.x, y: pose(p).position.y, z: p.z, yaw: 0 };
  });
  const slots = codes.map((c) => {
    const p = after.poses[c];
    return { x: p.x, y: pose(p).position.y, z: p.z, yaw: p.yaw, fan: p.fan };
  });
  return { from, slots, targets: codes.map((c) => pose(after.poses[c])) };
}

function run(effect, n, aspect, seed) {
  const { from, slots, targets } = setup(n, aspect, seed);
  const sim = createRedeal(effect, { from, slots, rng: seeded(seed) });
  let t = 0;
  while (!sim.done() && t < 6) {
    sim.step(1 / 60);
    t += 1 / 60;
    assert.ok(sim.valid(), `${effect}: NaN at ${t}`);
  }
  return { sim, t, targets };
}

for (const effect of EFFECTS) {
  test(`${effect}: every card ends exactly on its slot, in time, for any count and shape`, () => {
    for (const [n, aspect] of [[52, 16 / 9], [52, 9 / 19.5], [37, 4 / 3], [7, 9 / 19.5], [1, 16 / 9]]) {
      for (const seed of [1]) {
        const { sim, t, targets } = run(effect, n, aspect, seed);
        assert.ok(sim.done(), `${effect} n=${n}: not finished after ${t.toFixed(2)} s`);
        assert.ok(t <= 3, `${effect} n=${n} ${aspect.toFixed(2)}: took ${t.toFixed(2)} s`);
        const err = sim.finish();
        assert.ok(err < 1e-6, `${effect} n=${n}: ${err} cm off its slot at the end`);
        assert.ok(sim.valid());
        const p = new Vector3();
        const q = new Quaternion();
        targets.forEach((to, j) => {
          sim.write(j, p, q);
          assert.ok(p.distanceTo(to.position) < 1e-9, `${effect} card ${j} position`);
          assert.ok(Math.abs(q.dot(to.quaternion)) > 1 - 1e-9, `${effect} card ${j} lies face up`);
        });
      }
    }
  });
}

test("a seed fixes an effect", () => {
  const trace = (seed) => {
    const { from, slots } = setup(30, 16 / 9, 5);
    const sim = createRedeal("tornado", { from, slots, rng: seeded(seed) });
    for (let i = 0; i < 40; i++) sim.step(1 / 60);
    const p = new Vector3();
    sim.write(7, p, new Quaternion());
    return p.toArray();
  };
  assert.deepEqual(trace(3), trace(3));
  assert.notDeepEqual(trace(3), trace(4));
});

test("the effects have names", () => {
  assert.equal(EFFECTS.length, 7);
  for (const e of EFFECTS) assert.ok(EFFECT_NAMES[e]);
  assert.ok(UNITS.width > 0);
});
