// Hint prose. The engine speaks in codes (PROTOCOL.md `hint`); this turns one
// into exactly two sentences: what to do here (it names the cards), then the
// general principle it illustrates (it names no card, rank or fan). Each rule
// has two phrasings of its principle, chosen by the move count so the same
// line is not heard forever and a replay hears the same lines.

const SUITS = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANKS = "A23456789TJQK";
const SUIT_ORDER = "SHDC"; // the order of state.home

// "6H" -> "6♥"; "TS" -> "10♠".
export function cardName(code) {
  const rank = code[0] === "T" ? "10" : code[0];
  return rank + SUITS[code[1]];
}

export const PRINCIPLES = Object.freeze({
  home: [
    "A card that can go home has nothing left to be built on it, so sending it home costs you nothing.",
    "Cards at home are safe for good, and each one sent there frees the fan it came from.",
  ],
  dig: [
    "A buried card can only be reached once everything above it has moved, so work down from the top.",
    "To get at a card you need, move the cards that cover it, one at a time, from the top.",
  ],
  uncover: [
    "Every card you move off a fan frees the one beneath, so favour moves that bring a useful card into reach.",
    "A move that frees a card you can play next is worth more than one that frees nothing.",
  ],
  build: [
    "Building in suit keeps a suit together, and cards stacked that way can later go home in order.",
    "A card placed on the next higher card of its suit sits where it can follow that card's suit home.",
  ],
  king: [
    "A card that nothing can be built on is safest in an empty fan, where it blocks nothing.",
    "An empty fan is free room, and the only card worth putting there is one that never needs to be covered.",
  ],
  redeal: [
    "A redeal is only allowed when nothing else can be played, and it gives every card still on the table a fresh chance.",
    "Redeals are few, so take one only when no other move is left; the cards at home stay where they are.",
  ],
  draw: [
    "The draw may be used once, on the last deal, so spend it on the card that is blocking the most.",
    "A drawn card must be played at once, so draw only when it has somewhere to go.",
  ],
  least_bad: [
    "When every move has a cost, prefer the one that buries the fewest useful cards and keeps the most options open.",
    "With no good move, choose the one that is easiest to live with, since any choice can be taken back.",
  ],
});

// The game's central tension: a card placed on a pile freezes every card beneath
// it until it moves again. Principles for a move that does (it names no card).
// `freeze`: something beneath is needed soon. `chain`: the card goes on the next
// higher card of its suit, so the pile unwinds in the order it was built.
const FREEZE = [
  "Whatever you cover is frozen until the card on top moves again, so cover only what you will not need before it.",
  "Every card you stack on a pile locks those beneath it, so look under a pile before you add to it.",
];
const CHAIN = [
  "Cards stacked in order of one suit leave together, top first, so a pile built that way hides nothing it will later need.",
  "Covering is cheap when what lies beneath cannot move before the card on top, so stack in order and the pile unwinds itself.",
];

// What placing hint.card on its destination fan freezes, from the position the
// hint was made in: { frozen, urgent }, the cards beneath it and the one of them
// the foundations will want soonest (within two of being playable home), if any.
// A higher card of the mover's own suit is never urgent: it waits for the mover.
function freezing(hint, state) {
  const m = /^(?:draw f\d+:\d+|f\d+)>f(\d+)$/.exec(hint.move ?? "");
  const fan = m && state?.fans?.[Number(m[1])];
  if (!fan?.length || !hint.card) return null;
  let urgent = null;
  let soonest = 3;
  for (const x of fan) {
    const gap = RANKS.indexOf(x[0]) - (state.home?.[SUIT_ORDER.indexOf(x[1])] ?? 0);
    if (x[1] === hint.card[1] && RANKS.indexOf(x[0]) > RANKS.indexOf(hint.card[0])) continue;
    if (gap < soonest) [urgent, soonest] = [x, gap];
  }
  return { frozen: fan, urgent };
}

// The sentence for what to do, from the hint's move, then a clause by rule.
function action(hint, freeze) {
  const m = hint.move;
  if (m === "redeal") return "Take a redeal, as no other move is left";
  const card = cardName(hint.card);
  const onto = hint.onto ? cardName(hint.onto) : null;
  const drawn = m.startsWith("draw ");
  const home = m.endsWith(">h");
  let text;
  if (drawn) text = `Draw the ${card} out of its fan and ${home ? "play it home" : onto ? `play it onto the ${onto}` : "play it into the empty fan"}`;
  else if (home) text = `Move the ${card} home to its foundation`;
  else if (onto) text = `Move the ${card} onto the ${onto}`;
  else text = `Move the ${card} into the empty fan`;
  let clause = false;
  if (hint.uncovers && (hint.rule === "uncover" || hint.rule === "dig")) {
    text += hint.rule === "uncover" ? `, which frees the ${cardName(hint.uncovers)}` : `, to dig towards the ${cardName(hint.uncovers)}`;
    clause = true;
  } else if (hint.rule === "least_bad") {
    text += ", the least costly move left";
    clause = true;
  }
  if (freeze?.urgent) {
    text += `${clause ? " while freezing" : ", though it freezes"} the ${cardName(freeze.urgent)} beneath until the ${card} moves again`;
  } else if (freeze && ["build", "uncover", "dig"].includes(hint.rule)) {
    text += `${clause ? "," : ", and"} nothing under it is needed soon`;
  }
  return text;
}

// -> { do, why }. Never throws on an unknown rule: it falls back to least_bad's.
export function hintText(hint, state) {
  const freeze = freezing(hint, state);
  let lines = PRINCIPLES[hint.rule] ?? PRINCIPLES.least_bad;
  if (freeze?.urgent) lines = FREEZE;
  else if (freeze && hint.onto && hint.rule === "build" && hint.onto[1] === hint.card[1] && RANKS.indexOf(hint.onto[0]) === RANKS.indexOf(hint.card[0]) + 1) lines = CHAIN;
  const why = lines[(state?.moves ?? 0) % lines.length];
  return { do: `${action(hint, freeze)}.`, why };
}
