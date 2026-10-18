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
