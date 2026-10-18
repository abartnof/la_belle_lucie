// What the page keeps in the browser, and the rules code (docs/RULES.md).
// Every read and write is inside try/catch: storage may be missing, full or
// blocked, and the page then starts from the defaults.

import { PATTERNS } from "../../kit/js/surfaces.js";

const KEY = "la-belle-lucie.prefs";
const VERSION = 1;

export const TABLES = Object.freeze(PATTERNS.map((p) => p.id));
export const FACES = Object.freeze(["auto", "classic", "jumbo"]);
export const SPEEDS = Object.freeze(["normal", "instant"]);

// Superficial settings: look, motion, aids.
export const DEFAULTS = Object.freeze({
  hints: true,
  table: "plain",
  faces: "auto",
  autoHome: false,
  speed: "normal",
  highlight: true,
  showMoves: true,
});

export const CLASSIC = 4;

const isBool = (x) => typeof x === "boolean";

function checked(kept, reducedMotion) {
  const k = kept && typeof kept === "object" ? kept : {};
  const out = { ...DEFAULTS };
  for (const key of ["hints", "autoHome", "highlight", "showMoves"]) if (isBool(k[key])) out[key] = k[key];
  if (TABLES.includes(k.table)) out.table = k.table;
  if (FACES.includes(k.faces)) out.faces = k.faces;
  out.speed = SPEEDS.includes(k.speed) ? k.speed : reducedMotion ? "instant" : DEFAULTS.speed;
  return {
    settings: out,
    rules: Number.isInteger(k.rules) && k.rules >= 0 && k.rules < 64 ? k.rules : CLASSIC,
    seen: Array.isArray(k.seen) ? [...new Set(k.seen.filter((s) => typeof s === "string"))] : [],
  };
}

// The browser's store, or null if even asking for it throws.
export function defaultStore() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// -> { settings, rules (the last new game's code), seen (tutorial pages read) }
export function loadPrefs(store, { reducedMotion = false } = {}) {
  let kept = null;
  try {
    kept = JSON.parse(store?.getItem(KEY) ?? "null");
  } catch {
    kept = null;
  }
  return checked(kept, reducedMotion);
}

export function savePrefs(store, prefs) {
  try {
    store?.setItem(KEY, JSON.stringify({ v: VERSION, ...prefs.settings, rules: prefs.rules, seen: prefs.seen }));
  } catch {
    // Not kept, this time.
  }
}

// ---- the rules code: bit 0 in order | bits 1-2 redeals | 3 draw | 4 king | 5 trefoil

export const REDEAL_STEPS = Object.freeze([0, 2]); // what the sources support

export function decodeRules(code) {
  return {
    inorder: (code & 1) !== 0,
    redeals: Math.min(2, (code >> 1) & 3),
    draw: (code & 8) !== 0,
    king: (code & 16) !== 0,
    trefoil: (code & 32) !== 0,
  };
}

export function encodeRules({ inorder, redeals, draw, king, trefoil }) {
  const r = redeals >= 2 ? 2 : 0;
  return (inorder ? 1 : 0) | (r << 1) | (draw ? 8 : 0) | (king ? 16 : 0) | (trefoil ? 32 : 0);
}

// The redeal stepper: the next supported number up or down, stopping at the ends.
export function stepRedeals(n, dir) {
  const i = REDEAL_STEPS.indexOf(n);
  const at = i < 0 ? 0 : i;
  return REDEAL_STEPS[Math.max(0, Math.min(REDEAL_STEPS.length - 1, at + (dir > 0 ? 1 : -1)))];
}

export const PRESETS = Object.freeze([
  { id: "classic", name: "Classic", code: 4, source: "Cadogan, 1874; Morehead and Mott-Smith, 1949", words: "Two shuffled redeals. The game as most books give it." },
  { id: "draw", name: "With the draw", code: 12, source: "Dick, 1884; Morehead and Mott-Smith, 1949", words: "As Classic, and on the last deal you may draw one buried card." },
  { id: "fan", name: "The Fan", code: 16, source: "Cavendish, 1890", words: "A king may fill an empty fan, but there is no redeal." },
  { id: "trefoil", name: "Trefoil", code: 37, source: "Hoffmann, 1892", words: "The aces start at home, and the redeals are dealt in order." },
]);

export const OPTIONS = Object.freeze({
  inorder: { name: "Redeal", words: "Shuffled, or dealt back in the order the fans lie. Dick (1884) records both; Hoffmann (1892) deals in order." },
  redeals: { name: "Redeals", words: "How many times you may gather and deal again when stuck: none, or two. Cadogan (1874) allows two; Cavendish (1890) none." },
  draw: { name: "The draw", words: "On the last deal, one buried card may be drawn out and played at once. Dick (1884); Morehead and Mott-Smith (1949)." },
  king: { name: "Kings fill", words: "A king may move into an empty fan. Cavendish (1890)." },
  trefoil: { name: "Aces start home", words: "The aces are placed on the foundations and 48 cards are dealt in sixteen fans. Hoffmann (1892)." },
});

export function presetOf(code) {
  return PRESETS.find((p) => p.code === code)?.id ?? "custom";
}

// A deal number from the menu's text: null (random) if empty or not a whole
// number in range.
export function parseSeed(text) {
  const t = String(text ?? "").trim();
  if (!/^\d{1,10}$/.test(t)) return null;
  const n = Number(t);
  return n <= 4294967295 ? n : null;
}
