import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTRAST_BG, DIM, dimLevels, faceKind, invertPixels, isInverted } from "../src/look.js";

const state = (extra = {}) => ({
  prompt: "play",
  draw: "off",
  fans: [["7H", "2S", "6H"], ["AS"], ["7S", "5C", "KD"], []],
  legal: ["f0>h", "f1>h", "f0>f3"],
  ...extra,
});

test("faces: automatic is the high-visibility faces everywhere; classic stays selectable", () => {
  assert.equal(faceKind("auto"), "jumbo");
  assert.equal(faceKind("jumbo"), "jumbo");
  assert.equal(faceKind("classic"), "classic");
  assert.equal(faceKind(undefined), "jumbo");
});

test("a card under another is dimmed; a top card that can move is not", () => {
  const d = dimLevels(state());
  assert.equal(d.get("7H"), DIM.buried);
  assert.equal(d.get("2S"), DIM.buried);
  assert.equal(d.get("6H"), 1); // top, has a move
  assert.equal(d.get("AS"), 1);
  assert.equal(d.get("5C"), DIM.buried);
});

test("every top card is full brightness, whether or not it can move", () => {
  const s = state();
  const d = dimLevels(s);
  assert.equal(d.get("KD"), 1); // a top card with no move
  for (const cards of s.fans) if (cards.length) assert.equal(d.get(cards[cards.length - 1]), 1);
  const alone = dimLevels({ prompt: "play", legal: [], fans: [["QS"]] });
  assert.equal(alone.get("QS"), 1); // a singleton, nothing under it
});

test("a buried card with a legal draw is playable, so not dimmed", () => {
  const d = dimLevels(state({ draw: "ready", legal: ["draw f2:1>h", "f0>f3"] }));
  assert.equal(d.get("5C"), 1);
  assert.equal(d.get("7S"), DIM.buried);
});

test("the dim lifts when a card becomes the top", () => {
  const before = dimLevels(state());
  assert.equal(before.get("2S"), DIM.buried);
  const after = dimLevels(state({ fans: [["7H", "2S"], ["AS"], [], []], legal: ["f0>f1"] }));
  assert.equal(after.get("2S"), 1);
  assert.equal(after.get("7H"), DIM.buried);
});

test("when no move is asked for, a top card is not dimmed as stuck", () => {
  const d = dimLevels(state({ prompt: "won" }));
  assert.equal(d.get("KD"), 1);
});

test("suit contrast is a choice; clubs and diamonds are the inverted suits", () => {
  assert.equal(faceKind("contrast"), "contrast");
  assert.deepEqual(["AS", "AH", "AC", "AD"].map(isInverted), [false, false, true, true]);
  assert.ok(CONTRAST_BG.D[0] > 150 && CONTRAST_BG.D[1] < 60, "diamonds sit on red");
});

test("inverting maps paper to the card colour and ink to white", () => {
  const px = Uint8ClampedArray.from([251, 250, 246, 255, 21, 23, 28, 255, 200, 32, 44, 255]);
  invertPixels(px, [21, 23, 28]);
  assert.deepEqual([...px.slice(0, 3)], [21, 23, 28]);
  assert.deepEqual([...px.slice(4, 7)], [255, 255, 255]);
  assert.ok(px[8] > 240, "red ink becomes white");
});

import { FOCUS_BLUE } from "../src/look.js";
test("there is one focus blue", () => {
  assert.match(FOCUS_BLUE, /^#[0-9a-f]{6}$/);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(FOCUS_BLUE.slice(i, i + 2), 16));
  assert.ok(b > 200 && r < 40 && g > 80 && g < 140);
});
