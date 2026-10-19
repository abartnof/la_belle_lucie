// Hint prose. The engine speaks in codes (PROTOCOL.md `hint`); this turns one,
// with the position it was made in, into exactly two sentences: what to do here
// and now (it names the cards, and weighs what the move gives against what it
// costs), then the general rule of thumb it illustrates (it names no card, rank,
// suit or fan).
//
// The game's central tension: a card stacked on a pile freezes every card under
// it, and a card placed by a build can only leave by going home, so what it
// covers waits for its own suit to go home through the run it sits on. That wait
// is worked out here from `state.fans` and `state.home`; the engine adds how
// many plays a move leaves open (`hint.open`) and the best rival build
// (`hint.alt`). The wording varies with the move count, so a replay hears the
// same lines and a long game does not hear one line forever.

const SUITS = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_WORD = { S: ["spade", "spades"], H: ["heart", "hearts"], D: ["diamond", "diamonds"], C: ["club", "clubs"] };
const RANKS = "A23456789TJQK";
const SUIT_ORDER = "SHDC"; // the order of state.home
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen"];
export const num = (n) => WORDS[n] ?? String(n); // a count in words, or digits past thirteen
const LONG = 34; // words: past this, a sentence drops its least important clauses

// "6H" -> "6♥"; "TS" -> "10♠".
export function cardName(code) {
  return (code[0] === "T" ? "10" : code[0]) + SUITS[code[1]];
}

const rank = (c) => RANKS.indexOf(c[0]) + 1;
const suitIx = (c) => SUIT_ORDER.indexOf(c[1]);
// How many cards of its own suit must go home before this one can.
const wait = (c, home) => rank(c) - home[suitIx(c)] - 1;
const more = (n, c) => `${num(n)} more ${SUIT_WORD[c[1]][n === 1 ? 0 : 1]}`;
const waitPhrase = (c, home) => {
  const n = wait(c, home);
  return n === 0 ? "next in line for home" : `${more(n, c)} must go home first`;
};

// What a build does to the pile it lands on, from the position before it. The
// run is the mover and the cards of its own suit each one higher right under it:
// they go home straight behind it, so they hold nothing up. Everything under the
// run is a blocker, frozen until the whole run has gone home (`release` cards of
// the mover's suit from now). `urgent` is the blocker wanted soonest, if within
// three of home and before the run releases it; `lock` a blocker of the mover's
// own suit and lower rank, which can then never go home before the mover.
export function pileFacts(card, to, state) {
  const home = state.home ?? [0, 0, 0, 0];
  const pile = state.fans[to];
  let i = pile.length - 1;
  let bottom = card;
  while (i >= 0 && pile[i][1] === card[1] && rank(pile[i]) === rank(bottom) + 1) [bottom, i] = [pile[i], i - 1];
  const blockers = pile.slice(0, i + 1);
  const release = rank(bottom) - home[suitIx(card)];
  const lock = blockers.find((z) => z[1] === card[1] && rank(z) < rank(card)) ?? null;
  let urgent = null;
  let soonest = null;
  for (const z of blockers) {
    const w = wait(z, home);
    if (w < release && w <= 3 && (!urgent || w < wait(urgent, home))) urgent = z;
    if (!soonest || w < wait(soonest, home)) soonest = z;
  }
  return { blockers, release, lock, urgent, soonest, runOnly: blockers.length === 0 };
}

// "f3>f5" -> { from: 3, to: 5 }; null for a draw, a move home, or anything else.
function route(move) {
  const m = /^f(\d+)>f(\d+)$/.exec(move ?? "");
  return m ? { from: Number(m[1]), to: Number(m[2]) } : null;
}

// What a build frees: the card it uncovers, how soon it is wanted at home, and
// the top card it could then be built on.
function freed(h, state, from, to) {
  if (!h.uncovers) return null;
  const home = state.home ?? [0, 0, 0, 0];
  const tops = state.fans.map((f, i) => (i === from ? null : i === to ? h.card : f.at(-1)));
  const next = tops.find((t) => t && t[1] === h.uncovers[1] && rank(t) === rank(h.uncovers) + 1) ?? null;
  return { card: h.uncovers, wait: wait(h.uncovers, home), onto: next };
}

// The facts about one build (the hint or its rival), or null when it is not one
// or the position is not to hand.
function describe(h, state) {
  const r = route(h?.move);
  if (!r || !h.card || !h.onto || !state?.fans?.[r.from] || !state.fans[r.to]) return null;
  return { ...r, pile: pileFacts(h.card, r.to, state), freed: freed(h, state, r.from, r.to) };
}

const pick = (list, k) => list[k % list.length];

// The principles, each a rule of thumb: no card, rank, suit or fan, no digit.
export const WHY = Object.freeze({
  lock: [
    "A card you build can only leave for its foundation, so never build over a lower card of its own suit: neither could get home.",
    "Before you build, look under the pile: a lower card of the same suit there can never get home until the pile is undone.",
  ],
  lock_last: [
    "With no redeal left nothing is ever shuffled loose, so a lock made now lasts to the end of the game.",
    "On the last deal every freeze is permanent, so be sure the card beneath really can wait.",
  ],
  urgent: [
    "Before you build, ask whether anything under the pile is wanted before this card's suit can reach it, and weigh that against what the move gives you.",
    "Count before you cover: whatever lies beneath waits for the card above to go home.",
    "Every move frees one card and buries another, so ask which of the two you will want sooner.",
  ],
  urgent_last: [
    "On the last deal nothing is reshuffled, so what you cover stays covered; count how long before you stack.",
    "With no redeal to rescue you, protect the cards that will be wanted soonest.",
  ],
  avoid: [
    "When two moves look alike, prefer the one that covers the card you will want later rather than sooner.",
    "Look under both piles before you choose; the cards you will need first should stay within reach.",
  ],
  tradeoff: [
    "A freeze is a price, not a mistake: pay it when what you gain is worth more than what waits.",
    "The best move is often not the one that freezes least but the one that gains most for what it freezes.",
  ],
  free: [
    "A move that frees a card you will want soon beats one that frees nothing.",
    "Favour the move that brings the next useful card into reach.",
  ],
  chain: [
    "Building is free when nothing under the pile is wanted before this card's suit can reach it.",
    "A pile stacked in order of one suit unwinds by itself, so covering costs nothing when what lies beneath is wanted last.",
  ],
  open: [
    "Keep options open: a position with many moves can absorb a mistake, one with a single move cannot.",
    "Moves you keep in hand now are cards you can still bring home before the table stalls.",
  ],
  open_gain: [
    "The moves a play opens up matter as much as the card it moves.",
    "Prefer the play that leaves you more to do next.",
  ],
  redeal: [
    "A redeal scatters every pile, so neat stacks matter less than cards already home.",
    "Cards at home are the only progress a redeal cannot undo, so favour them before the table stalls.",
  ],
  redeal_last: [
    "The last deal is never shuffled again, so play it slowly and count before you stack.",
    "Once the redeals are gone, how you stack decides how the game ends.",
  ],
  floor: [
    "The last card of a suit to go home makes the best floor for a pile, since nothing beneath it is ever waiting on it.",
    "Put a card that leaves last at the bottom of a pile; it holds up nothing.",
  ],
  home: [
    "A card that can go home has nothing left to be built on it, so sending it home costs you nothing.",
    "Cards at home are safe for good, and each one sent there frees the fan it came from.",
  ],
  dig: [
    "A buried card can only be reached once everything above it has moved, so work down from the top.",
    "To get at a card you need, move the cards that cover it, one at a time, from the top.",
  ],
  least_bad: [
    "When every move has a cost, take the one whose price you can see and can afford.",
    "With no good move, choose the one that is easiest to live with, since any choice can be taken back.",
  ],
  draw: [
    "The draw may be used once, on the last deal, so spend it on the card that is blocking the most.",
    "A drawn card must be played at once, so draw only when it has somewhere to go.",
  ],
});

// The principle for a hint without a position to weigh (or not a build).
const BY_RULE = { home: "home", dig: "dig", uncover: "free", build: "chain", king: "floor", draw: "draw", redeal: "redeal", least_bad: "least_bad" };

function openClause(hint, before) {
  if (hint.open == null) return "";
  if (hint.open === 1) return ", after which just one move is open";
  if (hint.open >= before + 2) return `, after which ${num(hint.open)} moves are open, ${num(hint.open - before)} more than now`;
  if (hint.open >= 2 && hint.open <= before - 2) return `, after which only ${num(hint.open)} moves are open`;
  return "";
}

// A move that is not a build of the kind weighed above: the card, where it goes,
// and what it frees.
function plain(hint) {
  const card = cardName(hint.card);
  const onto = hint.onto ? cardName(hint.onto) : null;
  const m = hint.move;
  let text;
  if (m.startsWith("draw ")) text = `Draw the ${card} out of its fan and ${m.endsWith(">h") ? "play it home" : onto ? `play it onto the ${onto}` : "play it into the empty fan"}`;
  else if (m.endsWith(">h")) text = `Move the ${card} home to its foundation`;
  else if (onto) text = `Move the ${card} onto the ${onto}`;
  else text = `Move the ${card} into the empty fan`;
  const u = hint.uncovers && !m.startsWith("draw ") ? cardName(hint.uncovers) : null;
  if (u) text += hint.rule === "dig" ? `, to dig towards the ${u}` : `, which frees the ${u}`;
  if (hint.rule === "king") text += ", and nothing is ever frozen beneath it";
  if (hint.rule === "least_bad") text += ", the least costly move left";
  return text;
}

// -> { do, why }. Never throws on an unknown rule or a missing position: it falls
// back to the plain wording and the rule's own principle.
export function hintText(hint, state) {
  const k = state?.moves ?? 0;
  const left = state?.redeals_left ?? 1;
  const home = state?.home ?? [0, 0, 0, 0];
  const lastDeal = left === 0 && state?.draw !== "ready";
  const say = (d, key) => ({ do: `${d}.`, why: pick(WHY[key] ?? WHY.least_bad, k) });

  if (hint.move === "redeal") {
    if (!state?.fans) return say("Take a redeal, as no other move is left", "redeal");
    const onTable = state.fans.reduce((n, f) => n + f.length, 0);
    const homeN = home.reduce((a, b) => a + b, 0);
    const stays = homeN === 0 ? "nothing is home yet" : homeN === 1 ? "the one card at home stays" : `the ${homeN} at home stay`;
    const rest = left <= 1 ? "this is your last redeal" : `you will have ${num(left - 1)} more after it`;
    return say(`No move is left, so take a redeal: the ${onTable} cards on the table are gathered and dealt fresh, ${stays}, and ${rest}`, left <= 1 ? "redeal_last" : "redeal");
  }

  const d = describe(hint, state);
  if (!d) return say(plain(hint), BY_RULE[hint.rule] ?? "least_bad");

  const { pile, freed: fr } = d;
  const card = cardName(hint.card);
  const before = (state.legal ?? []).filter((c) => c !== "redeal").length;
  const alt = describe(hint.alt, state);
  const verb = ["Move", "Play", "Slide"][(k >> 1) % 3];
  const head = `${verb} the ${card} onto the ${cardName(hint.onto)}`;
  const altName = hint.alt ? `the ${cardName(hint.alt.card)} onto the ${cardName(hint.alt.onto)}` : "";
  // What the rival would do that the hint does not.
  const altBad = alt?.pile.lock
    ? `lock the ${cardName(alt.pile.lock)} under it`
    : alt?.pile.urgent
      ? `freeze the ${cardName(alt.pile.urgent)} (${waitPhrase(alt.pile.urgent, home)})`
      : null;
  const hintBad = pile.lock || pile.urgent;
  const piece = { gain: "", cost: "", mob: "", rival: "" };
  let why;

  if (fr) {
    if (fr.wait === 0) piece.gain = `, which lets the ${cardName(fr.card)} go home next`;
    else if (fr.onto) piece.gain = `, which frees the ${cardName(fr.card)} to move onto the ${cardName(fr.onto)}`;
    else piece.gain = `, which frees the ${cardName(fr.card)}`;
  }
  if (pile.lock) {
    const exit = lastDeal ? "no redeal is left to undo it" : state.draw === "ready" ? "only the draw can undo it" : "only a redeal can undo it";
    piece.cost = `, but it sits over the ${cardName(pile.lock)} of its own suit, so neither can reach home and ${exit}`;
    why = lastDeal ? "lock_last" : "lock";
  } else if (pile.urgent) {
    const z = pile.urgent;
    const span = `${more(pile.release, hint.card)} ${pile.release === 1 ? "has" : "have"} gone home${pile.release >= 9 ? ", most of the suit" : ""}`;
    piece.cost = `, but it freezes the ${cardName(z)} beneath (${waitPhrase(z, home)}) until ${span}`;
    why = lastDeal ? "urgent_last" : alt && !altBad ? "tradeoff" : "urgent";
  } else {
    if (!(altBad && !hintBad)) {
      piece.cost = pile.runOnly
        ? ", and it lands on a run of its own suit, so nothing is held up"
        : `, and what it covers can wait: the ${cardName(pile.soonest)} beneath has ${more(wait(pile.soonest, home), pile.soonest)} to go first`;
    }
    why = "chain";
  }
  const tail = openClause(hint, before);
  if (tail && !(altBad && !hintBad)) {
    piece.mob = tail;
    if (why === "chain") why = hint.open >= before + 2 ? "open_gain" : "open";
  }
  if (alt) {
    if (altBad && !hintBad) {
      piece.rival = `; ${altName} would ${altBad}`;
      why = lastDeal ? "urgent_last" : "avoid";
    } else if (hintBad && !altBad) {
      const lose = hint.alt.uncovers == null ? "free nothing" : hint.alt.open < hint.open ? `leave only ${num(hint.alt.open)} move${hint.alt.open === 1 ? "" : "s"} open` : null;
      if (lose) piece.rival = `; ${altName} would not freeze that, but it would ${lose}`;
    }
  }
  // One sentence stays readable: shed the least important clauses until it is short.
  const words = () => (head + piece.gain + piece.cost + piece.mob + piece.rival).split(/\s+/).length;
  if (words() > LONG) piece.mob = "";
  if (words() > LONG && piece.cost.includes("of its own suit")) piece.cost = piece.cost.replace(/, so neither can reach home and .*$/, ", so neither can reach home");
  return say(head + piece.gain + piece.cost + piece.mob + piece.rival, why);
}
