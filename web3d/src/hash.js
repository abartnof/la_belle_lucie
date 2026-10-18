// The URL hash of a shared deal (pure, so Node tests can run it).

// "#seed=12&rules=4" -> { seed, rules, badSeed } (seed and rules null if absent or
// not a whole number in range; badSeed is the text of a seed that was given but
// is not valid, so the menu can say so instead of dealing a random game).
export function parseHash(hash) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ""));
  const num = (k, max) => {
    const v = params.get(k);
    return v !== null && /^\d{1,10}$/.test(v) && Number(v) <= max ? Number(v) : null;
  };
  const seed = num("seed", 4294967295);
  const raw = params.get("seed");
  return { seed, rules: num("rules", 63), badSeed: seed === null && raw ? raw.slice(0, 24) : null };
}

export const hashFor = (seed, rules) => `#seed=${seed}&rules=${rules}`;
