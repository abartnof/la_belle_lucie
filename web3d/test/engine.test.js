// The page's engine wrapper against the real module, when it has been built
// (bin/gate builds it first): `cargo build --release --target wasm32-unknown-unknown -p la-belle-lucie-wasm`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEngine } from "../src/engine.js";

const wasm = fileURLToPath(new URL("../../target/wasm32-unknown-unknown/release/la_belle_lucie_wasm.wasm", import.meta.url));
const built = existsSync(wasm);

test("a new table, a draw, and the same seed again", { skip: !built && "wasm not built" }, async () => {
  const engine = await loadEngine(readFileSync(wasm), () => assert.fail("trapped"));
  const first = engine.new({ seed: 5 });
  assert.equal(first.stock, 52);
  const { ok, state } = engine.send("draw");
  assert.ok(ok);
  assert.equal(state.stock, 51);
  assert.equal(state.hand.length, 1);
  const again = engine.new({ seed: 5 });
  assert.equal(engine.send("draw").state.hand[0], state.hand[0], "a seed fixes the deal");
  assert.equal(again.stock, 52);
});

test("a command the engine refuses is not ok", { skip: !built && "wasm not built" }, async () => {
  const engine = await loadEngine(readFileSync(wasm), () => assert.fail("trapped"));
  engine.new({ seed: 1 });
  assert.equal(engine.send("fly").ok, false);
});
