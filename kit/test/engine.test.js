// The kit's wasm wrapper: alloc / out / JSON decode, and guard. The mock
// instance stands in for a game's module: exports named `<prefix>_alloc`,
// `<prefix>_out`, `<prefix>_out_len` and a `memory`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeBase64, guard, loadWasm } from "../js/engine.js";

function fakeModule(prefix = "game") {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 4 });
  let current = memory;
  let reply = "";
  const ex = {
    get memory() {
      return current;
    },
    [`${prefix}_alloc`]: (n) => {
      assert.ok(n > 0);
      return 100;
    },
    // The module writes its reply at 1000 and says how long it is.
    [`${prefix}_out`]: () => 1000,
    [`${prefix}_out_len`]: () => new TextEncoder().encode(reply).length,
    say(value) {
      reply = JSON.stringify(value);
      new Uint8Array(current.buffer).set(new TextEncoder().encode(reply), 1000);
    },
    grow: () => current.grow(1),
  };
  const instantiate = async () => ({ instance: { exports: ex } });
  return { ex, instantiate };
}

test("write puts text in the module's memory and returns its byte length", async () => {
  const { ex, instantiate } = fakeModule();
  const wasm = await loadWasm(new Uint8Array(), "game", { instantiate });
  assert.equal(wasm.write("héllo"), 6, "bytes, not characters");
  assert.equal(new TextDecoder().decode(new Uint8Array(ex.memory.buffer, 100, 6)), "héllo");
});

test("out decodes the module's JSON reply", async () => {
  const { ex, instantiate } = fakeModule();
  const wasm = await loadWasm(new Uint8Array(), "game", { instantiate });
  ex.say({ prompt: "play", n: [1, 2] });
  assert.deepEqual(wasm.out(), { prompt: "play", n: [1, 2] });
});

test("memory growth does not leave a stale view: out and write read the buffer afresh", async () => {
  const { ex, instantiate } = fakeModule();
  const wasm = await loadWasm(new Uint8Array(), "game", { instantiate });
  ex.say({ a: 1 });
  wasm.out();
  ex.grow(); // detaches the old buffer
  ex.say({ a: 2 });
  assert.deepEqual(wasm.out(), { a: 2 });
  assert.equal(wasm.write("x"), 1);
});

test("the prefix names the exports, so another game's module works the same", async () => {
  const { ex, instantiate } = fakeModule("tarock");
  const wasm = await loadWasm(new Uint8Array(), "tarock", { instantiate });
  ex.say({ ok: true });
  assert.deepEqual(wasm.out(), { ok: true });
  assert.equal(wasm.exports, ex);
});

test("a module lacking the ABI exports is refused at once, naming them", async () => {
  const { instantiate } = fakeModule("game");
  await assert.rejects(loadWasm(new Uint8Array(), "other", { instantiate }), /other_alloc.*other_out.*other_out_len/);
});

test("a module without exported memory is refused too", async () => {
  const { ex } = fakeModule("game");
  delete ex.memory;
  await assert.rejects(loadWasm(new Uint8Array(), "game", { instantiate: async () => ({ instance: { exports: ex } }) }), /memory/);
});

test("decodeBase64 gives the bytes", () => {
  assert.deepEqual([...decodeBase64("AQID")], [1, 2, 3]);
});

// A fault in the module (a panic aborts; a borrow left held makes later
// calls fail too): the page is told once, and the engine then answers
// nothing and takes nothing, the last state standing.
// From cassino web3d/test/engine.test.js @ 73f0cd7.
test("a fault in the module is told once, and the engine is then still", () => {
  let calls = 0;
  const told = [];
  const api = {
    start: () => ({ prompt: "play", n: 1 }),
    send: (c) => {
      calls++;
      if (c === "boom") throw new WebAssembly.RuntimeError("unreachable");
      return { ok: true, state: { prompt: "play", n: 2 } };
    },
    restore: () => ({ ok: true, state: { prompt: "play", n: 3 } }),
    brief: () => ({ bullets: [] }),
  };
  const engine = guard(api, (error) => told.push(error));
  engine.start({});
  assert.equal(engine.send("a").ok, true);
  const failed = engine.send("boom");
  assert.equal(failed.ok, false);
  assert.equal(failed.state.n, 2, "the last state stands");
  assert.equal(told.length, 1);
  assert.equal(engine.send("a").ok, false);
  assert.equal(calls, 2, "nothing more sent to the module");
  assert.equal(engine.brief(null, []), null);
  assert.equal(engine.restore("x").ok, false);
  assert.equal(told.length, 1);
  assert.equal(engine.stopped(), true);
});
