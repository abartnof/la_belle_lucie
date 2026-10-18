// Strohmandeln kit change: a game passes its own eyes to the framing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aim, cameraFor, framing } from "../js/framing.js";
import { CAMERA, CAMERA_PORTRAIT } from "../js/units.js";

test("the framing uses Cassino's eyes unless the game passes its own", () => {
  const phone = framing(390 / 844, 0, 844);
  assert.deepEqual([...phone.position], [...CAMERA_PORTRAIT.position]);
  const mine = { ...CAMERA_PORTRAIT, position: [0, 80, 30], target: [0, 0, -10] };
  const own = framing(390 / 844, 0, 844, undefined, null, CAMERA, mine);
  assert.deepEqual([...own.position], [0, 80, 30]);
  assert.deepEqual([...own.target], [0, 0, -10]);
  assert.notEqual(own.position[1], phone.position[1]);
});

test("a wider reach asks for a wider field, upright", () => {
  const wide = { ...CAMERA_PORTRAIT, reach: { up: 0.6, down: -0.6, across: 0.45 } };
  assert.ok(framing(390 / 844, 0, 844, undefined, null, CAMERA, wide).fov > framing(390 / 844, 0, 844).fov);
});

test("aim and cameraFor pass the portrait eye on", () => {
  const mine = { ...CAMERA_PORTRAIT, position: [0, 70, 20], target: [0, 0, -10] };
  const camera = cameraFor(390 / 844, 0, 844, undefined, null, CAMERA, mine);
  assert.ok(Math.abs(camera.position.y - 70) < 1e-9);
  assert.equal(typeof aim, "function");
});
