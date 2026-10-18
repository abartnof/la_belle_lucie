import { test } from "node:test";
import assert from "node:assert/strict";
import { hintText, cardName, PRINCIPLES } from "../src/hints.js";

const RULES = ["home", "dig", "uncover", "build", "king", "redeal", "draw", "least_bad"];
const MOVES = {
  home: { move: "f3>h", card: "5S", onto: null, uncovers: "4S" },
  dig: { move: "f3>f5", card: "6H", onto: "7H", uncovers: "TD" },
  uncover: { move: "f1>f9", card: "9C", onto: "TC", uncovers: "AH" },
  build: { move: "f3>f5", card: "6H", onto: "7H", uncovers: null },
  king: { move: "f2>f7", card: "KD", onto: null, uncovers: "2S" },
  redeal: { move: "redeal", card: null, onto: null, uncovers: null },
  draw: { move: "draw f2:1>f5", card: "4S", onto: "5S", uncovers: null },
  least_bad: { move: "f3>f5", card: "QC", onto: "KC", uncovers: null },
};
const CARD = /\b[A2-9TJQK][SHDC]\b|[♠♥♦♣]/;
const sentences = (t) => t.split(/(?<=[.!?])\s+/);

test("card names: ranks and suit symbols, T is 10", () => {
  assert.equal(cardName("6H"), "6♥");
  assert.equal(cardName("TS"), "10♠");
  assert.equal(cardName("AC"), "A♣");
});

test("every rule, many move counts: exactly two sentences, principle free of cards and numbers", () => {
  for (const rule of RULES) {
    for (let moves = 0; moves < 12; moves++) {
      const hint = { rule, ...MOVES[rule] };
      const t = hintText(hint, { moves });
      assert.equal(sentences(t.do).length, 1, t.do);
      assert.equal(sentences(t.why).length, 1, t.why);
      assert.equal(sentences(`${t.do} ${t.why}`).length, 2);
      assert.match(t.do, /\.$/);
      assert.match(t.why, /\.$/);
      assert.doesNotMatch(t.why, /\d/, t.why);
      assert.doesNotMatch(t.why, CARD, t.why);
      assert.doesNotMatch(t.why, /\b(ace|king|queen|jack|deuce|f\d)\b/i, t.why);
      if (hint.card) assert.ok(t.do.includes(cardName(hint.card)), t.do);
      if (hint.onto) assert.ok(t.do.includes(cardName(hint.onto)), t.do);
    }
  }
});

test("the example sentence", () => {
  assert.equal(hintText({ rule: "build", ...MOVES.build }, { moves: 0 }).do, "Move the 6♥ onto the 7♥.");
});

test("each rule has one or two phrasings, chosen by move count, deterministic", () => {
  for (const rule of RULES) {
    assert.ok(PRINCIPLES[rule].length >= 1 && PRINCIPLES[rule].length <= 2);
    const a = hintText({ rule, ...MOVES[rule] }, { moves: 4 });
    assert.deepEqual(a, hintText({ rule, ...MOVES[rule] }, { moves: 4 }));
  }
  const seen = new Set([0, 1].map((moves) => hintText({ rule: "home", ...MOVES.home }, { moves }).why));
  assert.equal(seen.size, 2);
});

test("an unknown rule still gives two sentences", () => {
  const t = hintText({ rule: "mystery", move: "f1>f2", card: "2S", onto: "3S", uncovers: null }, { moves: 0 });
  assert.equal(sentences(`${t.do} ${t.why}`).length, 2);
});
