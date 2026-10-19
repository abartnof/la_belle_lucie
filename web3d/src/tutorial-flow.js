// When each just-in-time tutorial page opens (docs/UI.md). What a player must
// know before the first move is taught by the lessons (lessons.js), not by text
// pages. The two pages left belong to options and fall due the first time their
// element is on the table: the draw (when it is ready) and the king (when a fan
// has emptied and kings fill). Pure: the ui keeps the seen set (prefs) and asks
// again after each page is closed.

export const PAGE_KEYS = ["draw", "king"];

// -> a page key, or null. `seen`: Set or array of keys read. `options`:
// { king } -- whether kings may fill an empty fan in this game.
export function duePage(prevState, state, seen, options = {}) {
  if (!state || state.prompt !== "play") return null;
  const read = seen instanceof Set ? seen : new Set(seen ?? []);
  const due = (key) => !read.has(key);
  if (due("draw") && state.draw === "ready") return "draw";
  if (due("king") && options.king && state.fans?.some((f) => f.length === 0)) return "king";
  return null;
}
