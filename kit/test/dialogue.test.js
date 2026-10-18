// From cassino web3d/test/dialogue.test.js @ 73f0cd7
// From piquet web3d/test/dialogue.test.js @ 254cb3c.
// When each line is said, for the dialogue boxes (the user: "two dialogue
// boxes to pop up every move" in the declarations): every line in its turn,
// with its words, never before its moment -- and each thing said in a way
// that differs from the last time.

import test from "node:test";
import assert from "node:assert/strict";
import { LATE, PHONE_BESIDE_MIN, TURN, besideAt, boxRect, choosePlace, covers, createDialogue, saying } from "../js/dialogue.js";

const BANK = {
  groups: { "point-5": ["point-5.0"], good: ["good.0", "good.1"], "what-make": ["what-make.0"], "value-48": ["n-48.0"] },
  texts: { "point-5.0": "Five cards.", "good.0": "Good.", "good.1": "Ah, good.", "what-make.0": "What do they make?", "n-48.0": "Forty-eight." },
};

function said(lines, dialogue = createDialogue(BANK)) {
  const out = [];
  dialogue.say(lines, (line, words, ms) => out.push({ who: line.who, phrase: line.phrase, words, ms }));
  return out;
}

test("every line is said in turn, with its words", () => {
  const out = said([
    { who: "you", phrase: "point-5", delay: 0 },
    { who: "them", phrase: "what-make", delay: 0 },
    { who: "you", phrase: "value-48", delay: 0 },
    { who: "them", phrase: "good", delay: 0 },
  ]);
  assert.deepEqual(out.map((l) => l.words), ["Five cards.", "What do they make?", "Forty-eight.", out[3].words]);
  assert.ok(["Good.", "Ah, good."].includes(out[3].words));
  for (let i = 1; i < out.length; i++) assert.ok(out[i].ms > out[i - 1].ms + 200, `line ${i} comes after the one before has been said`);
});

test("no line before its moment", () => {
  const out = said([{ who: "them", phrase: "point-5", delay: 1200 }, { who: "you", phrase: "good", delay: 0 }]);
  assert.ok(out[0].ms >= 1200 - 5);
  assert.ok(out[1].ms > out[0].ms);
});

test("a batch waits for the one before it", () => {
  const dialogue = createDialogue(BANK);
  const first = said([{ who: "you", phrase: "point-5", delay: 0 }], dialogue);
  const second = said([{ who: "them", phrase: "good", delay: 0 }], dialogue);
  assert.ok(second[0].ms > first[0].ms + 200);
});

test("the same thing is not said the same way twice running", () => {
  const dialogue = createDialogue(BANK);
  const words = [];
  for (let i = 0; i < 6; i++) said([{ who: "them", phrase: "good", delay: 0 }], dialogue).forEach((l) => words.push(l.words));
  for (let i = 1; i < words.length; i++) assert.notEqual(words[i], words[i - 1]);
});

test("stop: nothing still waiting holds up what comes next", () => {
  const dialogue = createDialogue(BANK);
  said([{ who: "you", phrase: "point-5", delay: 5000 }], dialogue);
  dialogue.stop();
  const after = said([{ who: "them", phrase: "good", delay: 0 }], dialogue);
  assert.ok(after[0].ms < 100, `said ${after[0].ms} ms from now`);
});

// The score waits for the dialogue (a point is scored after "Good.", not
// before "Five cards."): the dialogue can say, at once, about when a batch of
// lines will have been said.
test("how long a batch of lines will take, told before it is said", () => {
  const dialogue = createDialogue(BANK);
  const lines = [
    { who: "you", phrase: "point-5", delay: 300 },
    { who: "them", phrase: "what-make", delay: 300 },
    { who: "you", phrase: "value-48", delay: 300 },
    { who: "them", phrase: "good", delay: 300 },
  ];
  const until = dialogue.estimate(lines);
  const out = said(lines, dialogue).map((l) => l.ms);
  assert.ok(until >= out[out.length - 1] + 200, `told ${until} ms; the last line begins at ${out[out.length - 1]}`);
  assert.ok(until < out[out.length - 1] + 2000);
});

// The moment between the declarations' rounds (breaks.js): a pause in the
// dialogue, which comes once the line before it has been said, and which
// nothing after it comes before.
test("a pause comes once the line before it has been said, and nothing after it comes sooner", () => {
  const out = said([
    { who: "you", phrase: "point-5", delay: 0 },
    { who: "them", phrase: "good", delay: 0 },
    { pause: true, delay: 0 },
    { who: "them", phrase: "point-5", delay: 0 },
  ]);
  assert.equal(out[2].words, null);
  assert.ok(out[2].ms >= out[1].ms + 250 + 65 * out[1].words.length, `the pause at ${out[2].ms}, "${out[1].words}" at ${out[1].ms}`);
  assert.ok(out[3].ms >= out[2].ms);
  assert.ok(out[3].ms < out[2].ms + 50, "and the next line straight after it");
});

test("a pause waits for its moment, as a line does", () => {
  const out = said([{ who: "you", phrase: "good", delay: 0 }, { pause: true, delay: 3000 }]);
  assert.ok(out[1].ms >= 3000 - 5);
});

// The table is paced before it is played: the words are chosen once, so the
// moments planned are the moments said.
test("what is planned is what is said", () => {
  const dialogue = createDialogue(BANK);
  const lines = dialogue.words([
    { who: "you", phrase: "point-5", delay: 0 },
    { who: "them", phrase: "good", delay: 400 },
    { pause: true, delay: 0 },
    { who: "them", phrase: "good", delay: 0 },
  ]);
  const plan = dialogue.plan(lines);
  const out = said(lines, dialogue);
  assert.deepEqual(out.map((l) => l.words), lines.map((l) => (l.pause ? null : l.words)));
  out.forEach((l, i) => assert.ok(Math.abs(l.ms - plan[i].ms) < 5, `line ${i}: planned ${plan[i].ms}, said ${l.ms}`));
  assert.ok(plan[1].end > plan[1].ms + 250, "and when each will have been said");
});

// On the table's clock, which stops while the table is held still (a page of
// the tutorial, the moment between rounds): the dialogue counts from it.
test("on the clock it is given", () => {
  let t = 0;
  const dialogue = createDialogue(BANK, () => t);
  said([{ who: "you", phrase: "point-5", delay: 0 }], dialogue);
  t = 10_000; // long since said
  const after = said([{ who: "them", phrase: "good", delay: 0 }], dialogue);
  assert.equal(after[0].ms, 0);
});

// Cassino's: the cards landed by a tap, the lines not yet said are dropped,
// and what is said next is said at once, not after them (the table
// review's T4).
test("skip: the lines still to come are forgotten, and the next is said at once", () => {
  let now = 1000;
  const dialogue = createDialogue(BANK, () => now);
  const out = [];
  const lines = [
    { who: "you", phrase: "point-5", delay: 0 },
    { who: "them", phrase: "what-make", delay: 0 },
    { who: "you", phrase: "value-48", delay: 0 },
  ];
  dialogue.say(lines, (line, words, ms) => out.push(ms));
  assert.ok(out[2] > 2000, "the third line well after the first");
  now += 100;
  dialogue.skip();
  const next = [];
  dialogue.say([{ who: "them", phrase: "good", delay: 0 }], (line, words, ms) => next.push(ms));
  assert.equal(next[0], 0, "said at once");
});

// Cassino's chatter (play-testing: the table talk "VERY verbose", the
// conversation a part of the game): a remark is said in a gap, and yields
// to the calls -- it is not said if it would make a call of a later moment
// late, or if its moment is long past.
test("chatter fills the gaps, and never makes a later call late", () => {
  const remark = { who: "you", phrase: "point-5", at: 0, delay: 0, chatter: true };
  const call = { who: "them", phrase: "good", at: 1, delay: 500 };
  assert.deepEqual(said([remark, call]).map((l) => l.phrase), ["good"], "no room for the remark before the call");
  assert.ok(said([remark, call])[0].ms <= 500 + 5, "the call at its moment");
  assert.deepEqual(said([remark, { ...call, delay: 3000 }]).map((l) => l.phrase), ["point-5", "good"], "room for both");
  // A remark is part of what is said at its own moment: a greeting before
  // the house rules is said, and they after it.
  assert.deepEqual(said([remark, { ...call, at: 0 }]).map((l) => l.phrase), ["point-5", "good"]);
});

test("a remark whose moment is long past is not said", () => {
  const long = { who: "you", phrase: "long", at: 0, delay: 0 };
  const bank = { groups: { ...BANK.groups, long: ["long.0"] }, texts: { ...BANK.texts, "long.0": "Building eights, and a nine for luck." } };
  const out = said([long, { who: "them", phrase: "good", at: 0, delay: 0, chatter: true }], createDialogue(bank));
  assert.ok(saying("Building eights, and a nine for luck.") + TURN > LATE, "the call outlasts a remark's patience");
  assert.deepEqual(out.map((l) => l.phrase), ["long"]);
  const quick = said([{ who: "you", phrase: "good", at: 0, delay: 0 }, { who: "them", phrase: "good", at: 0, delay: 0, chatter: true }]);
  assert.equal(quick.length, 2, "said soon enough after its moment");
});

test("what is planned is what is said, chatter dropped and all", () => {
  const dialogue = createDialogue(BANK);
  const lines = dialogue.words([
    { who: "you", phrase: "point-5", at: 0, delay: 0, chatter: true },
    { who: "them", phrase: "good", at: 1, delay: 500 },
    { who: "you", phrase: "good", at: 1, delay: 500, chatter: true },
  ]);
  const plan = dialogue.plan(lines);
  const out = said(lines, dialogue);
  assert.deepEqual(out.map((l) => l.words), plan.map((l) => l.words));
  out.forEach((l, i) => assert.ok(Math.abs(l.ms - plan[i].ms) < 5));
});

// The score said aloud: a line's words can carry its numbers.
test("a line's words filled in with what it carries", () => {
  const bank = { groups: { score: ["score.0"] }, texts: { "score.0": "{Lead} to {trail}, then." } };
  const out = said([{ who: "them", phrase: "score", delay: 0, vars: { lead: "seven", trail: "four" } }], createDialogue(bank));
  assert.equal(out[0].words, "Seven to four, then.");
});

// A box beside its speaker (play-testing, the game's end: "to the side of the
// opponent, with the dialogue box tail pointing at the card").
test("a box beside its speaker goes to its right, wrapping to the room there", () => {
  assert.deepEqual(besideAt({ x: 700, y: 300 }, 220, 1280), { side: "right", at: 700, room: 1280 - 8 - 700 });
  // Less room than its words want, but enough to wrap them: it wraps.
  assert.deepEqual(besideAt({ x: 230, y: 300 }, 220, 390), { side: "right", at: 230, room: 390 - 8 - 230 });
});

test("with no room to its speaker's right, a box goes to the left, its tail pointing right", () => {
  assert.deepEqual(besideAt({ x: 330, left: 160, y: 300 }, 220, 390), { side: "left", at: 160, room: 160 - 8 });
});

test("with no room either side, a box is kept on the screen at the right", () => {
  assert.deepEqual(besideAt({ x: 330, y: 300 }, 220, 390), { side: "right", at: 390 - 8 - 220, room: null });
  assert.deepEqual(besideAt({ x: 330, left: 60, y: 300 }, 220, 390), { side: "right", at: 390 - 8 - 220, room: null });
});

// On a phone a box must not hide the cards (the sixth play-testing: "in
// mobile mode, the dialog balloons can completely obscure the cards, so
// you can't play until they go away"): each speaker has places to try,
// and a box goes to the first that covers nothing it must not, or else to
// the one that covers least.
test("where a box lies for each way it can be placed", () => {
  const view = { width: 390, height: 844 };
  assert.deepEqual(boxRect({ kind: "right", x: 240, y: 230 }, 120, 60, view), { left: 240, right: 360, top: 200, bottom: 260 });
  assert.deepEqual(boxRect({ kind: "left", x: 150, y: 230 }, 120, 60, view), { left: 30, right: 150, top: 200, bottom: 260 });
  // Above or below its point, its tail between, centred and kept on the screen.
  assert.deepEqual(boxRect({ kind: "below", x: 195, y: 680 }, 200, 40, view), { left: 95, right: 295, top: 698, bottom: 738 });
  assert.deepEqual(boxRect({ kind: "above", x: 30, y: 300 }, 200, 40, view), { left: 8, right: 208, top: 242, bottom: 282 });
});

test("a box covers what it overlaps, and whatever of it is off the screen counts the most", () => {
  const view = { width: 390, height: 844 };
  const cards = [{ left: 60, right: 120, top: 380, bottom: 460 }];
  assert.equal(covers({ left: 100, right: 200, top: 300, bottom: 370 }, cards, view), 0, "clear of the card");
  assert.equal(covers({ left: 100, right: 200, top: 440, bottom: 480 }, cards, view), 20 * 20);
  assert.ok(covers({ left: 300, right: 420, top: 100, bottom: 140 }, [], view) > covers({ left: 100, right: 200, top: 440, bottom: 480 }, cards, view), "off the screen is worse");
});

// The places tried in order; `measure` gives the box's size at each, as the
// page lays it out: `w` by `h`, `natural` its width with room to spare, and
// whether its words `spill` past its edge.
const measured = (sizes) => (place) => ({ natural: 220, spills: false, ...sizes[place.kind] });

test("a box goes to the first of its places that covers nothing, else to the one that covers least", () => {
  const view = { width: 390, height: 844 };
  const card = { left: 100, right: 300, top: 400, bottom: 500 };
  const below = { kind: "below", x: 200, y: 500 };
  const above = { kind: "above", x: 200, y: 400 };
  const sizes = measured({ below: { w: 220, h: 40 }, above: { w: 220, h: 40 } });
  assert.equal(choosePlace([below, above], sizes, [card], view), below);
  // Below runs off the screen: above, which covers nothing.
  assert.equal(choosePlace([{ ...below, y: 830 }, above], sizes, [card], view), above);
});

// An iPhone (the user: "when the dialogue box shows up on the left hand
// side of the hand, the text sometimes exceeds the text box"): beside the
// hand there was room for 60 px of box, which covered nothing, so the box
// went there and its words ran past its edge. Beside its speaker, a box is
// never squeezed narrower than its words need, as besideAt has it: below
// PHONE_BESIDE_MIN, or its words' own width if less, or so narrow that a
// word spills, it does not go there at all.
test("a box beside its speaker is never squeezed narrower than its words", () => {
  const view = { width: 390, height: 664 };
  const bar = { left: 8, right: 382, top: 620, bottom: 656 };
  const left = { kind: "left", x: 58, y: 540 };
  const below = { kind: "below", x: 200, y: 580 };
  const squeezed = measured({ left: { w: 60, h: 160 }, below: { w: 220, h: 40 } });
  assert.equal(choosePlace([left, below], squeezed, [bar], view), below, "squeezed to 60 px, though it covers nothing");
  // Narrow, but as wide as its few words: it goes there.
  const short = measured({ left: { w: 60, h: 40, natural: 60 }, below: { w: 60, h: 40, natural: 60 } });
  assert.equal(choosePlace([{ ...left, x: 68 }, below], short, [bar], view).kind, "left");
  // As wide as PHONE_BESIDE_MIN, but a long word spills: not there either.
  const spilt = measured({ left: { w: PHONE_BESIDE_MIN, h: 80, spills: true }, below: { w: 220, h: 40 } });
  assert.equal(choosePlace([left, below], spilt, [bar], view), below);
  const fits = measured({ left: { w: PHONE_BESIDE_MIN, h: 80 }, below: { w: 220, h: 40 } });
  assert.equal(choosePlace([{ ...left, x: 8 + PHONE_BESIDE_MIN }, below], fits, [bar], view).kind, "left");
  // An iPhone's room beside your opponent's hand, 133 px: enough.
  const iphone = measured({ left: { w: 133, h: 80 }, below: { w: 220, h: 40 } });
  assert.equal(choosePlace([{ ...left, x: 8 + 133 }, below], iphone, [bar], view).kind, "left");
});
