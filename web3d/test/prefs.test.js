import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPrefs, savePrefs, DEFAULTS, encodeRules, decodeRules, PRESETS, presetOf, stepRedeals, parseSeed, TABLES, REDEAL_FX } from "../src/prefs.js";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } };

test("defaults when nothing is kept, and with no store at all", () => {
  assert.deepEqual(loadPrefs(memory()).settings, DEFAULTS);
  assert.deepEqual(loadPrefs(null).settings, DEFAULTS);
  assert.equal(loadPrefs(null).rules, 4);
});

test("storage that throws never throws out", () => {
  assert.deepEqual(loadPrefs(broken).settings, DEFAULTS);
  assert.doesNotThrow(() => savePrefs(broken, loadPrefs(null)));
});

test("round trip, and odd values fall back to defaults", () => {
  const store = memory();
  const p = loadPrefs(store);
  p.settings = { ...p.settings, hints: false, table: "grain", faces: "jumbo", speed: "instant" };
  p.rules = 37;
  p.seen = ["table", "redeal"];
  savePrefs(store, p);
  const q = loadPrefs(store);
  assert.deepEqual(q, p);
  store.setItem("la-belle-lucie.prefs", JSON.stringify({ hints: "yes", table: "nope", faces: 3, rules: 999, seen: [1, "king"] }));
  const r = loadPrefs(store);
  assert.deepEqual(r.settings, DEFAULTS);
  assert.equal(r.rules, 4);
  assert.deepEqual(r.seen, ["king"]);
  store.setItem("la-belle-lucie.prefs", "{not json");
  assert.deepEqual(loadPrefs(store).settings, DEFAULTS);
});

test("reduced motion starts the speed at instant, unless a speed was kept", () => {
  assert.equal(loadPrefs(memory(), { reducedMotion: true }).settings.speed, "instant");
  const store = memory();
  savePrefs(store, { settings: { ...DEFAULTS, speed: "normal" }, rules: 4, seen: [] });
  assert.equal(loadPrefs(store, { reducedMotion: true }).settings.speed, "normal");
});

test("table patterns are the kit's", () => {
  assert.ok(TABLES.includes("plain") && TABLES.includes("grain"));
});

test("presets are RULES.md's codes and decode to their options", () => {
  assert.deepEqual(PRESETS.map((p) => [p.id, p.code]), [["classic", 4], ["draw", 12], ["fan", 16], ["trefoil", 37]]);
  for (const p of PRESETS) {
    assert.equal(encodeRules(decodeRules(p.code)), p.code);
    assert.ok(p.source.length > 0);
    assert.equal(presetOf(p.code), p.id);
  }
  assert.deepEqual(decodeRules(37), { inorder: true, redeals: 2, draw: false, king: false, trefoil: true });
  assert.deepEqual(decodeRules(16), { inorder: false, redeals: 0, draw: false, king: true, trefoil: false });
  assert.equal(presetOf(5), "custom");
});

test("every rules code survives a round trip", () => {
  for (let c = 0; c < 64; c++) {
    if (((c >> 1) & 3) === 3) continue;
    if (((c >> 1) & 3) === 1) continue; // one redeal: no source
    assert.equal(encodeRules(decodeRules(c)), c);
  }
});

test("the redeal stepper moves between what sources support only", () => {
  assert.equal(stepRedeals(0, 1), 2);
  assert.equal(stepRedeals(2, 1), 2);
  assert.equal(stepRedeals(2, -1), 0);
  assert.equal(stepRedeals(0, -1), 0);
});

test("deal numbers: whole numbers in range, else random", () => {
  assert.equal(parseSeed("  1874 "), 1874);
  assert.equal(parseSeed(""), null);
  assert.equal(parseSeed("abc"), null);
  assert.equal(parseSeed("-3"), null);
  assert.equal(parseSeed("99999999999"), null);
  assert.equal(parseSeed("4294967296"), null);
  assert.equal(parseSeed("0"), 0);
});

test("the redeal animation is kept, and an unknown one falls back to random", () => {
  const store = memory();
  assert.equal(loadPrefs(store).settings.redealFx, "random");
  const p = loadPrefs(store);
  for (const fx of REDEAL_FX) {
    p.settings = { ...p.settings, redealFx: fx };
    savePrefs(store, p);
    assert.equal(loadPrefs(store).settings.redealFx, fx);
  }
  assert.deepEqual(REDEAL_FX.slice(0, 2), ["random", "tornado"]);
  assert.equal(REDEAL_FX.at(-1), "simple");
  store.setItem("la-belle-lucie.prefs", JSON.stringify({ redealFx: "confetti" }));
  assert.equal(loadPrefs(store).settings.redealFx, "random");
});
