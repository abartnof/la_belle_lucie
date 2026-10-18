import { test } from "node:test";
import assert from "node:assert/strict";
import { firstMenu } from "../src/menu-start.js";

test("nothing given: Classic, random deal", () => {
  assert.deepEqual(firstMenu({ seed: null, rules: null }, {}), { seed: null, rules: 4 });
  assert.deepEqual(firstMenu(undefined, undefined), { seed: null, rules: 4 });
});
test("the last game's rules are remembered", () => {
  assert.deepEqual(firstMenu({ seed: null, rules: null }, { rules: 37 }), { seed: null, rules: 37 });
});
test("a shared deal prefills seed and rules, beating the prefs", () => {
  assert.deepEqual(firstMenu({ seed: 7, rules: 16 }, { rules: 37 }), { seed: 7, rules: 16 });
  assert.deepEqual(firstMenu({ seed: 0, rules: null }, { rules: 12 }), { seed: 0, rules: 12 });
});
test("rules from the hash or the prefs are shown as the engine will deal them", () => {
  assert.equal(firstMenu({ seed: null, rules: 63 }, {}).rules, 61);
  assert.equal(firstMenu({ seed: null, rules: null }, { rules: 99 }).rules, 4);
});
test("a bad seed in the hash is carried to the menu as text, to be flagged", () => {
  assert.equal(firstMenu({ seed: null, rules: null, badSeed: "4294967296" }, {}).seed, "4294967296");
});
