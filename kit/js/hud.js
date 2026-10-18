// From cassino web3d/src/hud.js @ 73f0cd7 (the widget half, made generic)
// The score HUD: two segmented lines to the target, the two scores at their
// ends, a popup that swaps into a player's score as they score (a broadcast's
// graphic), and under the chevron the per-hand ledger.
//
// Built from the designer's handoff (cassino docs/TABLE3D.md section 8,
// "The score HUD"): the anatomy, the numbers, the three springs and the
// motion are the reference's, in plain DOM (the springs and the greys are in
// css/hud.css). What was Cassino's is the game's now: `createHud(root, game,
// options)` takes a definition made by defineGame (scoring.js) -- the
// categories and their order, the target, how a value reads, the names and
// words -- so a game that scores by counting cards (in thirds, to 36 of 70)
// uses it as it stands.
//
// Changed from cassino: `mark(side, spec)` puts a role mark after a name (see STAMP).
//
// The model is a per-hand ledger, the totals derived from it; every scoring
// event carries its hand, so a popup played late still lands in its own.

import { blank, handHeight, handTotal, ledgerTotals, listHeight, PANEL_CHROME, segmentState } from "./scoring.js";

export { PANEL_CHROME };
export const POPUP_MS = 1700; // a popup shown before the row rolls back
export const TICK_MS = 70; // a point's tick of the number
export const TICK_FROM = 90; // the first tick, once the popup is in
export const POP_AT = 1900; // the score pops as the row is back
export const POPUP_BUSY = 1960; // a side's popup, the return included, before its next (count.js HUD_TIMING.busy)

// The chevron's drawing, for any card that opens like the HUD's ledger (hud.css `.hud-card`).
export const CHEVRON_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';
export const WORDS = Object.freeze({
  score: "The score",
  hand: "Hand",
  live: "live",
  subtotal: "subtotal",
  total: "Total",
  show: "Show hand-by-hand scores",
  hide: "Hide hand-by-hand scores",
  none: "–",
  points: "points",
});

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

// Restart a CSS animation.
function replay(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

// `game`: from defineGame. Options:
//   later(ms, fn)  runs on the table's clock (director.at), so the HUD holds
//                  when the table is held and keeps time with the cards;
//   onToggle(open) the chevron pressed, the ledger opened or folded (before
//                  the ledger is sized, so the room it is given knows of it);
//   room()         the height in px the whole ledger may take (the page
//                  measures it);
//   reduced()      reduced motion is wanted: a number lands in one step (the
//                  stylesheet collapses the durations of the rest).
export function createHud(root, game, { later = (ms, fn) => setTimeout(fn, ms), onToggle = () => {}, room = () => Infinity, reduced = () => false } = {}) {
  const words = { ...WORDS, ...game.words };
  const { categories, segments: N, scale, format } = game;
  const handH = handHeight(game);
  const whole = game.lit; // segments a score lights (scoring.js defineGame)
  const lines = { you: [], opp: [] };
  const line = (side) => {
    const row = el("div", { class: `hud-line ${side}` });
    for (let n = 1; n <= N; n++) {
      const seg = el("div", { class: "seg unreached" });
      if (n > 1 && (n - 1) % 5 === 0) seg.classList.add("grp"); // gaps: --seg-gap, --seg-gap-group (hud.css)
      if (n === N) seg.style.flexGrow = "1.8";
      lines[side].push(seg);
      row.append(seg);
    }
    return row;
  };
  // A row a player: their name once, at its left; their line of segments;
  // and their score at its end. Your opponent's row first, as they sit
  // across the table, yours second. A score's popup rolls in over its whole
  // row, and the line's new segments ripple as it rolls back.
  const block = (side, name) => {
    const nameNode = el("div", { class: "hud-name" }, name);
    const num = el("div", { class: "hud-num" }, format(0));
    const score = el("div", { class: "hud-score" }, line(side), num);
    const popLabel = el("span", { class: "hud-pop-label" });
    const popPts = el("span", { class: "hud-pop-pts" });
    const pop = el("div", { class: "hud-pop", "aria-live": "polite" }, popLabel, popPts);
    const stage = el("div", { class: `hud-block ${side}` }, score, pop);
    return { node: stage, row: el("div", { class: `hud-side ${side}` }, nameNode, stage), nameNode, num, popLabel, popPts };
  };
  const blocks = { you: block("you", game.names.you), opp: block("opp", game.names.opp) };
  const linesNode = el("div", { class: "hud-lines", role: "img" }, blocks.opp.row, blocks.you.row);
  const chevron = el("button", { class: "hud-chev", type: "button", "aria-expanded": "false", "aria-label": words.show });
  chevron.innerHTML = CHEVRON_SVG;
  const headYou = el("div", { class: "hud-head-you" }, game.names.you);
  const headOpp = el("div", { class: "hud-head-opp" }, game.names.opp);
  const list = el("div", { class: "hud-list" });
  const totYou = el("div", { class: "hud-tot-you" }, format(0));
  const totOpp = el("div", { class: "hud-tot-opp" }, format(0));
  const panel = el(
    "div",
    { class: "hud-panel" },
    el(
      "div",
      { class: "hud-panel-inner" },
      el("div", { class: "hud-rule" }),
      el("div", { class: "hud-head" }, headYou, el("div", { class: "hud-mid hud-goal" }, game.goal), headOpp),
      list,
      el("div", { class: "hud-rule" }),
      el("div", { class: "hud-total" }, totYou, el("div", { class: "hud-mid" }, words.total), totOpp),
    ),
  );
  const hud = el(
    "section",
    { class: "hud", "aria-label": words.score },
    el("div", { class: "hud-top" }, linesNode, chevron),
    panel,
  );
  root.append(hud);

  // What the HUD shows: the ledger as played out so far, kept per hand, and
  // the numbers (in units: whole numbers, `scale` to a point).
  let ledger = new Map(); // hand number -> the hand's lines
  const ended = new Set(); // the hands counted
  let current = null; // the hand under way, if one is
  let totals = { you: 0, opp: 0 };
  let shown = { you: 0, opp: 0 };
  let open = false;
  let flash = null; // { cat, side }: the live line that just changed
  let names = { ...game.names };
  const marks = { you: null, opp: null }; // { text, title } after a side's name, or null
  let epoch = 0; // a reset cancels what was queued before it
  const queue = { you: [], opp: [] };
  const busyUntil = { you: false, opp: false };

  // A side's name, and after it its mark (a "(D)" with a tooltip, drawn by hud.css from data-tip on hover and
  // focus; focusable, so a keyboard or a tap reaches it).
  function drawName(side) {
    const mark = marks[side];
    blocks[side].nameNode.replaceChildren(
      ...(mark ? [`${names[side]} `, el("span", { class: "hud-mark", tabindex: "0", role: "note", "data-tip": mark.title, "aria-label": mark.title }, `(${mark.text})`)] : [names[side]]),
    );
  }

  function drawSegments(side, from = null) {
    lines[side].forEach((seg, i) => {
      const n = i + 1;
      const st = segmentState(n, totals[side], N, scale, game.lit);
      const lighting = from !== null && n > whole(from) && n <= Math.min(N, whole(totals[side]));
      seg.className = `seg ${st}`;
      if (lighting) {
        seg.style.animationDelay = `${(n - whole(from) - 1) * TICK_MS}ms`;
        replay(seg, "lighting");
      }
    });
  }

  function drawNumbers() {
    blocks.you.num.textContent = format(shown.you);
    blocks.opp.num.textContent = format(shown.opp);
    linesNode.setAttribute(
      "aria-label",
      `${names.you} ${format(totals.you)}. ${names.opp} ${format(totals.opp)}. ${game.goal}.`,
    );
  }

  const value = (v, cat) => (v > 0 ? format(v, cat) : words.none);

  function drawList() {
    const numbers = [...ledger.keys()].sort((a, b) => a - b);
    const all = numbers.map((n) => ledger.get(n));
    list.replaceChildren(
      ...all.map((h, i) => {
        const isLive = numbers[i] === current && !ended.has(current);
        const y = handTotal(game, h, "you");
        const o = handTotal(game, h, "opp");
        const hand = el("div", { class: `hud-hand${isLive ? " live" : ""}` });
        hand.style.setProperty("--d", `${70 + i * 50}ms`);
        categories.forEach(([cat, label], j) => {
          const yv = h[cat].you;
          const ov = h[cat].opp;
          const you = el("div", { class: `hud-v you${yv > 0 ? "" : " none"}` }, value(yv, cat));
          const opp = el("div", { class: `hud-v opp${ov > 0 ? "" : " none"}` }, value(ov, cat));
          const row = el("div", { class: "hud-ln" }, you, el("div", { class: "hud-mid" }, label), opp);
          row.style.setProperty("--d", `${70 + i * 50 + 80 + j * 35}ms`);
          if (isLive && flash?.cat === cat) replay(flash.side === "you" ? you : opp, "flash");
          hand.append(row);
        });
        const sub = el(
          "div",
          { class: "hud-sub" },
          el("span", { class: `hud-sv${y > o ? " lead" : ""}` }, format(y)),
          el("span", { class: "hud-mid" }, isLive ? `${words.hand} ${numbers[i]} · ${words.live}` : `${words.hand} ${numbers[i]} ${words.subtotal}`),
          el("span", { class: `hud-sv${o > y ? " lead" : ""}` }, format(o)),
        );
        hand.append(sub, el("div", { class: "hud-gap" }));
        return hand;
      }),
    );
    fit();
    totYou.textContent = format(totals.you);
    totOpp.textContent = format(totals.opp);
    totYou.classList.toggle("lead", totals.you > totals.opp);
    totOpp.classList.toggle("lead", totals.opp > totals.you);
  }

  // The ledger sized to its hands and the room it has.
  function fit() {
    const listH = listHeight(list.children.length, room(), handH);
    const height = open ? `${PANEL_CHROME + listH}px` : "0px";
    if (list.style.height !== `${listH}px`) list.style.height = `${listH}px`;
    if (panel.style.height !== height) panel.style.height = height;
  }

  // The ledger opened or folded: by the chevron, or folded by the page when
  // you tap anywhere else.
  function setOpen(next) {
    if (next === open) return;
    open = next;
    hud.classList.toggle("open", open);
    chevron.setAttribute("aria-expanded", String(open));
    chevron.setAttribute("aria-label", open ? words.hide : words.show);
    onToggle(open);
    drawList();
  }
  chevron.addEventListener("click", () => setOpen(!open));

  // One scoring event, played out: the bars ripple at once, the popup rolls
  // in over the score while the number ticks up beneath it (a tick a whole
  // point, the last exactly the total), and the score rolls back, popping.
  function play(e) {
    const mine = epoch;
    const side = e.side;
    const from = totals[side];
    const hand = e.hand ?? current ?? 1;
    if (!ledger.has(hand)) ledger.set(hand, blank(game));
    ledger.get(hand)[e.cat][side] += e.pts;
    const counts = !game.apart.includes(e.cat); // an apart category is paid beside the count
    if (counts) totals = { ...totals, [side]: totals[side] + e.pts };
    flash = { cat: e.cat, side };
    drawList();
    const b = blocks[side];
    b.popLabel.textContent = e.label;
    b.popPts.textContent = `+${format(e.pts, e.cat)}`;
    b.node.classList.add("popped");
    const ticks = reduced() ? 1 : Math.max(1, Math.ceil(e.pts / scale));
    for (let k = 1; counts && k <= ticks; k++) {
      later((k - 1) * TICK_MS + TICK_FROM, () => {
        if (mine !== epoch) return;
        shown = { ...shown, [side]: from + Math.round((e.pts * k) / ticks) };
        drawNumbers();
      });
    }
    later(POPUP_MS, () => {
      if (mine !== epoch) return;
      b.node.classList.remove("popped");
      drawSegments(side, from); // the new segments ripple as the row comes back
    });
    later(POP_AT, () => mine === epoch && counts && replay(b.num, "pop"));
    busyUntil[side] = true;
    later(POPUP_BUSY, () => {
      if (mine !== epoch) return;
      busyUntil[side] = false;
      const next = queue[side].shift();
      if (next) play(next);
    });
  }

  const copy = (x) => JSON.parse(JSON.stringify(x));

  return {
    // Shown at once, nothing played out: a new game, a sitting restored.
    // `given`: { hands: [ledger...], live: ledger | null } (scoring.js).
    reset(given, who = game.names) {
      epoch++;
      queue.you.length = 0;
      queue.opp.length = 0;
      busyUntil.you = busyUntil.opp = false;
      names = { ...who };
      drawName("you");
      drawName("opp");
      headYou.textContent = who.you;
      headOpp.textContent = who.opp;
      ledger = new Map(given.hands.map((h, i) => [i + 1, copy(h)]));
      ended.clear();
      for (const n of ledger.keys()) ended.add(n);
      current = given.live ? given.hands.length + 1 : null;
      if (given.live) ledger.set(current, copy(given.live));
      totals = ledgerTotals(game, given);
      shown = { ...totals };
      flash = null;
      blocks.you.node.classList.remove("popped");
      blocks.opp.node.classList.remove("popped");
      drawSegments("you");
      drawSegments("opp");
      drawNumbers();
      drawList();
    },
    // A mark after a side's name ({ text, title }), or none (null). It stays
    // through resets until changed.
    mark(side, spec) {
      marks[side] = spec ?? null;
      drawName(side);
    },
    // A scoring event ({ side, cat, label, pts, hand }: countEvents, or the
    // game's own, such as a point shown as it is made), played out when its
    // side is free.
    score(e) {
      if (busyUntil[e.side]) queue[e.side].push(e);
      else play(e);
    },
    // A hand is counted: it joins the counted ones (its popups still to play
    // land in it).
    endHand(hand = current) {
      if (hand === null) return;
      ended.add(hand);
      flash = null;
      drawList();
    },
    // A new hand dealt: its live block appears (empty until it scores).
    dealt(hand) {
      current = hand ?? (current ?? 0) + 1;
      if (!ledger.has(current)) ledger.set(current, blank(game));
      drawList();
    },
    idle: () => !busyUntil.you && !busyUntil.opp && !queue.you.length && !queue.opp.length,
    shown: () => ({ ...shown }),
    totals: () => ({ ...totals }),
    hands: () => ended.size,
    // The ledger as shown: each hand's number, whether it is counted, and its
    // lines; and the hand under way.
    ledger: () => ({
      hands: [...ledger.keys()].sort((a, b) => a - b).map((n) => ({ hand: n, ended: ended.has(n), lines: copy(ledger.get(n)) })),
      current,
    }),
    node: hud,
    // The room changed (the window, the drawer under the score): the ledger
    // sized again.
    fit,
    setOpen,
    fold: () => setOpen(false),
    isOpen: () => open,
  };
}
