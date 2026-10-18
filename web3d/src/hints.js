// Hint prose. The engine speaks in codes (PROTOCOL.md `hint`); this turns one
// into exactly two sentences: what to do here (it names the cards), then the
// general principle it illustrates (it names no card, rank or fan). Each rule
// has two phrasings of its principle, chosen by the move count so the same
// line is not heard forever and a replay hears the same lines.

const SUITS = { S: "♠", H: "♥", D: "♦", C: "♣" };

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

// The sentence for what to do, from the hint's move, then a clause by rule.
function action(hint) {
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
  if (hint.uncovers && (hint.rule === "uncover" || hint.rule === "dig")) {
    text += hint.rule === "uncover" ? `, which frees the ${cardName(hint.uncovers)}` : `, to dig towards the ${cardName(hint.uncovers)}`;
  } else if (hint.rule === "least_bad") {
    text += ", the least costly move left";
  }
  return text;
}

// -> { do, why }. Never throws on an unknown rule: it falls back to least_bad's.
export function hintText(hint, state) {
  const lines = PRINCIPLES[hint.rule] ?? PRINCIPLES.least_bad;
  const why = lines[(state?.moves ?? 0) % lines.length];
  return { do: `${action(hint)}.`, why };
}
