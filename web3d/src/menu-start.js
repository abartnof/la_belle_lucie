// What the first New game menu shows (docs/UI.md): a shared deal's seed and
// rules from the URL hash if it has them, else the last game's rules from the
// prefs, else Classic; the deal number empty (random) unless the hash gave one.
// Pure. The page never deals before the player confirms.

import { CLASSIC, normalizeRules } from "./prefs.js";

// given: { seed, rules, badSeed } from the hash (each may be null). prefs: { rules }.
export function firstMenu(given, prefs) {
  return { seed: given?.seed ?? given?.badSeed ?? null, rules: normalizeRules(given?.rules ?? prefs?.rules ?? CLASSIC) };
}
