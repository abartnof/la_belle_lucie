// From cassino web3d/src/dialogue.js @ 73f0cd7
// From piquet web3d/src/dialogue.js @ 254cb3c, with cassino's `skip`.
// The dialogue at the table: the phrases speech.js asks for, each given its
// words and its moment, for the declarations' dialogue boxes. The words are
// the phrase bank's (web3d/tools/phrases.py, docs/PHRASES.md), bundled into
// the page by web3d/build.py.
//
// Everything is said in several ways, and each is picked without repeating
// the last (bag.js). Each line waits for its moment -- the animation's beat
// for the event it belongs to -- and for the line before it to have been
// said, so a box never appears before its turn.
//
// createDialogue(bank, clock) -> { say(lines, onLine), words(lines), plan(lines), estimate(lines), stop() }
//   bank:   { groups: { id: [key] }, texts: { key: words } }
//   clock:  ms now -- the table's clock, which stops while the table is held
//           still, so time held is not counted as time passed
//   lines:  [{ who: "you"|"them", phrase, delay, at, chatter, vars }] from
//           speech(): phrase is a group id; delay the ms from now until its
//           moment (0 if absent); at, the event it belongs to; chatter, a
//           remark that yields to the calls (below); vars, the words its
//           text's {slots} are filled with ("{Lead}" capitalised).
//           Or { pause: true, delay }: the moment between the declarations'
//           rounds (breaks.js), which comes once the line before it has been
//           said, and before which nothing after it comes.
//   onLine: (line, words, ms) for each line, ms from now until it is said
//           (words null for a pause)

import { createBags } from "./bag.js";

export const GAP = 90; // ms between one speaker's lines
export const TURN = 280; // ms when the other speaks
// How long a line takes to say: about as long as a person takes.
export const saying = (words) => 250 + 65 * (words || "").length;
// Cassino's chatter (play-testing: the talk "VERY verbose"): a remark is said
// in a gap, and is not said at all if it would make a call of a later moment
// (a build called, "Clear!", the count) more than SLACK late, or if it would
// come more than LATE after its own moment, when it would seem to be about
// something else.
export const SLACK = 250;
export const LATE = 2000;

// A text with its {slots} filled from `vars`; a capitalised slot is filled
// capitalised.
function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (slot, key) => {
    const value = String(vars[key.toLowerCase()] ?? slot);
    return key[0] === key[0].toUpperCase() ? value[0].toUpperCase() + value.slice(1) : value;
  });
}

// Where a box beside its speaker goes (`anchor.side`): your words beside
// your hand on a desktop, and your opponent's beside the court card at the
// game's end (play-testing: "to the side of the opponent, with the dialogue
// box tail pointing at the card"). To the speaker's right, at `anchor.x`,
// wrapping to the room there; failing that, to its left, ending at
// `anchor.left`, its tail pointing right; failing both, kept on the screen
// at the right. A box is never squeezed narrower than BESIDE_MIN pixels, or
// its words' own width if less.
export const BESIDE_MIN = 140;
const roomy = (room, width, least = BESIDE_MIN) => room >= Math.min(width, least);
export function besideAt(anchor, width, viewWidth, margin = 8) {
  const fits = (room) => roomy(room, width);
  const right = viewWidth - margin - anchor.x;
  if (fits(right)) return { side: "right", at: anchor.x, room: right };
  if (anchor.left !== undefined && fits(anchor.left - margin)) return { side: "left", at: anchor.left, room: anchor.left - margin };
  return { side: "right", at: viewWidth - margin - width, room: null };
}

// Where a box `w` by `h` px lies, placed at a point (`place`): `right` or
// `left` of it, level with it, its tail pointing back (a box beside its
// speaker); or `above` or `below` it, TAIL px off, centred on it and kept
// on the screen (`view`) -- as style.css draws them.
export const TAIL = 18;
export function boxRect(place, w, h, view, margin = 8) {
  const { kind, x, y } = place;
  if (kind === "right") return { left: x, right: x + w, top: y - h / 2, bottom: y + h / 2 };
  if (kind === "left") return { left: x - w, right: x, top: y - h / 2, bottom: y + h / 2 };
  const cx = Math.min(Math.max(x, w / 2 + margin), view.width - w / 2 - margin);
  const top = kind === "above" ? y - TAIL - h : y + TAIL;
  return { left: cx - w / 2, right: cx + w / 2, top, bottom: top + h };
}

// How much a box covers of what it must not (`rects`: the cards, the move
// bar), in square px; what of it is off the screen counts ten times over.
const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
export function covers(rect, rects, view) {
  const whole = (rect.right - rect.left) * (rect.bottom - rect.top);
  const off = whole - area(rect, { left: 0, right: view.width, top: 0, bottom: view.height });
  return rects.reduce((sum, r) => sum + area(rect, r), 0) + 10 * off;
}

// Where a box goes, of its speaker's places in order (on a phone, overlay.js
// say): the first that covers nothing it must not (`keep`), else the one
// that covers least. Never beside its speaker squeezed narrower than its
// words need (an iPhone, the user: "when the dialogue box shows up on the
// left hand side of the hand, the text sometimes exceeds the text box"):
// narrower than PHONE_BESIDE_MIN, or than its words' own width if less, or
// with a word spilling past its edge, it does not go there at all; a
// speaker's places end with one above or below, which is never squeezed.
// A phone's minimum is a desktop's less a little: its boxes are set smaller
// (style.css), and an iPhone leaves 133 to 139 px beside your opponent's
// hand, where they read well.
//   measure(place) -> { w, h, natural, spills }: the box at that place as
//   the page lays it out, `natural` its width with room to spare.
export const PHONE_BESIDE_MIN = 120;
export function choosePlace(places, measure, keep, view) {
  let best = null;
  for (const place of places) {
    const { w, h, natural, spills } = measure(place);
    const beside = place.kind === "left" || place.kind === "right";
    if (beside && (spills || !roomy(w, natural, PHONE_BESIDE_MIN))) continue;
    const cost = covers(boxRect(place, w, h, view), keep, view);
    if (!best || cost < best.cost) best = { place, cost };
    if (cost === 0) break;
  }
  return best?.place ?? places.at(-1);
}

export function createDialogue(bank, clock = () => performance.now()) {
  const pick = createBags();
  let next = 0; // when the last line said will have ended, on the clock
  let last = null; // who said it
  const chosen = (line) => (line.pause ? null : line.words ?? fill(bank.texts?.[pick(line.phrase, bank.groups?.[line.phrase])] ?? "", line.vars));
  // The words a line is most often said in, for a line not yet given its own.
  const usual = (line) => (line.pause ? null : line.words ?? fill(bank.texts?.[bank.groups?.[line.phrase]?.[0]] ?? "", line.vars));

  // Each line's moment and its end, in ms from now: after the line before it
  // has been said, and not before its own moment; chatter with no room
  // left out. Says nothing.
  function schedule(lines, words) {
    const now = clock();
    let t = next;
    let who = last;
    const out = [];
    lines.forEach((line, i) => {
      const said = words(line);
      const gap = who === null ? 0 : line.pause || line.who !== who ? TURN : GAP;
      const start = Math.max(now + (line.delay ?? 0), t + gap, now);
      const end = line.pause ? start : start + saying(said);
      if (line.chatter) {
        const call = lines.slice(i + 1).find((l) => !l.chatter && !l.pause && l.at !== line.at);
        const late = start - (now + (line.delay ?? 0)) > LATE;
        const blocks = call && end + (call.who === line.who ? GAP : TURN) > now + (call.delay ?? 0) + SLACK;
        if (late || blocks) return;
      }
      t = end;
      who = line.pause ? null : line.who;
      out.push({ ...line, words: said, ms: start - now, end: t - now });
    });
    return { out, t, who };
  }

  return {
    // Each line at its moment, and after the line before it has been said.
    say(lines, onLine) {
      const { out, t, who } = schedule(lines, chosen);
      next = t;
      last = who;
      for (const line of out) onLine?.(line, line.words, line.ms);
    },
    // The lines, each with the words it will be said in, chosen now: so that
    // what is planned (below) is what is then said.
    words(lines) {
      return lines.map((line) => (line.pause ? line : { ...line, words: chosen(line) }));
    },
    // When each line would be said and done, in ms from now, if said next.
    plan(lines) {
      return schedule(lines, usual).out;
    },
    // About when these lines, said next, will all have been said -- in ms
    // from now. For the score, which waits for the dialogue.
    estimate(lines) {
      const out = schedule(lines, usual).out;
      return Math.max(0, next - clock(), ...out.map((l) => l.end));
    },
    // Undo, or a new partie: nothing still to come holds up what follows.
    stop() {
      next = 0;
      last = null;
    },
    // Cassino's: the cards landed by a tap, and the lines not yet said
    // dropped (the director's skip): what is said next is said at once.
    skip() {
      next = 0;
      last = null;
    },
  };
}
