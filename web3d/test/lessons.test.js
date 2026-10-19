import { test } from "node:test";
import assert from "node:assert/strict";
import { LESSONS, arrowFor, viewOf } from "../src/lessons.js";
import { createLessonRun } from "../src/lesson-run.js";
import { createMockEngine } from "./mock-engine.js";

const by = (id) => LESSONS.find((l) => l.id === id);
const st = (o) => ({ prompt: "play", fans: [], home: [0, 0, 0, 0], legal: [], redeals_left: 2, moves: 0, ...o });

test("there are six lessons, each with a layout, words of at most two sentences, and a done predicate", () => {
  assert.equal(LESSONS.length, 6);
  for (const l of LESSONS) {
    assert.match(l.layout, /;/);
    for (const t of [l.text, l.doneText]) assert.ok(t.split(/(?<=[.!?])\s/).length <= 2, `${l.id}: ${t}`);
    assert.equal(typeof l.done, "function");
  }
});

test("build: done once the 6H lies on the 7H", () => {
  const l = by("build");
  assert.equal(l.done(st({ fans: [["3S", "6H"], ["KC", "7H"]] })), false);
  assert.equal(l.done(st({ fans: [["3S"], ["KC", "7H", "6H"]] })), true);
});

test("home: done when the ace and the 2 of spades are home, not before", () => {
  const l = by("home");
  assert.equal(l.done(st({ home: [1, 0, 0, 0] })), false);
  assert.equal(l.done(st({ home: [2, 0, 0, 0] })), true);
});

test("only the top card moves: done when the 6H is on the 7H", () => {
  const l = by("top");
  assert.equal(l.done(st({ fans: [["6H"], ["KS", "7H"], ["3D", "TC", "9C"]] })), false);
  assert.equal(l.done(st({ fans: [[], ["KS", "7H", "6H"], ["3D", "TC", "9C"]] })), true);
});

test("redeal: done once a redeal is spent", () => {
  const l = by("redeal");
  assert.equal(l.done(st({ redeals_left: 2 })), false);
  assert.equal(l.done(st({ redeals_left: 1 })), true);
});

test("win: done when the prompt is won", () => {
  const l = by("win");
  assert.equal(l.done(st({})), false);
  assert.equal(l.done(st({ prompt: "won" })), true);
});

test("the check: the free build completes it; the costly one reacts and does not", () => {
  const l = by("check");
  const start = st({ home: [1, 0, 0, 0], fans: [["2S", "7H"], ["9C", "6H"], ["5H"]] });
  assert.equal(l.done(start), false);
  assert.equal(l.reaction(start), null);
  const bad = st({ home: [1, 0, 0, 0], fans: [["2S", "7H", "6H"], ["9C"], ["5H"]] });
  assert.equal(l.done(bad), false);
  const said = l.reaction(bad);
  assert.match(said, /2♠ is trapped under the 6♥ and 7♥/);
  assert.match(said, /seven hearts/);
  assert.match(said, /Undo/);
  const good = st({ home: [1, 0, 0, 0], fans: [["2S", "7H"], ["9C", "6H", "5H"], []] });
  assert.equal(l.done(good), true);
  assert.equal(l.reaction(good), null);
  // Costly and then the free one on top: still the reaction, not done.
  const both = st({ home: [1, 0, 0, 0], fans: [["2S", "7H", "6H", "5H"], ["9C"], []] });
  assert.equal(l.done(both), false);
  assert.ok(l.reaction(both));
});

test("arrowFor shows the first legal candidate as a hint, none when nothing applies", () => {
  const top = by("top");
  const s0 = st({ fans: [["6H", "9C"], ["KS", "7H"], ["3D", "TC"]], legal: ["f0>f2"] });
  assert.deepEqual(arrowFor(top, s0), { move: "f0>f2", card: "9C", onto: "TC" });
  const s1 = st({ fans: [["6H"], ["KS", "7H"], ["3D", "TC", "9C"]], legal: ["f0>f1"] });
  assert.deepEqual(arrowFor(top, s1), { move: "f0>f1", card: "6H", onto: "7H" });
  assert.deepEqual(arrowFor(by("home"), st({ fans: [["KD", "2S", "AS"]], legal: ["f0>h"] })), { move: "f0>h", card: "AS", onto: null });
  assert.equal(arrowFor(by("check"), st({ fans: [["2S", "7H"]], legal: ["f0>f1"] })), null);
  assert.equal(arrowFor(top, st({ fans: [["6H"]], legal: [], prompt: "won" })), null);
});

test("viewOf: task, then done, with the right words and no arrow once done or reacting", () => {
  const home = by("home");
  const s = st({ fans: [["KD", "2S", "AS"]], legal: ["f0>h"] });
  const v = viewOf(1, s);
  assert.equal(v.kind, "task");
  assert.equal(v.done, false);
  assert.equal(v.text, home.text);
  assert.ok(v.arrow);
  const d = viewOf(1, st({ home: [2, 0, 0, 0] }));
  assert.equal(d.done, true);
  assert.equal(d.arrow, null);
  assert.equal(d.text, home.doneText);
  assert.equal(viewOf(3, st({ legal: ["redeal"] })).pointAt, "redeal");
  const r = viewOf(5, st({ home: [1, 0, 0, 0], fans: [["2S", "7H", "6H"], ["9C"], ["5H"]] }));
  assert.equal(r.kind, "reaction");
  assert.equal(r.arrow, null);
  assert.equal(r.done, false);
});

// ---- the controller, against the mock engine ---------------------------------

function harness() {
  const engine = createMockEngine();
  const log = { shown: [], panels: [], ended: [] };
  const run = createLessonRun({ engine, hooks: { show: (s) => log.shown.push(s), panel: (v) => log.panels.push(v), end: (e) => log.ended.push(e) } });
  const play = (cmd) => run.observe(engine.send(cmd).state);
  return { engine, run, log, play };
}

// The intended moves of each lesson, by card, found from the state like a player would.
function playMove(h, from, to) {
  const s = h.engine.state();
  const i = s.fans.findIndex((f) => f.at(-1) === from);
  const j = to === "home" ? "h" : `f${s.fans.findIndex((f) => f.at(-1) === to)}`;
  return h.play(`move f${i}>${j}`);
}
const SOLUTIONS = {
  build: [["6H", "7H"]],
  home: [["AS", "home"], ["2S", "home"]],
  top: [["9C", "TC"], ["6H", "7H"]],
  redeal: ["redeal"],
  win: [["KC", "home"]],
  check: [["5H", "6H"]],
};

test("the series: start, step by step with Next gated, to the end", () => {
  const h = harness();
  h.run.start();
  assert.ok(h.run.active);
  for (const [i, l] of LESSONS.entries()) {
    assert.equal(h.run.view().index, i);
    assert.equal(h.run.view().done, false);
    assert.equal(h.run.next(), false, "Next is not allowed before the lesson is done");
    assert.equal(h.run.view().index, i);
    for (const m of SOLUTIONS[l.id]) {
      if (m === "redeal") h.play("redeal");
      else playMove(h, ...m);
    }
    assert.equal(h.run.view().done, true, l.id);
    assert.equal(h.run.next(), true);
  }
  assert.equal(h.run.active, false);
  assert.deepEqual(h.log.ended, [{ skipped: false }]);
  assert.equal(h.log.panels.at(-1), null);
});

test("each lesson starts from its layout on the engine", () => {
  const h = harness();
  h.run.start();
  assert.deepEqual(h.log.shown[0].fans, [["3S", "6H"], ["KC", "7H"]]);
  assert.equal(h.log.shown[0].moves, 0);
});

test("the check lesson: the costly build reacts, Undo clears it, the free one finishes", () => {
  const h = harness();
  h.run.start();
  for (let i = 0; i < 5; i++) {
    for (const m of SOLUTIONS[LESSONS[i].id]) (m === "redeal" ? h.play("redeal") : playMove(h, ...m));
    h.run.next();
  }
  assert.equal(h.run.view().id, "check");
  playMove(h, "6H", "7H");
  assert.equal(h.run.view().kind, "reaction");
  assert.equal(h.run.next(), false);
  h.play("undo");
  assert.equal(h.run.view().kind, "task");
  playMove(h, "5H", "6H");
  assert.equal(h.run.view().done, true);
});

test("skip ends the series at once and says it was skipped", () => {
  const h = harness();
  h.run.start();
  h.run.skip();
  assert.equal(h.run.active, false);
  assert.deepEqual(h.log.ended, [{ skipped: true }]);
  h.run.skip();
  assert.equal(h.log.ended.length, 1);
  assert.equal(h.run.observe(h.engine.state()), null);
});

test("an engine that refuses a layout ends the series (skipped) rather than hang", () => {
  const log = [];
  const run = createLessonRun({ engine: { lesson: () => null }, hooks: { show() {}, panel() {}, end: (e) => log.push(e) } });
  run.start();
  assert.equal(run.active, false);
  assert.deepEqual(log, [{ skipped: true, failed: true }]);
});

// ---- the real engine, when the module is built ---------------------------------

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEngine } from "../src/engine.js";

const wasm = fileURLToPath(new URL("../../target/wasm32-unknown-unknown/release/la_belle_lucie_wasm.wasm", import.meta.url));
const skip = !existsSync(wasm) && "wasm not built";

test("every lesson's intended moves, played on the real engine, complete it; the check's costly build reacts and Undo clears it", { skip }, async () => {
  const engine = await loadEngine(readFileSync(wasm), () => assert.fail("trapped"));
  const log = { ended: [] };
  let view = null;
  const run = createLessonRun({ engine, hooks: { show() {}, panel: (v) => (view = v), end: (e) => log.ended.push(e) } });
  const play = (cmd) => {
    const r = engine.send(cmd);
    assert.ok(r.ok, `${cmd} refused`);
    run.observe(r.state);
  };
  const move = (from, to) => {
    const s = engine.state();
    const i = s.fans.findIndex((f) => f.at(-1) === from);
    const j = to === "home" ? "h" : `f${s.fans.findIndex((f) => f.at(-1) === to)}`;
    play(`move f${i}>${j}`);
  };
  run.start();
  for (const l of LESSONS) {
    assert.equal(view.id, l.id);
    assert.equal(view.done, false, `${l.id} is not done at the start`);
    assert.equal(engine.state().seed, 0);
    if (l.id !== "redeal") assert.ok(view.arrow || l.id === "check", `${l.id} shows an arrow`);
    if (l.id === "redeal") {
      assert.deepEqual(engine.state().legal, ["redeal"]);
      assert.equal(view.pointAt, "redeal");
    }
    if (l.id === "check") {
      assert.equal(engine.state().legal.length, 2);
      move("6H", "7H");
      assert.equal(view.kind, "reaction");
      assert.match(view.text, /2♠ is trapped under the 6♥ and 7♥/);
      assert.equal(run.next(), false);
      play("undo");
      assert.equal(view.kind, "task");
    }
    for (const m of SOLUTIONS[l.id]) {
      if (m === "redeal") play("redeal");
      else {
        // The arrow, when shown, is a legal move the player may make.
        if (view.arrow) assert.ok(engine.state().legal.includes(view.arrow.move));
        move(...m);
      }
    }
    assert.equal(view.done, true, `${l.id} done`);
    assert.ok(run.next());
  }
  assert.deepEqual(log.ended, [{ skipped: false }]);
});
