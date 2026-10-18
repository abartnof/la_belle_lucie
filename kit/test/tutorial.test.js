// The tutorial's small Markdown parser. (Cassino's pages, their keys and the
// moments they fall due are cassino's and stay in its repository.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTutorial } from "../js/tutorial.js";

const TEXT = `ignored before the first page

# Welcome

A **bold** word and an *italic* one,
over two lines.

## What to do

- first
- second **bold**

1. one
2. two

# Second page

Plain.
`;

test("pages split at '# ', each with its title and blocks; text before the first is dropped", () => {
  const pages = parseTutorial(TEXT, ["intro", "next"]);
  assert.deepEqual(pages.map((p) => [p.key, p.title]), [["intro", "Welcome"], ["next", "Second page"]]);
});

test("a page's keys come from the list given; past its end a page is page-N", () => {
  assert.deepEqual(parseTutorial(TEXT, ["a"]).map((p) => p.key), ["a", "page-1"]);
  assert.deepEqual(parseTutorial(TEXT).map((p) => p.key), ["page-0", "page-1"]);
});

test("paragraphs join their lines; bold and italic become spans", () => {
  const [p] = parseTutorial(TEXT)[0].blocks;
  assert.equal(p.type, "p");
  assert.deepEqual(p.spans, [
    { text: "A " },
    { text: "bold", bold: true },
    { text: " word and an " },
    { text: "italic", italic: true },
    { text: " one, over two lines." },
  ]);
});

test("headings and lists: '## ', '- ' and '1. '", () => {
  const blocks = parseTutorial(TEXT)[0].blocks;
  assert.deepEqual(blocks.map((b) => b.type), ["p", "h", "ul", "ol"]);
  assert.equal(blocks[2].items.length, 2);
  assert.deepEqual(blocks[2].items[1], [{ text: "second " }, { text: "bold", bold: true }]);
  assert.equal(blocks[3].items.length, 2);
});

test("a link to another page is [text](#key): a span with `page`, among words or alone", () => {
  const [p] = parseTutorial("# A\n\nSee [the full page](#full) or **this**.\n\n- [One](#one)\n")[0].blocks;
  assert.deepEqual(p.spans, [{ text: "See " }, { text: "the full page", page: "full" }, { text: " or " }, { text: "this", bold: true }, { text: "." }]);
  const list = parseTutorial("# A\n\n- [One](#one)\n")[0].blocks[0];
  assert.deepEqual(list.items[0], [{ text: "One", page: "one" }]);
});

test("a bracket that is not a page link stays text", () => {
  const [p] = parseTutorial("# A\n\nA [note] and [a](http://x) too.\n")[0].blocks;
  assert.equal(p.spans.map((s) => s.text).join(""), "A [note] and [a](http://x) too.");
  assert.ok(p.spans.every((s) => !s.page));
});
