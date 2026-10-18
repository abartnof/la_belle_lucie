import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD, MARGINS, cardName, hitSlot, layout, project } from "../src/layout.js";

const RANKS = "A23456789TJQK";
const SUITS = "SHDC";
const PACK = [...SUITS].flatMap((s) => [...RANKS].map((r) => r + s));

// A deal as the engine makes one: 17 fans of three and one of one.
function dealt(seed = 1, home = [0, 0, 0, 0]) {
  let x = seed;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const cards = PACK.filter((c) => RANKS.indexOf(c[0]) >= home[SUITS.indexOf(c[1])]);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const fans = [];
  for (let i = 0; i < cards.length; i += 3) fans.push(cards.slice(i, i + 3));
  return { fans, home, prompt: "play" };
}

const ASPECTS = { "16:9": 16 / 9, "4:3": 4 / 3, "9:19.5": 9 / 19.5 };
const rect = (p) => ({ x0: p.x - CARD.width / 2, x1: p.x + CARD.width / 2, z0: p.z - CARD.height / 2, z1: p.z + CARD.height / 2 });
const overlap = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

for (const [name, aspect] of Object.entries(ASPECTS)) {
  test(`every card has a pose and the top cards are whole and apart at ${name}`, () => {
    const state = dealt(7, [2, 0, 1, 0]);
    const lay = layout(state, aspect);
    const placed = state.fans.flat().length + state.home.reduce((a, b) => a + b, 0);
    assert.equal(Object.keys(lay.poses).length, placed);
    assert.equal(lay.portrait, aspect < 0.85);
    assert.equal(lay.cols, lay.portrait ? 4 : 6);
    const tops = state.fans.filter((f) => f.length).map((f) => f[f.length - 1]);
    for (const a of tops) {
      for (const b of tops) if (a !== b) assert.ok(!overlap(rect(lay.poses[a]), rect(lay.poses[b])), `${a} overlaps ${b}`);
      // nothing lies over a top card
      for (const c of Object.keys(lay.poses)) {
        if (c === a) continue;
        if (overlap(rect(lay.poses[a]), rect(lay.poses[c]))) assert.ok(lay.poses[c].y < lay.poses[a].y, `${c} covers ${a}`);
      }
    }
  });

  test(`everything is inside the view at ${name}`, () => {
    for (const state of [dealt(3), dealt(4, [5, 3, 0, 13]), { fans: [[], ["AS"], ["2S", "3S", "4S", "5S", "6S", "7S", "8S", "9S", "TS", "JS", "QS", "KS", "AH"]], home: [0, 0, 0, 0] }]) {
      const lay = layout(state, aspect);
      const check = (p) => {
        const [nx, ny, depth] = project(lay.camera, aspect, p);
        assert.ok(depth > 20, "beyond the near plane");
        assert.ok(Math.abs(nx) <= 1 - 2 * MARGINS.side + 1e-6, `x ${nx}`);
        assert.ok(ny <= 1 - 2 * MARGINS.top + 1e-6 && ny >= -1 + 2 * MARGINS.bottom - 1e-6, `y ${ny}`);
      };
      for (const p of Object.values(lay.poses)) {
        for (const dx of [-1, 1]) for (const dz of [-1, 1]) check([p.x + (dx * CARD.width) / 2, p.y + 1.5, p.z + (dz * CARD.height) / 2]);
      }
      for (const s of lay.slots) for (const dz of [-1, 1]) check([s.x0, 0, s.cz + (dz * CARD.height) / 2]);
      assert.ok(lay.camera.distance <= 150 + 1e-6 || lay.camera.fov >= 50, "the eye is not too far for the fog");
    }
  });
}

test("a card keeps its corner strip while a fan of three, and a long run stays in its slot", () => {
  const lay = layout({ fans: [["AS", "2S", "3S"], "23456789TJQKA".split("").map((r, i) => r + "HDCS"[i % 4])], home: [0, 0, 0, 0] }, 16 / 9);
  const [a, b, c] = ["AS", "2S", "3S"].map((k) => lay.poses[k]);
  assert.ok(b.x - a.x >= CARD.width * 0.41 && c.x - b.x >= CARD.width * 0.41);
  const slot = lay.slots[1];
  const xs = Object.values(lay.poses).filter((p) => p.fan === 1).map((p) => p.x);
  assert.equal(xs.length, 13);
  assert.ok(Math.max(...xs) + CARD.width / 2 <= slot.x0 + slot.inner + 1e-6);
  assert.ok(Math.min(...xs) - CARD.width / 2 >= slot.x0 - 1e-6);
});

test("foundation cards stack on one spot, the aces under", () => {
  const lay = layout(dealt(2, [4, 1, 0, 13]), 16 / 9);
  const spades = ["AS", "2S", "3S", "4S"].map((c) => lay.poses[c]);
  assert.ok(spades.every((p) => p.x === spades[0].x && p.z === spades[0].z && p.home));
  assert.ok(spades.every((p, i) => i === 0 || p.y > spades[i - 1].y));
  assert.equal(lay.home.length, 4);
  assert.deepEqual(lay.home.map((h) => h.suit), ["S", "H", "D", "C"]);
  assert.equal(lay.poses["KC"].home, true);
  // the foundation row lies clear of the fans
  const lowest = Math.max(...lay.home.map((h) => h.cz));
  assert.ok(lay.slots.every((s) => s.cz - CARD.height / 2 > lowest + CARD.height / 2));
});

test("after a redeal only the fans that exist are laid out, and the view follows", () => {
  const before = layout(dealt(5), 16 / 9);
  const state = { fans: dealt(5, [0, 0, 0, 0]).fans.slice(0, 7), home: [0, 0, 0, 0] };
  const after = layout(state, 16 / 9);
  assert.equal(after.slots.length, 7);
  assert.equal(after.rows, 2);
  assert.equal(before.rows, 3);
  assert.equal(Object.keys(after.poses).length, state.fans.flat().length);
  assert.ok(after.camera.distance < before.camera.distance, "fewer rows fill the window more");
});

test("empty fans keep their slot and a click finds it", () => {
  const lay = layout({ fans: [[], ["AS"], []], home: [0, 0, 0, 0] }, 16 / 9);
  assert.equal(lay.slots.length, 3);
  const s = lay.slots[2];
  assert.deepEqual(hitSlot(lay, s.cx, s.cz), { fan: 2, home: false });
  const h = lay.home[1];
  assert.deepEqual(hitSlot(lay, h.cx, h.cz), { fan: null, home: true, suit: "H" });
  assert.equal(hitSlot(lay, 1000, 0), null);
});

test("cards are named for the page's spoken fallback", () => {
  assert.equal(cardName("TH"), "ten of hearts");
  assert.equal(cardName("AS"), "ace of spades");
});

// ---- long fans readable ----------------------------------------------------
import { STRIP } from "../src/layout.js";

const RK = "A23456789TJQK";
const longState = (fan = 7, n = 13, empties = []) => {
  const fans = Array.from({ length: 18 }, () => []);
  fans[fan] = [...RK].slice(0, n).map((r) => r + "S");
  const others = PACK.filter((c) => !fans[fan].includes(c));
  let k = 0;
  for (let i = 0; i < fans.length && k < others.length; i++) {
    if (i === fan || empties.includes(i)) continue;
    fans[i] = others.slice(k, k + 3);
    k += 3;
  }
  return { fans, home: [0, 0, 0, 0], prompt: "play" };
};

test("a long fan with empty slots to its right keeps the readable strip at rest", () => {
  const st = longState(7, 9, [8, 9, 10]);
  const lay = layout(st, 16 / 9);
  const xs = st.fans[7].map((c) => lay.poses[c].x);
  const step = xs[1] - xs[0];
  assert.ok(step >= STRIP - 1e-6, `step ${step}`);
  // it stays on its own row and inside the table
  const right = Math.max(...xs) + CARD.width / 2;
  assert.ok(right <= lay.slots[10].x0 + lay.slots[10].inner + 1e-6);
});

test("with no room to the right a long fan compresses as before and never leaves its slot", () => {
  const st = longState(7, 9, []);
  const lay = layout(st, 16 / 9);
  const xs = st.fans[7].map((c) => lay.poses[c].x);
  assert.ok(xs[1] - xs[0] < STRIP);
  assert.ok(Math.max(...xs) + CARD.width / 2 <= lay.slots[7].x0 + lay.slots[7].inner + 1e-6);
});

for (const [name, aspect] of Object.entries(ASPECTS)) {
  for (const fan of [0, 5, 7, 17]) {
    test(`a spread fan of 13 shows every strip, raised, inside the view at ${name}, fan ${fan}`, () => {
      const st = longState(fan, 13, []);
      const rest = layout(st, aspect);
      const lay = layout(st, aspect, { spread: fan });
      const cards = st.fans[fan];
      for (let i = 1; i < cards.length; i++) {
        const gap = lay.poses[cards[i]].x - lay.poses[cards[i - 1]].x;
        assert.ok(gap >= STRIP - 1e-6, `strip ${i}: ${gap}`);
      }
      const camera = lay.camera;
      for (const c of cards) {
        const p = lay.poses[c];
        for (const dx of [-CARD.width / 2, CARD.width / 2]) {
          const [sx] = project(camera, aspect, [p.x + dx, p.y, p.z]);
          assert.ok(Math.abs(sx) <= 1 + 1e-6, `${c} off screen at ${sx}`);
        }
        // above every card of every other fan
        for (const [o, q] of Object.entries(lay.poses)) if (!cards.includes(o)) assert.ok(p.y > q.y, `${c} not above ${o}`);
      }
      // the camera and the other fans do not move
      assert.deepEqual(lay.camera, rest.camera);
      for (const [o, q] of Object.entries(rest.poses)) if (!cards.includes(o)) assert.deepEqual(lay.poses[o], q);
    });
  }
}

test("spreading a short fan, or none, changes nothing", () => {
  const st = dealt(3);
  const a = layout(st, 16 / 9);
  assert.deepEqual(layout(st, 16 / 9, { spread: 4 }).poses, a.poses);
  assert.deepEqual(layout(st, 16 / 9, { spread: null }).poses, a.poses);
});

test("the camera fit is memoised: a spread alone never refits, and the result equals the plain fit", async () => {
  const { fitCamera, fitStats } = await import("../src/layout.js");
  const state = dealt(11);
  const margins = { top: 0.1, bottom: 0.08, side: 0.02 };
  const first = layout(state, 16 / 9, { margins });
  const n = fitStats.fits;
  for (let i = 0; i < 18; i++) layout(state, 16 / 9, { margins, spread: i });
  layout({ ...state, fans: state.fans.map((f) => [...f].reverse()) }, 16 / 9, { margins });
  assert.equal(fitStats.fits, n, "no refit for a spread or for the cards changing places");
  const plain = fitCamera(first.points, 16 / 9, margins);
  assert.deepEqual(first.camera, plain);
  // A different aspect, margins or fan count does refit, and is also exact.
  for (const [a, m, st] of [[4 / 3, margins, state], [16 / 9, { ...margins, top: 0.2 }, state], [16 / 9, margins, { ...state, fans: state.fans.slice(0, 10) }]]) {
    const before = fitStats.fits;
    const lay = layout(st, a, { margins: m });
    assert.equal(fitStats.fits, before + 1);
    assert.deepEqual(lay.camera, fitCamera(lay.points, a, m));
  }
});
