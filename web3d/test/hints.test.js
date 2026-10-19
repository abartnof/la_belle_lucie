import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hintText, cardName, pileFacts, WHY } from "../src/hints.js";
import { loadEngine } from "../src/engine.js";

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
const R = "A23456789TJQK";
const SU = "SHDC";
const rk = (c) => R.indexOf(c[0]) + 1;
const NUM = { no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13 };
const count = (w) => NUM[w] ?? Number(w);
const code = (n) => (n.slice(0, -1) === "10" ? "T" : n[0]) + SU["♠♥♦♣".indexOf(n.at(-1))];

// Every sentence pair has the shape the maintainer asked for.
function shape(t) {
  assert.equal(sentences(t.do).length, 1, t.do);
  assert.equal(sentences(t.why).length, 1, t.why);
  assert.match(t.do, /\.$/);
  assert.match(t.why, /\.$/);
  assert.doesNotMatch(t.why, /\d/, t.why);
  assert.doesNotMatch(t.why, CARD, t.why);
  assert.doesNotMatch(t.why, /\b(ace|king|queen|jack|deuce|spades?|hearts?|diamonds?|clubs?|f\d)\b/i, t.why);
}

test("card names: ranks and suit symbols, T is 10", () => {
  assert.equal(cardName("6H"), "6♥");
  assert.equal(cardName("TS"), "10♠");
  assert.equal(cardName("AC"), "A♣");
});

test("every rule, with no position, many move counts: exactly two sentences, principle free of cards", () => {
  for (const rule of RULES) {
    for (let moves = 0; moves < 12; moves++) {
      const hint = { rule, ...MOVES[rule] };
      const t = hintText(hint, { moves });
      shape(t);
      assert.equal(sentences(`${t.do} ${t.why}`).length, 2);
      if (hint.card) assert.ok(t.do.includes(cardName(hint.card)), t.do);
      if (hint.onto) assert.ok(t.do.includes(cardName(hint.onto)), t.do);
    }
  }
});

test("every principle is a rule of thumb: no digit, card, suit or fan", () => {
  for (const [key, lines] of Object.entries(WHY)) {
    assert.ok(lines.length >= 2, key);
    for (const why of lines) shape({ do: "Move.", why });
  }
});

test("an unknown rule still gives two sentences", () => {
  const t = hintText({ rule: "mystery", move: "f1>f2", card: "2S", onto: "3S", uncovers: null }, { moves: 0 });
  assert.equal(sentences(`${t.do} ${t.why}`).length, 2);
});

test("without a position a build is not weighed, and says nothing it cannot know", () => {
  const t = hintText({ rule: "build", ...MOVES.build }, {});
  assert.equal(t.do, "Move the 6♥ onto the 7♥.");
});

// ---- the weighing, on crafted positions ----------------------------------------
const pos = (fans, over = {}) => ({ fans, home: [0, 0, 0, 0], redeals_left: 2, draw: "off", moves: 0, legal: ["f1>f0", "f2>f3"], ...over });
const build = (card, onto, from, to, over = {}) => ({ rule: "build", move: `f${from}>f${to}`, card, onto, uncovers: null, open: 3, alt: null, ...over });

test("pile facts: the run, the blockers, the release, the urgent card", () => {
  // the 6H goes onto 7H, which sits on 8H over a 9C: the 8H and 7H are its run
  const f = pileFacts("6H", 0, pos([["9C", "8H", "7H"]]));
  assert.deepEqual(f.blockers, ["9C"]);
  assert.equal(f.release, 8, "all eight hearts up to the 8 must be home first");
  assert.equal(f.lock, null);
  // a lower card of the mover's suit under it is a lock
  assert.equal(pileFacts("6H", 0, pos([["2H", "7H"]])).lock, "2H");
  // wanted soon: the 2S is next for the spades foundation when A is home
  assert.equal(pileFacts("6H", 0, pos([["2S", "7H"]], { home: [1, 0, 0, 0] })).urgent, "2S");
  assert.equal(pileFacts("6H", 0, pos([["JS", "7H"]], { home: [1, 0, 0, 0] })).urgent, null);
  assert.equal(pileFacts("6H", 0, pos([["7H"]])).runOnly, true);
});

test("a freeze says what, how long, and what the move gains", () => {
  const state = pos([["2S", "7H"], ["9C", "6H"]], { home: [1, 0, 0, 0] });
  const t = hintText(build("6H", "7H", 1, 0, { uncovers: "9C" }), state);
  assert.match(t.do, /^(Move|Play|Slide) the 6♥ onto the 7♥, which frees the 9♣, but it freezes the 2♠ beneath \(next in line for home\) until seven more hearts have gone home\.$/);
  shape(t);
});

test("a lock says only a redeal can undo it, or that none is left", () => {
  const fans = [["2H", "7H"], ["9C", "6H"]];
  const hint = build("6H", "7H", 1, 0);
  assert.match(hintText(hint, pos(fans)).do, /sits over the 2♥ of its own suit, so neither can reach home and only a redeal can undo it\.$/);
  assert.match(hintText(hint, pos(fans, { redeals_left: 0 })).do, /no redeal is left to undo it\.$/);
  assert.match(hintText(hint, pos(fans, { redeals_left: 0 })).why, /redeal|last deal|permanent|lasts/i);
});

test("a build on a run of its own suit holds nothing up", () => {
  const t = hintText(build("6H", "7H", 1, 0), pos([["8H", "7H"], ["9C", "6H"]]));
  assert.match(t.do, /lands on a run of its own suit, so nothing is held up\.$/);
});

test("a rival that would freeze what the hint does not is named", () => {
  const state = pos([["JS", "7H"], ["9C", "6H"], ["2S", "8D"], ["QC", "7D"]], { home: [1, 0, 0, 0] });
  const hint = build("6H", "7H", 1, 0, { alt: { move: "f3>f2", card: "7D", onto: "8D", uncovers: "QC", open: 2 } });
  const t = hintText(hint, state);
  assert.match(t.do, /; the 7♦ onto the 8♦ would freeze the 2♠ \(next in line for home\)\.$/);
  shape(t);
});

test("a redeal says what is gathered and what stays", () => {
  const state = pos([["2S", "7H"], ["9C"]], { home: [3, 2, 0, 0], redeals_left: 1 });
  const t = hintText({ rule: "redeal", ...MOVES.redeal }, state);
  assert.equal(t.do, "No move is left, so take a redeal: the 3 cards on the table are gathered and dealt fresh, the 5 at home stay, and this is your last redeal.");
  const t1 = hintText({ rule: "redeal", ...MOVES.redeal }, pos([["2S"]], { home: [1, 0, 0, 0], redeals_left: 2 }));
  assert.match(t1.do, /the one card at home stays, and you will have one more after it\.$/);
  assert.match(hintText({ rule: "redeal", ...MOVES.redeal }, pos([["2S"]], { redeals_left: 1 })).do, /nothing is home yet, and this is your last redeal\.$/);
});

test("the wording varies over a game and is the same on a replay", () => {
  const state = pos([["2S", "7H"], ["9C", "6H"]], { home: [1, 0, 0, 0] });
  const hint = build("6H", "7H", 1, 0, { uncovers: "9C" });
  const seen = new Set(Array.from({ length: 12 }, (_, moves) => JSON.stringify(hintText(hint, { ...state, moves }))));
  assert.ok(seen.size >= 5, `${seen.size} phrasings`);
  assert.deepEqual(hintText(hint, { ...state, moves: 4 }), hintText(hint, { ...state, moves: 4 }));
});

// ---- truthful against the real engine ------------------------------------------
// Every clause of every sentence is worked out again from the position, by a
// different route (a count of the missing cards), over hint-played games.
const wasm = fileURLToPath(new URL("../../target/wasm32-unknown-unknown/release/la_belle_lucie_wasm.wasm", import.meta.url));
const skip = !existsSync(wasm) && "wasm not built";
const missingBelow = (home, c) => {
  let n = 0;
  for (let r = 1; r < rk(c); r++) if (r > home[SU.indexOf(c[1])]) n++;
  return n;
};

function check(hint, state, counts) {
  const t = hintText(hint, state);
  shape(t);
  const bump = (k) => (counts[k] = (counts[k] ?? 0) + 1);
  const known = new Set(state.fans.flat());
  for (const m of t.do.matchAll(/(?:10|[A2-9JQK])[♠♥♦♣]/g)) assert.ok(known.has(code(m[0])), `${m[0]} in ${t.do}`);
  const from = /^f(\d+)>/.exec(hint.move)?.[1];
  const to = /^f\d+>f(\d+)$/.exec(hint.move)?.[1];
  const src = from === undefined ? [] : state.fans[from];
  const pile = to === undefined ? [] : state.fans[to];
  const home = state.home;
  const alt = hint.alt;
  const apile = alt ? state.fans[/>f(\d+)$/.exec(alt.move)[1]] : [];
  let m;
  if ((m = /, which frees the (\S+?)(?:[,;]| to move|\.)/.exec(t.do)) && to !== undefined) {
    assert.equal(code(m[1]), src.at(-2), t.do);
    bump("frees");
  }
  if ((m = /lets the (\S+) go home next/.exec(t.do))) {
    assert.equal(code(m[1]), src.at(-2));
    assert.equal(missingBelow(home, code(m[1])), 0);
    bump("homeNext");
  }
  if ((m = /to move onto the (\S+?)[,;.]/.exec(t.do))) {
    const u = src.at(-2);
    const target = code(m[1]);
    assert.ok(target[1] === u[1] && rk(target) === rk(u) + 1);
    bump("buildsOnto");
  }
  if ((m = /freezes the (\S+) beneath \((.*?)\) until (\w+) more (\w+) (?:has|have) gone home/.exec(t.do))) {
    const z = code(m[1]);
    const zi = pile.indexOf(z);
    assert.ok(zi >= 0);
    const w = missingBelow(home, z);
    if (m[2].startsWith("next")) assert.equal(w, 0);
    else assert.equal(count(/^(\w+) more/.exec(m[2])[1]), w);
    let i = pile.length - 1;
    let bottom = hint.card;
    while (i >= 0 && pile[i][1] === hint.card[1] && rk(pile[i]) === rk(bottom) + 1) [bottom, i] = [pile[i], i - 1];
    assert.ok(zi <= i, "beneath the run");
    let need = 0;
    for (let r = 1; r <= rk(bottom); r++) if (r > home[SU.indexOf(hint.card[1])]) need++;
    assert.equal(count(m[3]), need, t.do);
    assert.ok(w < need, "wanted before the run releases it");
    bump("freezes");
  }
  if ((m = /sits over the (\S+) of its own suit/.exec(t.do))) {
    const z = code(m[1]);
    assert.ok(pile.includes(z) && z[1] === hint.card[1] && rk(z) < rk(hint.card));
    bump("lock");
  }
  if (/no redeal is left to undo/.test(t.do)) assert.equal(state.redeals_left, 0);
  if (/only a redeal can undo/.test(t.do)) assert.ok(state.redeals_left > 0);
  if ((m = /what it covers can wait: the (\S+) beneath has (\w+) more/.exec(t.do))) {
    const z = code(m[1]);
    assert.ok(pile.includes(z));
    assert.equal(count(m[2]), missingBelow(home, z));
    bump("canWait");
  }
  if (/lands on a run of its own suit/.test(t.do)) {
    assert.ok(pile.every((c, i) => c[1] === hint.card[1] && (i === pile.length - 1 || rk(pile[i]) > rk(pile[i + 1]))));
    bump("runOnly");
  }
  if ((m = /would lock the (\S+) under it/.exec(t.do))) {
    const z = code(m[1]);
    assert.ok(apile.includes(z) && z[1] === alt.card[1] && rk(z) < rk(alt.card));
    bump("altLock");
  }
  if ((m = /would freeze the (\S+) \(/.exec(t.do))) {
    assert.ok(apile.includes(code(m[1])));
    bump("altFreeze");
  }
  if (/would not freeze that, but it would free nothing/.test(t.do)) {
    assert.equal(alt.uncovers, null);
    bump("altFreesNothing");
  }
  if ((m = /but it would leave only (\w+) moves? open/.exec(t.do))) {
    assert.equal(count(m[1]), alt.open);
    assert.ok(alt.open < hint.open);
    bump("altFewerMoves");
  }
  if ((m = /after which (?:just one move is|only (\w+) moves are) open/.exec(t.do))) {
    assert.equal(m[1] ? count(m[1]) : 1, hint.open);
    bump("open");
  }
  if ((m = /after which (\w+) moves are open, (\w+) more than now/.exec(t.do))) {
    assert.equal(count(m[1]), hint.open);
    assert.equal(count(m[2]), hint.open - state.legal.filter((c) => c !== "redeal").length);
    bump("openGain");
  }
}

test("over hint-played games every clause is true of the position", { skip }, async () => {
  const engine = await loadEngine(readFileSync(wasm), () => assert.fail("trapped"));
  const counts = {};
  let hints = 0;
  for (const rules of [4, 12, 16]) {
    for (let seed = 1; seed <= 25; seed++) {
      let state = engine.new({ seed, rules });
      for (let step = 0; step < 400 && state.prompt === "play"; step++) {
        state = engine.send("hint").state;
        const hint = state.hint;
        if (!hint) break;
        check(hint, state, counts);
        hints++;
        const moved = engine.send(hint.move);
        assert.ok(moved.ok, hint.move);
        state = moved.state;
      }
    }
  }
  assert.ok(hints > 1000, `${hints} hints`);
  for (const kind of ["frees", "freezes", "lock", "canWait", "runOnly", "open"]) assert.ok(counts[kind] > 0, `no ${kind} clause was met: ${JSON.stringify(counts)}`);
});
