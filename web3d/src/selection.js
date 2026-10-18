// What a click means (pure; no rules here: what may be played is `state.legal`).
//
// A click on a top card with a move to make chooses it; a click on a place it
// may go sends the move. With the draw ready (state.draw === "ready"), a buried
// card with a legal draw may be chosen too. Clicks elsewhere clear.

const fanOf = (state, i) => state.fans[i] ?? [];

// The choice a click makes, or null.
export function pickable(state, ev) {
  if (ev.fan == null || !ev.card) return null;
  const cards = fanOf(state, ev.fan);
  const at = cards.indexOf(ev.card);
  if (at < 0) return null;
  if (at === cards.length - 1) {
    return state.legal.some((m) => m.startsWith(`f${ev.fan}>`)) ? { fan: ev.fan, card: ev.card, pos: null } : null;
  }
  if (state.draw === "ready" && state.legal.some((m) => m.startsWith(`draw f${ev.fan}:${at}>`))) {
    return { fan: ev.fan, card: ev.card, pos: at };
  }
  return null;
}

// The buried cards of a fan that the draw may take now, in order from the bottom:
// [{ fan, card, pos }]. Empty unless the draw is ready.
export function drawCandidates(state, fan) {
  if (state.draw !== "ready" || fan == null) return [];
  const cards = fanOf(state, fan);
  const out = [];
  for (let at = 0; at < cards.length - 1; at++) {
    if (state.legal.some((m) => m.startsWith(`draw f${fan}:${at}>`))) out.push({ fan, card: cards[at], pos: at });
  }
  return out;
}

const prefix = (sel) => (sel.pos == null ? `f${sel.fan}>` : `draw f${sel.fan}:${sel.pos}>`);

// Where the chosen card may go: [{ fan } | { home: true, suit }].
export function targetsOf(state, sel) {
  if (!sel) return [];
  const p = prefix(sel);
  return state.legal
    .filter((m) => m.startsWith(p))
    .map((m) => m.slice(p.length))
    .map((dest) => (dest === "h" ? { home: true, suit: sel.card[1] } : { fan: Number(dest.slice(1)) }));
}

// The command to send for a choice and a destination ("h" or "f5").
export const commandFor = (sel, dest) => {
  const text = `${prefix(sel)}${dest}`;
  return text.startsWith("draw") ? text : `move ${text}`;
};

// -> { kind: "send", command } | { kind: "select", sel } | { kind: "clear" } | { kind: "none" }
export function decide(state, sel, ev, { autoHome = false } = {}) {
  if (state.prompt !== "play") return { kind: "none" };
  if (ev.action === "clear") return sel ? { kind: "clear" } : { kind: "none" };
  const legal = new Set(state.legal);
  const top = ev.fan != null ? fanOf(state, ev.fan).at(-1) : undefined;
  const home = (fan) => ({ kind: "send", command: `move f${fan}>h` });

  // H with a drawn card chosen in this very fan: it goes home if it may.
  if (ev.action === "home" && sel && sel.pos != null && ev.fan === sel.fan && legal.has(`${prefix(sel)}h`)) {
    return { kind: "send", command: commandFor(sel, "h") };
  }
  // A double click, or H on the keyboard: the top card home, if it may go.
  if ((ev.action === "dblclick" || ev.action === "home") && ev.fan != null && ev.card === top && legal.has(`f${ev.fan}>h`)) {
    return home(ev.fan);
  }
  // D on the keyboard: choose the next buried card of this fan that the draw may take.
  if (ev.action === "cycle") {
    const c = drawCandidates(state, ev.fan);
    if (!c.length) return { kind: "none" };
    const at = sel && sel.fan === ev.fan && sel.pos != null ? c.findIndex((x) => x.pos === sel.pos) : -1;
    return { kind: "select", sel: c[(at + 1) % c.length] };
  }
  if (sel) {
    const dest = ev.home ? "h" : ev.fan != null ? `f${ev.fan}` : null;
    if (dest !== null && legal.has(`${prefix(sel)}${dest}`)) return { kind: "send", command: commandFor(sel, dest) };
    // The same card again puts it down.
    if (ev.fan === sel.fan && ev.card === sel.card) {
      return ev.action === "dblclick" ? { kind: "none" } : { kind: "clear" };
    }
  }
  const next = pickable(state, ev);
  if (next) {
    if (autoHome && next.pos == null && legal.has(`f${next.fan}>h`)) return home(next.fan);
    return { kind: "select", sel: next };
  }
  return sel ? { kind: "clear" } : { kind: "none" };
}
