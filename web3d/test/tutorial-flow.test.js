import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTutorial } from "../../kit/js/tutorial.js";
import { duePage, PAGE_KEYS } from "../src/tutorial-flow.js";

const base = { prompt: "play", moves: 0, legal: ["f1>f2"], draw: "off", fans: [["AS"]], redeals_left: 2 };
const st = (o) => ({ ...base, ...o });

test("only the option pages are text now: the draw and the king", () => {
  assert.deepEqual(PAGE_KEYS, ["draw", "king"]);
});

test("tutorial.md has a page for every key, in order, and each is short", () => {
  const pages = parseTutorial(readFileSync(new URL("../tutorial.md", import.meta.url), "utf8"), PAGE_KEYS);
  assert.deepEqual(pages.map((p) => p.key), PAGE_KEYS);
  for (const p of pages) {
    const words = p.blocks.flatMap((b) => (b.type === "p" ? [b.spans] : b.items ?? [])).flat().map((s) => s.text).join(" ").split(/\s+/).length;
    assert.ok(words < 80, `${p.key}: ${words} words`);
  }
});

test("nothing is due at the deal, on a redeal, or on a risky build: the lessons teach those", () => {
  assert.equal(duePage(null, st({}), new Set(), {}), null);
  assert.equal(duePage(null, st({ moves: 5, legal: ["redeal"] }), new Set(), {}), null);
  assert.equal(duePage(null, st({ moves: 1, home: [1, 0, 0, 0], fans: [["2S", "7H"], ["9C", "6H"]], legal: ["f1>f0"] }), new Set(), {}), null);
});

test("draw falls due when ready, once; king when a fan empties and kings fill", () => {
  const ready = st({ moves: 30, draw: "ready", legal: ["draw f0:0>h"] });
  assert.equal(duePage(null, ready, new Set(), {}), "draw");
  assert.equal(duePage(null, ready, new Set(["draw"]), {}), null);
  const empty = st({ moves: 4, fans: [["AS"], []] });
  assert.equal(duePage(null, empty, new Set(), { king: true }), "king");
  assert.equal(duePage(null, empty, new Set(), { king: false }), null);
});

test("a finished game asks for none", () => {
  assert.equal(duePage(null, st({ prompt: "won", draw: "ready" }), new Set(), {}), null);
});
