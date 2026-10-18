// The page's engine wrapper against the real module, when it has been built
// (bin/gate builds it first): `cargo build --release --target wasm32-unknown-unknown -p la-belle-lucie-wasm`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEngine } from "../src/engine.js";

const wasm = fileURLToPath(new URL("../../target/wasm32-unknown-unknown/release/la_belle_lucie_wasm.wasm", import.meta.url));
const built = existsSync(wasm);
const skip = !built && "wasm not built";
const load = () => loadEngine(readFileSync(wasm), () => assert.fail("trapped"));

test("a new table is dealt as the rules say", { skip }, async () => {
  const engine = await load();
  const classic = engine.new({ seed: 5, rules: 4 });
  assert.equal(classic.protocol, 2);
  assert.equal(classic.prompt, "play");
  assert.equal(classic.fans.length, 18);
  assert.equal(classic.fans.flat().length, 52);
  assert.equal(classic.redeals_left, 2);
  const trefoil = engine.new({ seed: 5, rules: 37 });
  assert.equal(trefoil.fans.length, 16);
  assert.deepEqual(trefoil.home, [1, 1, 1, 1]);
  assert.equal(engine.state().rules, 37);
});

test("the same seed deals the same table, another seed another", { skip }, async () => {
  const engine = await load();
  const a = engine.new({ seed: 5, rules: 4 });
  const b = engine.new({ seed: 5, rules: 4 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.fans, engine.new({ seed: 6, rules: 4 }).fans);
});

test("a legal move is accepted, undone, and a hint is asked for and cleared", { skip }, async () => {
  const engine = await load();
  const start = engine.new({ seed: 3, rules: 4 });
  const asked = engine.send("hint");
  assert.ok(asked.ok);
  const hint = asked.state.hint;
  assert.ok(asked.state.legal.includes(hint.move), "the hint is a legal move");
  assert.equal(asked.state.moves, 0);
  const played = engine.send(`move ${hint.move}`);
  assert.ok(played.ok);
  assert.equal(played.state.moves, 1);
  assert.equal(played.state.hint, null);
  assert.ok(played.state.undoable);
  const undone = engine.send("undo");
  assert.ok(undone.ok);
  assert.deepEqual(undone.state, start);
});

test("a command the engine refuses is not ok and changes nothing", { skip }, async () => {
  const engine = await load();
  const before = engine.new({ seed: 1, rules: 4 });
  for (const bad of ["fly", "move f0>f0", "redeal", "undo"]) {
    const { ok, state } = engine.send(bad);
    assert.equal(ok, false, bad);
    assert.deepEqual(state, before);
  }
});
