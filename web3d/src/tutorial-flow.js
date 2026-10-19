// When each tutorial page opens (docs/UI.md). The first three are front-loaded:
// they say what a player must know before the first move. The others fall due
// just in time, the first time their element is on the table (the check: the
// first time a build would cover something wanted before the card can get home). Pure: the ui
// keeps the seen set (prefs) and asks again after each page is closed.

import { pileFacts } from "./hints.js";

export const PAGE_KEYS = ["table", "foundations", "building", "check", "redeal", "draw", "king"];
const FRONT = ["table", "foundations", "building"];

// Whether some build now legal would cover a lower card of its own suit, or a
// card wanted before the builder's suit can reach it (hints.js `pileFacts`).
function costlyBuild(state) {
  for (const move of state.legal ?? []) {
    const m = /^f(\d+)>f(\d+)$/.exec(move);
    const card = m && state.fans?.[m[1]]?.at(-1);
    if (!card || !state.fans[m[2]]?.length) continue;
    const pile = pileFacts(card, Number(m[2]), state);
    if (pile.lock || pile.urgent) return true;
  }
  return false;
}

// -> a page key, or null. `seen`: Set or array of keys read. `options`:
// { king } -- whether kings may fill an empty fan in this game.
export function duePage(prevState, state, seen, options = {}) {
  if (!state || state.prompt !== "play") return null;
  const read = seen instanceof Set ? seen : new Set(seen ?? []);
  const due = (key) => !read.has(key);
  if (state.moves === 0) {
    for (const key of FRONT) if (due(key)) return key;
  }
  if (due("check") && state.moves > 0 && costlyBuild(state)) return "check";
  if (due("redeal") && state.legal?.includes("redeal")) return "redeal";
  if (due("draw") && state.draw === "ready") return "draw";
  if (due("king") && options.king && state.fans?.some((f) => f.length === 0)) return "king";
  return null;
}

// Extra words for a page, only in games whose options call for them (else null).
export function pageNote(key, options = {}) {
  if (key === "foundations" && options.trefoil) return "In this game the four aces are already home, and there are 16 fans.";
  return null;
}
