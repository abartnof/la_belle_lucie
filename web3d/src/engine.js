// The engine as the page calls it (docs/PROTOCOL.md): one function a call.
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
      new: ({ seed }) => {
        ex.la_belle_lucie_new(seed >>> 0);
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
