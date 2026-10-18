// The score HUD's widget, on a stand-in DOM and a clock moved by hand, for a
// game definition (test/fixtures/games.js): a row a player, popups one side
// at a time on the table's clock, the ledger per hand, reduced motion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHEVRON_SVG, createHud, POPUP_MS } from "../js/hud.js";
import { blank, defineGame } from "../js/scoring.js";
import { counting, fake } from "./fixtures/games.js";

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.style = { setProperty() {} };
    this.own = "";
    this.className = "";
    const el = this;
    this.classList = {
      add: (...c) => (el.className = [...new Set([...el.className.split(" ").filter(Boolean), ...c])].join(" ")),
      remove: (...c) => (el.className = el.className.split(" ").filter((x) => x && !c.includes(x)).join(" ")),
      toggle: (c, on) => (on ? el.classList.add(c) : el.classList.remove(c)),
      contains: (c) => el.className.split(" ").includes(c),
    };
  }
  // As in a page, setting the text drops the children.
  set textContent(t) {
    this.children = [];
    this.own = t;
  }
  get textContent() {
    return this.own;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return this.attributes[k] ?? null;
  }
  append(...nodes) {
    for (const n of nodes) this.children.push(typeof n === "string" ? Object.assign(new FakeElement("#text"), { textContent: n }) : n);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  addEventListener() {}
  set innerHTML(html) {
    this.html = html;
  }
  get offsetWidth() {
    return 0;
  }
}

// Every node below `node` with the class.
function all(node, cls, out = []) {
  if (node.classList?.contains(cls)) out.push(node);
  for (const c of node.children) all(c, cls, out);
  return out;
}
const text = (node) => (node.children.length ? node.children.map(text).join("") : node.textContent);

function clock() {
  let now = 0;
  const queue = [];
  return {
    later: (ms, fn) => queue.push({ at: now + ms, fn }),
    run(ms) {
      const until = now + ms;
      for (;;) {
        queue.sort((a, b) => a.at - b.at);
        if (!queue.length || queue[0].at > until) break;
        const e = queue.shift();
        now = e.at;
        e.fn();
      }
      now = until;
    },
  };
}

function setup(def = fake, opts = {}) {
  globalThis.document = { createElement: (tag) => new FakeElement(tag) };
  const c = clock();
  const game = defineGame(def);
  const hud = createHud(new FakeElement("div"), game, { later: c.later, ...opts });
  hud.reset({ hands: [], live: blank(game) });
  return { c, hud, game };
}
const done = () => delete globalThis.document;

test("a row a player, opponent first, a segment for each point of the target", () => {
  const { hud } = setup();
  const rows = all(hud.node, "hud-side");
  assert.deepEqual(rows.map((r) => r.className), ["hud-side opp", "hud-side you"]);
  assert.equal(all(hud.node, "seg").length, 2 * 21);
  assert.deepEqual(all(hud.node, "hud-name").map(text), ["Opp", "You"]);
  done();
});

test("another game: a longer line, its own names, its goal said", () => {
  const { hud } = setup({ ...counting, names: { you: "Anna", opp: "Bert" } });
  assert.equal(all(hud.node, "seg").length, 2 * 36);
  assert.deepEqual(all(hud.node, "hud-name").map(text), ["Bert", "Anna"]);
  assert.match(text(all(hud.node, "hud-goal")[0]), /36 of 70 to win/);
  assert.match(all(hud.node, "hud-lines")[0].getAttribute("aria-label"), /Anna 0.*Bert 0.*36 of 70 to win/);
  hud.reset({ hands: [], live: null }, { you: "Cora", opp: "Dirk" });
  assert.deepEqual(all(hud.node, "hud-name").map(text), ["Dirk", "Cora"]);
  done();
});

test("a mark after a side's name, with its tooltip; it outlasts a reset and goes when cleared", () => {
  const { hud } = setup();
  const mark = () => all(hud.node, "hud-mark");
  assert.equal(mark().length, 0);
  hud.mark("you", { text: "D", title: "Declarer: took it up." });
  assert.deepEqual(all(hud.node, "hud-name").map(text), ["Opp", "You (D)"]);
  assert.equal(mark().length, 1);
  assert.equal(mark()[0].getAttribute("data-tip"), "Declarer: took it up.");
  assert.equal(mark()[0].getAttribute("title"), null, "one tooltip: the bubble, not the browser's");
  assert.equal(mark()[0].getAttribute("tabindex"), "0");
  assert.equal(mark()[0].getAttribute("aria-label"), "Declarer: took it up.");
  hud.reset({ hands: [], live: null }, { you: "Cora", opp: "Dirk" });
  assert.deepEqual(all(hud.node, "hud-name").map(text), ["Dirk", "Cora (D)"]);
  hud.mark("opp", { text: "D", title: "x" });
  assert.deepEqual(all(hud.node, "hud-name").map(text), ["Dirk (D)", "Cora (D)"]);
  hud.mark("you", null);
  hud.mark("opp", null);
  assert.deepEqual(all(hud.node, "hud-name").map(text), ["Dirk", "Cora"]);
  assert.equal(mark().length, 0);
  done();
});

test("a hand's late popups stay in that hand, and the next hand's live block opens at its deal", () => {
  const { c, hud, game } = setup();
  for (const [cat, pts] of [["cards", 3], ["spades", 1], ["big", 2], ["little", 1], ["aces", 3]]) hud.score({ side: "you", cat, label: cat, pts, hand: 1 });
  hud.endHand(1);
  hud.dealt(2);
  hud.score({ side: "opp", cat: "sweeps", label: "Sweep", pts: 1, hand: 2 });
  c.run(20_000);
  const l = hud.ledger();
  assert.deepEqual(l.hands.map((h) => [h.hand, h.ended]), [[1, true], [2, false]]);
  assert.equal(Object.values(l.hands[0].lines).reduce((s, v) => s + v.you, 0), 10);
  assert.equal(Object.values(l.hands[0].lines).reduce((s, v) => s + v.opp, 0), 0, "the sweep is not booked to hand 1");
  assert.deepEqual(l.hands[1].lines.sweeps, { you: 0, opp: 1 });
  assert.deepEqual(hud.totals(), { you: 10, opp: 1 });
  assert.deepEqual(hud.shown(), { you: 10, opp: 1 });
  assert.ok(hud.idle());
  assert.ok(game);
  done();
});

test("a side's popups play one at a time; the other side's play at once", () => {
  const { c, hud } = setup();
  hud.score({ side: "you", cat: "cards", label: "Most cards", pts: 3, hand: 1 });
  hud.score({ side: "you", cat: "spades", label: "Most spades", pts: 1, hand: 1 });
  hud.score({ side: "opp", cat: "big", label: "Big one", pts: 2, hand: 1 });
  const popped = () => all(hud.node, "hud-block").map((b) => [b.className.includes("popped"), b.className.split(" ")[1]]);
  assert.deepEqual(popped(), [[true, "opp"], [true, "you"]], "both sides show a popup now");
  assert.deepEqual(hud.totals(), { you: 3, opp: 2 }, "the second 'you' popup waits");
  assert.ok(!hud.idle());
  c.run(POPUP_MS - 1);
  assert.deepEqual(hud.totals(), { you: 3, opp: 2 });
  c.run(5000);
  assert.deepEqual(hud.totals(), { you: 4, opp: 2 });
  assert.deepEqual(hud.shown(), { you: 4, opp: 2 });
  assert.ok(hud.idle());
  done();
});

test("a popup's words and points, and the number ticking up under it", () => {
  const { c, hud } = setup();
  hud.score({ side: "you", cat: "cards", label: "Most cards", pts: 3, hand: 1 });
  assert.equal(text(all(hud.node, "hud-pop-label")[1]), "Most cards");
  assert.equal(text(all(hud.node, "hud-pop-pts")[1]), "+3");
  assert.equal(hud.shown().you, 0, "the number has not begun");
  c.run(90);
  assert.equal(hud.shown().you, 1);
  c.run(70);
  assert.equal(hud.shown().you, 2);
  c.run(70);
  assert.equal(hud.shown().you, 3);
  done();
});

test("counting in thirds: a popup and the number in the game's own format, exact", () => {
  const { c, hud, game } = setup(counting);
  hud.score({ side: "you", cat: "count", label: "Three cards", pts: 7, hand: 1 });
  hud.score({ side: "you", cat: "count", label: "Three cards", pts: 5, hand: 1 });
  assert.equal(text(all(hud.node, "hud-pop-pts")[1]), "+2⅓");
  c.run(10_000);
  assert.equal(text(all(hud.node, "hud-pop-pts")[1]), "+1⅔");
  assert.deepEqual(hud.totals(), { you: 12, opp: 0 }, "units are thirds");
  assert.equal(game.format(hud.shown().you), "4");
  assert.equal(text(all(hud.node, "hud-num")[1]), "4");
  hud.score({ side: "you", cat: "bonus", label: "Pagat", pts: 2, hand: 1 });
  c.run(10_000);
  assert.equal(text(all(hud.node, "hud-num")[1]), "4⅔");
  done();
});

test("thirds tick whole points, and the last tick is the exact total", () => {
  const { c, hud } = setup(counting);
  hud.score({ side: "you", cat: "count", label: "Three cards", pts: 8, hand: 1 }); // 2⅔
  const seen = [];
  for (let i = 0; i < 6; i++) {
    c.run(i === 0 ? 90 : 70);
    seen.push(hud.shown().you);
  }
  assert.deepEqual([...new Set(seen)], [3, 5, 8], "three ticks for 2⅔ of a point, ending exactly");
  done();
});

test("the ledger lists the game's own categories; zero reads as a dash, a value in its format", () => {
  const { c, hud } = setup(counting);
  hud.score({ side: "opp", cat: "count", label: "Three cards", pts: 4, hand: 1 });
  c.run(5000);
  hud.setOpen(true);
  const values = all(hud.node, "hud-v").map(text);
  assert.deepEqual(values, ["–", "1⅓", "–", "–"]);
  assert.deepEqual(all(hud.node, "hud-ln").map((l) => text(all(l, "hud-mid")[0])), ["Cards counted", "Bonuses"]);
  assert.deepEqual(all(hud.node, "hud-tot-opp").map(text), ["1⅓"]);
  done();
});

test("with reduced motion the number lands in one step and the popup is not held for the ripple", () => {
  const { c, hud } = setup(fake, { reduced: () => true });
  hud.score({ side: "you", cat: "cards", label: "Most cards", pts: 5, hand: 1 });
  c.run(90);
  assert.equal(hud.shown().you, 5, "one tick, at the first");
  done();
});

test("a reset cancels what was queued before it", () => {
  const { c, hud, game } = setup();
  hud.score({ side: "you", cat: "cards", label: "Most cards", pts: 3, hand: 1 });
  hud.score({ side: "you", cat: "spades", label: "Most spades", pts: 1, hand: 1 });
  hud.reset({ hands: [], live: blank(game) });
  c.run(20_000);
  assert.deepEqual(hud.totals(), { you: 0, opp: 0 });
  assert.deepEqual(hud.shown(), { you: 0, opp: 0 });
  assert.ok(hud.idle());
  done();
});

test("the ledger sized to its hands and the room, and the HUD tall by its game's categories", () => {
  const room = { v: 1000 };
  const { hud } = setup(counting, { room: () => room.v });
  hud.dealt(1);
  hud.dealt(2);
  hud.setOpen(true);
  const list = all(hud.node, "hud-list")[0];
  assert.equal(list.style.height, `${2 * 82}px`, "two hands of two categories");
  room.v = 140;
  hud.fit();
  assert.equal(list.style.height, `${140 - 90}px`);
  done();
});

test("the chevron is the shared CHEVRON_SVG, which the game's own HUD cards reuse", () => {
  const { hud } = setup();
  const [chev] = all(hud.node, "hud-chev");
  assert.equal(chev.html, CHEVRON_SVG);
  done();
});

test("the widget folds when the page asks, as the chevron would", () => {
  const told = [];
  const { hud } = setup(fake, { onToggle: (open) => told.push(open) });
  assert.equal(hud.isOpen(), false);
  hud.fold();
  assert.deepEqual(told, [], "folded already: nothing");
  hud.setOpen(true);
  assert.equal(hud.isOpen(), true);
  hud.fold();
  assert.equal(hud.isOpen(), false);
  assert.deepEqual(told, [true, false]);
  done();
});

test("the HUD's words can be the game's own (a deal, not a hand)", () => {
  const { hud } = setup({ ...fake, words: { hand: "Deal", total: "Sum" } });
  hud.dealt(1);
  assert.match(text(all(hud.node, "hud-sub")[0]), /Deal 1 · live/);
  assert.match(text(all(hud.node, "hud-total")[0]), /Sum/);
  done();
});

test("an `apart` popup is shown and booked in the ledger but leaves the totals and the numbers alone", () => {
  const { c, hud } = setup({ ...counting, apart: ["bonus"], format: (u, cat) => (cat === "bonus" ? String(u) : counting.format(u)) });
  hud.dealt(1);
  hud.score({ side: "you", cat: "count", label: "Three cards", pts: 107, hand: 1 });
  c.run(5000);
  hud.score({ side: "you", cat: "bonus", label: "Trull", pts: 2, hand: 1 });
  assert.match(text(all(hud.node, "hud-pop-pts")[1]), /\+2$/, "the popup says Points");
  c.run(5000);
  assert.deepEqual(hud.totals(), { you: 107, opp: 0 });
  assert.deepEqual(hud.shown(), { you: 107, opp: 0 });
  assert.deepEqual(hud.ledger().hands[0].lines.bonus, { you: 2, opp: 0 });
  assert.ok(hud.idle());
  done();
});
