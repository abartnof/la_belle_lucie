// From cassino web3d/src/engine.js @ 73f0cd7: the generic part only (guard,
// decodeBase64, and loadWasm, which is the alloc / write / out half of
// cassino's loadEngine). Cassino's API object (start, send, offer, hint, the
// tutor's calls, ...) is its own protocol and stays in the game.
//
// A game's engine.js is then:
//
//   import { guard, loadWasm } from "../../kit/js/engine.js";
//   export async function loadEngine(bytes, onTrap) {
//     const { exports: ex, out, write } = await loadWasm(bytes, "strohmandeln");
//     return guard({ state: () => { ex.strohmandeln_render(); return out(); }, ... }, onTrap);
//   }
//
// The ABI the module keeps (one prefix per game): `<prefix>_alloc(n)` returns
// the address of n writable bytes; `<prefix>_out()` and `<prefix>_out_len()`
// give the address and length of the JSON the last call left to read.

// Instantiates the module and wraps its three ABI exports. `instantiate` is
// WebAssembly.instantiate unless a test hands in another.
export async function loadWasm(bytes, prefix, { imports = {}, instantiate = (b, i) => WebAssembly.instantiate(b, i) } = {}) {
  const { instance } = await instantiate(bytes, imports);
  const ex = instance.exports;
  const names = [`${prefix}_alloc`, `${prefix}_out`, `${prefix}_out_len`];
  if (names.some((n) => typeof ex[n] !== "function") || !ex.memory?.buffer) {
    throw new Error(`the module lacks its ABI exports: ${names.join(", ")}, memory`);
  }
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  // Read memory.buffer afresh every time: the module may grow its memory,
  // which detaches any view taken before.
  const out = () => JSON.parse(dec.decode(new Uint8Array(ex.memory.buffer, ex[names[1]](), ex[names[2]]())));
  // Text into the module's memory; returns its length in bytes, which is what
  // a call that takes text is then given.
  const write = (text) => {
    const encoded = enc.encode(text);
    const at = ex[names[0]](encoded.length);
    new Uint8Array(ex.memory.buffer, at, encoded.length).set(encoded);
    return encoded.length;
  };
  return { exports: ex, out, write };
}

// A fault in the module (a panic aborts; a borrow left held makes every
// later call fail): the first is told to `onTrap` and the engine is then
// still, taking nothing and answering what is harmless, so the page can
// offer a reload of the saved sitting rather than go on over a broken engine.
// The protocol it expects of `api`: `send` answers { ok, state }, `step`
// { stepped, state }, `restore` { ok, error }, `state` a state; any other
// call answers null once stopped.
export function guard(api, onTrap) {
  let dead = false;
  let last = null;
  const note = (r) => {
    const s = r && typeof r === "object" ? (r.state ?? r) : null;
    if (s && s.prompt !== undefined) last = s;
    return r;
  };
  const stilled = (name) => {
    const state = { ...(last ?? {}), error: "The table has stopped.", error_code: "stopped" };
    if (name === "send") return { ok: false, state };
    if (name === "step") return { stepped: false, state };
    if (name === "restore") return { ok: false, error: state.error };
    return name === "state" ? last : null;
  };
  const out = {};
  for (const [name, fn] of Object.entries(api)) {
    out[name] = (...args) => {
      if (dead) return stilled(name);
      try {
        return note(fn(...args));
      } catch (error) {
        dead = true;
        onTrap(error);
        return stilled(name);
      }
    };
  }
  // Whether the module has faulted (and so answers nothing): a caller that
  // would act on a null answer asks first.
  out.stopped = () => dead;
  return out;
}

export function decodeBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
