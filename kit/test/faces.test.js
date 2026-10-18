// From cassino web3d/test/faces.test.js @ 73f0cd7
// From piquet web3d/test/faces.test.js @ 254cb3c, less its measure of
// piquet's fanned hand (cassino's hands are four cards, each well shown).
// Kit change: without the test that a cassino hand on a phone shows JUMBO.strip
// of each card (it needs cassino's layout.js and ZONES_PORTRAIT; a game keeps its own).
// The Jumbo Index faces: which device gets them, and what each one draws.

import test from "node:test";
import assert from "node:assert/strict";
import { drawJumbo, facesFor, JUMBO, largeTextByDefault, rankAndSuit } from "../js/faces.js";

test("Large Text by default on a phone or a tablet, a touch screen its main pointer, and not on a computer", () => {
  assert.ok(largeTextByDefault({ coarse: true }), "an iPhone or an Android phone");
  assert.ok(largeTextByDefault({ coarse: true, mac: false, touchPoints: 5 }), "an iPad, or an Android tablet");
  // iPadOS's Safari says it is a Mac; only its touch points tell.
  assert.ok(largeTextByDefault({ coarse: false, mac: true, touchPoints: 5 }), "an iPad whose Safari asks for the desktop site");
  assert.ok(!largeTextByDefault({ coarse: false, mac: true, touchPoints: 0 }), "a Mac is not");
  assert.ok(!largeTextByDefault({ coarse: false, mac: false, touchPoints: 10 }), "a computer with a touch screen and a mouse is not");
  assert.ok(!largeTextByDefault({ coarse: false }), "a narrow window on a computer is not");
});

test("automatic faces are Jumbo Index on a phone or a tablet and classic elsewhere; a choice is kept", () => {
  assert.equal(facesFor("auto", true), "jumbo");
  assert.equal(facesFor("auto", false), "classic");
  assert.equal(facesFor(undefined, true), "jumbo");
  for (const touch of [true, false]) {
    assert.equal(facesFor("classic", touch), "classic");
    assert.equal(facesFor("jumbo", touch), "jumbo");
  }
});

test("the table's codes read as rank and suit, the ten as 10", () => {
  assert.deepEqual(rankAndSuit("TH"), ["10", "H"]);
  assert.deepEqual(rankAndSuit("AS"), ["A", "S"]);
  assert.deepEqual(rankAndSuit("7D"), ["7", "D"]);
});

// A 2D context that records what is drawn, measuring text as a font would:
// a glyph's ink a little narrower than its size, its capitals 0.7 of it,
// and the variation selector no ink at all.
function recorder() {
  const calls = [];
  let font = "";
  const ctx = {
    calls,
    fillStyle: "",
    textAlign: "",
    textBaseline: "",
    set font(f) {
      font = f;
    },
    get font() {
      return font;
    },
    measureText(text) {
      const size = Number(font.match(/([\d.]+)px/)[1]);
      return { actualBoundingBoxAscent: 0.7 * size, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0.8 * size * [...text.replace(/\uFE0E/g, "")].length };
    },
    fillRect: (...a) => calls.push(["fillRect", ...a]),
    fillText: (text, x, y, maxWidth) => calls.push(["fillText", text, x, y, font, ctx.fillStyle, maxWidth]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    translate: (x, y) => calls.push(["translate", x, y]),
    scale: (x, y) => calls.push(["scale", x, y]),
    rotate: (a) => calls.push(["rotate", a]),
  };
  return ctx;
}

test("a face is paper from edge to edge -- the table's ink line draws its edge", () => {
  const ctx = recorder();
  drawJumbo(ctx, 500, "QH");
  const [[call, x, y, w, h]] = ctx.calls;
  assert.deepEqual([call, x, y, w], ["fillRect", 0, 0, 500]);
  assert.ok(Math.abs(h - 700) < 1e-9, `${h} tall`);
});

// The sixth play-testing: on an iPhone the table's cards were "still too
// small to read". A card on the screen is never read upside down, so the
// face has no turned corner; below the corner the hand needs, a big rank
// and suit fill the card, for the table, where all of a card shows.
const fills = (code, width = 700) => {
  const ctx = recorder();
  drawJumbo(ctx, width, code);
  return { ctx, texts: ctx.calls.filter((c) => c[0] === "fillText"), u: width / JUMBO.w };
};
const sizeOf = (call) => Number(call[4].match(/([\d.]+)px/)[1]);

test("one corner, the rank over the suit, at the top left; none turned upside down", () => {
  const { ctx, texts } = fills("TH");
  assert.ok(!ctx.calls.some((c) => c[0] === "rotate"), "nothing turned");
  assert.equal(texts.length, 4);
  assert.deepEqual(texts.map((t) => t[1]), ["10", "♥︎", "10", "♥︎"], "the corner, then the big rank and suit");
  for (const t of texts) assert.equal(t[5], JUMBO.red);
  assert.ok(texts[0][3] < texts[1][3], "the corner's rank above its suit");
});

// And then (the user: "Instead of the large card value, taking up the
// whole card width, put it in that 3/4, so that it does not overlap on the
// X axis with the top left card value"): the big rank and suit to the right
// of the strip the corner is fitted to, the rank over the suit.
test("right of the corner's strip, a big rank over a big suit, centred in the room there and within the card", () => {
  for (const code of ["7S", "QC", "AD", "KH", "TD", "2S", "8H"]) {
    const { texts, u } = fills(code);
    const [rank, , bigRank, bigSuit] = texts;
    assert.ok(sizeOf(bigRank) >= 2 * sizeOf(rank), `${code}: the big rank ${sizeOf(bigRank)} against the corner's ${sizeOf(rank)}`);
    // The recorder's ink: a character 0.8 of its size wide, 0.7 tall.
    const column = { left: JUMBO.strip * u, right: (JUMBO.w - JUMBO.big.margin) * u };
    const centre = (column.left + column.right) / 2;
    const suitLeft = bigSuit[2];
    const suitRight = suitLeft + 0.8 * sizeOf(bigSuit);
    assert.ok(suitLeft >= column.left - 1e-9 && suitRight <= column.right + 1e-9, `${code}: the suit within the room right of the strip`);
    assert.ok(Math.abs((suitLeft + suitRight) / 2 - centre) < 1e-6, `${code}: the suit centred there`);
    if (code[0] !== "T") {
      const rankRight = bigRank[2] + 0.8 * sizeOf(bigRank);
      assert.ok(bigRank[2] >= column.left - 1e-9 && rankRight <= column.right + 1e-9, `${code}: the rank within the room right of the strip`);
      assert.ok(Math.abs((bigRank[2] + rankRight) / 2 - centre) < 1e-6, `${code}: the rank centred there`);
    }
    const rankTop = bigRank[3] - 0.7 * sizeOf(bigRank);
    const suitTop = bigSuit[3] - 0.7 * sizeOf(bigSuit);
    assert.ok(bigRank[3] <= suitTop, `${code}: the rank over the suit`);
    assert.ok(rankTop >= JUMBO.big.margin * u - 1e-9 && bigSuit[3] <= (JUMBO.h - JUMBO.big.margin) * u + 1e-9, `${code}: within the card's height`);
  }
});

// Some fonts' J dips below the line (DejaVu's, a Linux fallback): the suit
// goes below what the rank truly inks.
test("the big suit clears a rank that dips below the line", () => {
  const ctx = recorder();
  const measure = ctx.measureText;
  ctx.measureText = (text) => ({ ...measure(text), actualBoundingBoxDescent: text === "J" ? 0.2 * Number(ctx.font.match(/([\d.]+)px/)[1]) : 0 });
  drawJumbo(ctx, 700, "JH");
  const [, , bigRank, bigSuit] = ctx.calls.filter((c) => c[0] === "fillText");
  const jBottom = bigRank[3] + 0.2 * sizeOf(bigRank);
  const suitTop = bigSuit[3] - 0.7 * sizeOf(bigSuit);
  assert.ok(suitTop >= jBottom + JUMBO.big.gap * (700 / JUMBO.w) - 1e-9, `the suit from ${suitTop}, the J to ${jBottom}`);
  assert.ok(bigSuit[3] <= (JUMBO.h - JUMBO.big.margin) * (700 / JUMBO.w) + 1e-9, "and still within the card");
});

test("every big rank is set at one size, the ten narrowed to fit as the others do", () => {
  const sizes = new Set(["7S", "TS", "QS", "AS", "KD"].map((code) => fills(code).texts[2][4]));
  assert.equal(sizes.size, 1);
  const { ctx } = fills("TS");
  const scale = ctx.calls.find((c) => c[0] === "scale");
  assert.ok(scale && scale[1] < 1 && scale[2] === 1, `the ten narrowed: ${scale}`);
  assert.ok(!fills("7S").ctx.calls.some((c) => c[0] === "scale"), "a single character is not");
});

test("every rank is set at one size, the ten included, in the platform's bold UI font", () => {
  const sizes = new Set();
  for (const code of ["7S", "TS", "QS", "AS"]) {
    const ctx = recorder();
    drawJumbo(ctx, 700, code);
    const rank = ctx.calls.find((c) => c[0] === "fillText");
    assert.match(rank[4], /^700 /);
    assert.match(rank[4], /system-ui/);
    sizes.add(rank[4]);
  }
  assert.equal(sizes.size, 1);
});

test("suits are plain text glyphs, never colour emoji, black and red as they should be", () => {
  for (const [suit, glyph, colour] of [["S", "♠", JUMBO.ink], ["H", "♥", JUMBO.red], ["D", "♦", JUMBO.red], ["C", "♣", JUMBO.ink]]) {
    const ctx = recorder();
    drawJumbo(ctx, 700, `A${suit}`);
    const drawn = ctx.calls.filter((c) => c[0] === "fillText")[1];
    assert.equal(drawn[1], `${glyph}︎`);
    assert.equal(drawn[5], colour);
  }
});

test("the suit's ink is centred on the rank's, whatever font draws it", () => {
  const ctx = recorder();
  drawJumbo(ctx, 700, "AS");
  const [rank, suit] = ctx.calls.filter((c) => c[0] === "fillText");
  const size = Number(suit[4].match(/([\d.]+)px/)[1]);
  assert.ok(Math.abs(suit[2] + (0.8 * size) / 2 - rank[2]) < 1e-9, "the suit's ink centre is under the rank's");
});

test("the index fits the strip, with room either side: every rank and suit within it", () => {
  const room = JUMBO.strip - 2 * JUMBO.margin;
  for (const code of ["7S", "TH", "QC", "AD", "KS", "8H"]) {
    const ctx = recorder();
    drawJumbo(ctx, 700, code);
    const u = 700 / JUMBO.w;
    const [rank, suit] = ctx.calls.filter((c) => c[0] === "fillText");
    // One character, centred in the strip, its ink within it; a 10 starts
    // where the room does and runs on under the next card.
    const size = Number(rank[4].match(/([\d.]+)px/)[1]);
    if (code[0] === "T") assert.ok(Math.abs(rank[2] - JUMBO.margin * u) < 1e-9, `${code}: the 10 starts at the strip's margin`);
    else {
      assert.ok(Math.abs(rank[2] - (JUMBO.margin + room / 2) * u) < 1e-9, `${code}: the rank is centred in the strip`);
      assert.ok(0.8 * size <= room * u + 1e-9, `${code}: the rank's ink is wider than the room`);
    }
    assert.equal(rank[6], undefined, "the canvas does not narrow it");
    const suitSize = Number(suit[4].match(/([\d.]+)px/)[1]);
    const ink = 0.8 * suitSize; // the recorder's ink width for one glyph
    assert.ok(suit[2] >= JUMBO.margin * u - 1e-9 && suit[2] + ink <= (JUMBO.strip - JUMBO.margin) * u + 1e-9, `${code}: the suit runs out of the strip`);
  }
});
