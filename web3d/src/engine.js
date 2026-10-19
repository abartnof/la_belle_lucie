// The engine as the page calls it (docs/PROTOCOL.md): `new({seed, rules})`, `lesson({layout, rules})`,
// `send(command)` answering { ok, state }, and `state()`.
// A fault in the module (a panic) is told once to `onTrap`, and the engine is
// still after it (kit/js/engine.js `guard`).
import { guard, loadWasm } from "../../kit/js/engine.js";

export async function loadEngine(bytes, onTrap, options) {
  const { exports: ex, out, write } = await loadWasm(bytes, "la_belle_lucie", options);
  for (const name of ["la_belle_lucie_new", "la_belle_lucie_send", "la_belle_lucie_lesson"]) {
    if (typeof ex[name] !== "function") throw new Error(`the module lacks ${name}`);
  }
  return guard(
    {
      // rules: the code of docs/RULES.md (4, Classic, unless given).
      new: ({ seed, rules = 4 }) => {
        ex.la_belle_lucie_new(seed >>> 0, rules >>> 0);
        return out();
      },
      // A game from a layout text (docs/PROTOCOL.md): the state, or null if refused
      // (the old table stays). Seed 0; not a seeded deal.
      lesson: ({ layout, rules = 4 }) => {
        const ok = ex.la_belle_lucie_lesson(write(layout), rules >>> 0) === 1;
        const state = out();
        return ok ? state : null;
      },
      send: (command) => {
        const ok = ex.la_belle_lucie_send(write(command)) === 1;
        return { ok, state: out() };
      },
      state: () => out(),
    },
    onTrap,
  );
}
