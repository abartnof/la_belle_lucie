import assert from "node:assert/strict";
import { test } from "node:test";
import { hopHeight } from "../src/motion.js";

test("a card in flight rides high for most of its hop and only drops at the end", () => {
  assert.equal(hopHeight(0, 3), 0);
  assert.equal(hopHeight(1, 3), 0);
  assert.equal(hopHeight(0.5, 3), 3);
  // above any spread fan (1.2 cm) soon after leaving and until just before landing
  assert.ok(hopHeight(0.15, 3) > 1.5);
  assert.ok(hopHeight(0.85, 3) > 1.5);
  assert.ok(hopHeight(1.2, 3) === 0 && hopHeight(-1, 3) === 0);
  let last = -1;
  for (let u = 0; u <= 0.5; u += 0.05) {
    assert.ok(hopHeight(u, 3) >= last);
    last = hopHeight(u, 3);
  }
});
