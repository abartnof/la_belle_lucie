// From cassino web3d/src/tutorial.js @ 73f0cd7: the parser only (parseTutorial
// and its inline helper). Cassino's page keys, move kinds and the moments at
// which a page falls due (PAGE_KEYS, moveKinds, pageDue) are cassino's and stay
// out. Kit change: the page keys are an argument, `keys`, not cassino's list.
//
// The tutorial's pages are written in Markdown (a game's tutorial.md, inlined
// by build.py as text: --loader:.md=text) so they can be reworded without
// touching code.
//
// The small piece of Markdown the pages use: `# page`, `## heading`,
// paragraphs, `- ` and `1. ` lists, **bold**, *italic* and [text](#key), a
// link to another page. A page is { key, title, blocks } (the key from `keys`
// by position, else page-N); a block is { type: "h" | "p", spans } or
// { type: "ul" | "ol", items: [spans] }; a span is { text, bold?, italic?, page? }.
// Kit change: the link span (`page` is the key linked to); Cassino has none.
export function parseTutorial(markdown, keys = []) {
  const pages = [];
  let page = null;
  let para = null; // the paragraph or list item being gathered, as lines
  let list = null;
  const flush = () => {
    if (para) {
      const spans = inline(para.lines.join(" "));
      if (para.list) para.list.items.push(spans);
      else page.blocks.push({ type: "p", spans });
    }
    para = null;
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    let m;
    if ((m = /^# (.+)$/.exec(line))) {
      flush();
      list = null;
      page = { key: keys[pages.length] ?? `page-${pages.length}`, title: m[1], blocks: [] };
      pages.push(page);
    } else if (!page) {
      continue;
    } else if ((m = /^## (.+)$/.exec(line))) {
      flush();
      list = null;
      page.blocks.push({ type: "h", spans: inline(m[1]) });
    } else if ((m = /^(-|\d+\.) (.+)$/.exec(line))) {
      flush();
      const type = m[1] === "-" ? "ul" : "ol";
      if (!list || list.type !== type) {
        list = { type, items: [] };
        page.blocks.push(list);
      }
      para = { lines: [m[2]], list };
    } else if (line === "") {
      flush();
      list = null;
    } else if (para) {
      para.lines.push(line);
    } else {
      para = { lines: [line], list: null };
    }
  }
  flush();
  return pages;
}

// **bold**, *italic* and [text](#key), as spans of plain text.
function inline(text) {
  const spans = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(#([\w-]+)\)/g;
  let at = 0;
  let m;
  while ((m = pattern.exec(text))) {
    if (m.index > at) spans.push({ text: text.slice(at, m.index) });
    spans.push(m[1] !== undefined ? { text: m[1], bold: true } : m[2] !== undefined ? { text: m[2], italic: true } : { text: m[3], page: m[4] });
    at = pattern.lastIndex;
  }
  if (at < text.length) spans.push({ text: text.slice(at) });
  return spans;
}
