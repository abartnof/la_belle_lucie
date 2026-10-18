// The engine as the page calls it (docs/PROTOCOL.md): `new({seed, rules})`,
// `send(command)` answering { ok, state }, and `state()`.
// A fault in the module (a panic) is told once to `onTrap`, and the engine is
// still after it (kit/js/engine.js `guard`).
import { guard, loadWasm } from "../../kit/js/engine.js";

export async function loadEngine(bytes, onTrap, options) {
  const { exports: ex, out, write } = await loadWasm(bytes, "la_belle_lucie", options);
  for (const name of ["la_belle_lucie_new", "la_belle_lucie_send"]) {
    if (typeof ex[name] !== "function") throw new Error(`the module lacks ${name}`);
  }
  return guard(
    {
      // rules: the code of docs/RULES.md (4, Classic, unless given).
      new: ({ seed, rules = 4 }) => {
        ex.la_belle_lucie_new(seed >>> 0, rules >>> 0);
        return out();
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
