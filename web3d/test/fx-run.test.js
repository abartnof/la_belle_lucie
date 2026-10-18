import assert from "node:assert/strict";
import { test } from "node:test";
import { FX_GRACE_MS, FX_MS, createFxRun } from "../src/fx-run.js";

// A sim that finishes after `steps` steps; `finishErr` is what finish() reports.
function fakeSim({ steps = 3, finishErr = 0, valid = true, throwAt = null } = {}) {
  let n = 0;
  const sim = {
    finished: 0,
    step() {
      n++;
      if (n === throwAt) throw new Error("boom");
    },
    done: () => n >= steps,
    valid: () => valid,
    finish() {
      sim.finished++;
      return finishErr;
    },
  };
  return sim;
}

function rig(extra = {}) {
  const log = { busy: [], snaps: 0, writes: 0, done: 0, errors: [] };
  let t = 0;
  const timers = [];
  const run = createFxRun({
    busy: (on) => log.busy.push(on),
    write: () => log.writes++,
    snap: () => log.snaps++,
    done: () => log.done++,
    report: (e) => log.errors.push(String(e?.message ?? e)),
    now: () => t,
    later: (f, ms) => timers.push({ f, ms }),
    ...extra,
  });
  return { run, log, at: (ms) => (t = ms), timers };
}

test("a finished run snaps, frees busy once and says nothing", () => {
  const { run, log } = rig();
  const sim = fakeSim({ steps: 3 });
  run.start(sim);
  assert.deepEqual(log.busy, [true]);
  assert.ok(run.active());
  assert.ok(run.step(0.05));
  assert.ok(run.step(0.05));
  assert.equal(run.step(0.05), false);
  assert.equal(run.active(), false);
  assert.deepEqual(log.busy, [true, false]);
  assert.equal(log.snaps, 1);
  assert.equal(log.done, 1);
  assert.equal(sim.finished, 1);
  assert.deepEqual(log.errors, []);
});

test("a finished run whose cards are off their slots is reported", () => {
  const { run, log } = rig();
  run.start(fakeSim({ steps: 1, finishErr: 0.5 }));
  run.step(0.05);
  assert.equal(log.errors.length, 1);
  assert.match(log.errors[0], /0\.5 cm from its slots/);
  const b = rig();
  b.run.start(fakeSim({ steps: 1, finishErr: NaN }));
  b.run.step(0.05);
  assert.equal(b.log.errors.length, 1);
});

test("a run cut short (a new game, any show) is not an error, even if the cards are far from their slots", () => {
  const { run, log } = rig();
  const sim = fakeSim({ steps: 100, finishErr: 50 });
  run.start(sim);
  run.step(0.05);
  run.end();
  assert.deepEqual(log.errors, []);
  assert.equal(sim.finished, 0);
  assert.equal(log.snaps, 1);
  assert.deepEqual(log.busy, [true, false]);
  run.end(); // twice is harmless
  assert.equal(log.snaps, 1);
});

test("a throw in the step ends the run: snapped, not busy, reported", () => {
  const { run, log } = rig();
  run.start(fakeSim({ steps: 100, throwAt: 2 }));
  assert.ok(run.step(0.05));
  assert.equal(run.step(0.05), false);
  assert.equal(run.active(), false);
  assert.deepEqual(log.busy, [true, false]);
  assert.equal(log.snaps, 1);
  assert.deepEqual(log.errors, ["boom"]);
});

test("a throw in write or in snap still frees busy", () => {
  const a = rig({ write: () => { throw new Error("draw"); } });
  a.run.start(fakeSim({ steps: 100 }));
  assert.equal(a.run.step(0.05), false);
  assert.deepEqual(a.log.busy, [true, false]);
  const b = rig({ snap: () => { throw new Error("snap"); } });
  b.run.start(fakeSim({ steps: 1 }));
  b.run.step(0.05);
  assert.deepEqual(b.log.busy, [true, false]);
  assert.equal(b.log.done, 1);
  assert.ok(b.log.errors.includes("snap"));
});

test("a sim gone out of bounds ends as a fault", () => {
  const { run, log } = rig();
  run.start(fakeSim({ steps: 100, valid: false }));
  assert.equal(run.step(0.05), false);
  assert.deepEqual(log.busy, [true, false]);
  assert.equal(log.snaps, 1);
  assert.equal(log.errors.length, 1);
});

test("the watchdog: a run that outstays its length by the grace is snapped, by a frame or by the timer", () => {
  const a = rig();
  a.run.start(fakeSim({ steps: 1e9 }));
  a.at(FX_MS + FX_GRACE_MS - 1);
  assert.ok(a.run.step(0.05), "still within its time");
  a.at(FX_MS + FX_GRACE_MS + 1);
  assert.equal(a.run.step(0.05), false);
  assert.deepEqual(a.log.busy, [true, false]);
  assert.equal(a.log.snaps, 1);
  assert.deepEqual(a.log.errors, []);
  // No frames at all (a hidden tab): the timer does it.
  const b = rig();
  b.run.start(fakeSim({ steps: 1e9 }));
  assert.equal(b.timers.length, 1);
  assert.ok(b.timers[0].ms > FX_MS + FX_GRACE_MS);
  b.at(FX_MS + FX_GRACE_MS + 100);
  b.timers[0].f();
  assert.equal(b.run.active(), false);
  assert.deepEqual(b.log.busy, [true, false]);
  // An old timer does not end a newer run.
  const c = rig();
  c.run.start(fakeSim({ steps: 1e9 }));
  c.at(10);
  c.run.end();
  c.run.start(fakeSim({ steps: 1e9 }));
  c.at(FX_MS + FX_GRACE_MS + 60);
  c.timers[0].f();
  assert.ok(c.run.active());
});

// The table's glue, as far as it can be run without WebGL: the table gives the run
// a snap that reads the layout *at the time it ends*, so a layout changed while the
// effect played (a resize, a new state) is the one the cards land on.
test("the snap uses the layout as it is when the effect ends", () => {
  let lay = { AS: { x: 1 } };
  const landed = [];
  const { run } = rig({ snap: () => landed.push(lay.AS.x) });
  run.start(fakeSim({ steps: 100 }));
  run.step(0.05);
  lay = { AS: { x: 7 } }; // relayout during the effect
  run.end(); // show() of the next state cuts it short
  assert.deepEqual(landed, [7]);
});

test("busy gates exactly the span of the run, even when ended twice or restarted at once", () => {
  const { run, log } = rig();
  run.start(fakeSim({ steps: 100 }));
  run.end();
  run.start(fakeSim({ steps: 1 }));
  run.step(0.05);
  run.end();
  assert.deepEqual(log.busy, [true, false, true, false]);
  assert.equal(log.done, 2);
});
