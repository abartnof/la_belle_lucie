// The lessons (docs/UI.md): six small positions played on the real table, each
// started on the engine from a layout. The page holds no rules: a lesson is
// data (a layout, its words, which moves the arrow shows) and predicates over
// the engine's state. What may be played is always `state.legal`.
//
// Pure: Node tests run all of it.

import { cardName, num, pileFacts } from "./hints.js";

export const LESSON_RULES = 4;
export const LESSONS_KEY = "lessons"; // the prefs `seen` key: finished or skipped

const SUIT_WORD = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
// `upper` lies directly on `lower` somewhere in a fan (it may have been built on since).
const lies = (fan, upper, lower) => fan.indexOf(upper) > 0 && fan[fan.indexOf(upper) - 1] === lower;
const builtOn = (state, upper, lower) => (state.fans ?? []).some((f) => lies(f, upper, lower));

// The shut-in message of the check lesson, worked out from the position after
// the build (hints.js `pileFacts`, on the pile as it was before the top card).
function shutIn(state, top, under) {
  const at = state.fans.findIndex((f) => lies(f, top, under));
  if (at < 0) return null;
  const k = state.fans[at].indexOf(top);
  const before = { ...state, fans: state.fans.map((f, i) => (i === at ? f.slice(0, k) : f)) };
  const facts = pileFacts(top, at, before);
  const card = facts.urgent ?? facts.soonest;
  if (!card) return null;
  const run = state.fans[at].slice(facts.blockers.length, k + 1).reverse().map(cardName);
  const under_ = run.length > 1 ? `${run.slice(0, -1).join(", ")} and ${run.at(-1)}` : run[0];
  const name = cardName(card);
  return `Now the ${name} is shut in under the ${under_}, though it is next in line for home. It stays there until ${num(facts.release)} ${SUIT_WORD[top[1]]} have gone home. Press Undo and try the other build.`;
}

// step: { id, title, layout, text, doneText, arrow: [{ card, onto | home }] (tried in order; the first legal one is shown),
//         pointAt: "redeal" (the bar's Redeal button is shown), done(state), reaction?(state) -> words or null }
export const LESSONS = Object.freeze([
  {
    id: "build",
    title: "Build",
    layout: "3S 6H / KC 7H ; 0 0 0 0",
    text: "A top card may go onto another fan's top card if it is the same suit and one rank higher. Move the 6♥ onto the 7♥.",
    doneText: "Built. The card beneath is free to move.",
    arrow: [{ card: "6H", onto: "7H" }],
    done: (s) => builtOn(s, "6H", "7H"),
  },
  {
    id: "home",
    title: "Home",
    layout: "KD 2S AS ; 0 0 0 0",
    text: "A card goes home when it is the next of its suit: the ace first, then the 2, 3 and so on. Send the A♠ home, then the 2♠.",
    doneText: "Both are home. Each suit is built up this way to the king.",
    arrow: [{ card: "AS", home: true }, { card: "2S", home: true }],
    done: (s) => (s.home?.[0] ?? 0) >= 2,
  },
  {
    id: "top",
    title: "Only the top card moves",
    layout: "6H 9C / KS 7H / 3D TC ; 0 0 0 0",
    text: "The 6♥ is buried under the 9♣, and only a top card can move. Move the 9♣ onto the 10♣ first, then the 6♥ onto the 7♥.",
    doneText: "Moving a card frees the one beneath it.",
    arrow: [{ card: "9C", onto: "TC" }, { card: "6H", onto: "7H" }],
    done: (s) => builtOn(s, "6H", "7H"),
  },
  {
    id: "redeal",
    title: "Redeal",
    layout: "2S 9H / 5C KD / 7D 3H ; 0 0 0 0",
    text: "No move is left, so you may redeal: the cards not yet home are shuffled and dealt again, twice a game. Press the lit Redeal button.",
    doneText: "The cards are dealt again. Cards at home stay there.",
    arrow: [],
    pointAt: "redeal",
    done: (s) => (s.redeals_left ?? 2) < 2,
  },
  {
    id: "win",
    title: "Win",
    layout: "KC ; 13 13 13 12",
    text: "Get all 52 cards home and you win. Send the K♣ home.",
    doneText: "All 52 are home: you have won.",
    arrow: [{ card: "KC", home: true }],
    done: (s) => s.prompt === "won",
  },
  {
    id: "check",
    title: "The check",
    layout: "2S 7H / 9C 6H / JD 5H ; 1 0 0 0",
    text: "Two builds are open. A card you build can only leave by going home, so ask what lies under the pile: one of these builds is free.",
    doneText: "Free: nothing wanted lies under the 6♥. Before you build, always look under the pile.",
    arrow: [],
    // The free build, and not after the costly one (that is a reaction).
    done: (s) => builtOn(s, "5H", "6H") && !builtOn(s, "6H", "7H"),
    reaction: (s) => shutIn(s, "6H", "7H"),
  },
]);

// The first of a step's arrow candidates that is legal now, as a hint the table
// draws (main.js `hintMarks`): { move, card, onto } -- or null.
export function arrowFor(step, state) {
  if (!state || state.prompt !== "play") return null;
  for (const c of step.arrow ?? []) {
    const from = state.fans.findIndex((f) => f.at(-1) === c.card);
    if (from < 0) continue;
    if (c.home) {
      if (state.legal.includes(`f${from}>h`)) return { move: `f${from}>h`, card: c.card, onto: null };
    } else {
      const to = state.fans.findIndex((f) => f.at(-1) === c.onto);
      if (to >= 0 && state.legal.includes(`f${from}>f${to}`)) return { move: `f${from}>f${to}`, card: c.card, onto: c.onto };
    }
  }
  return null;
}

// What the panel shows for a step in a state.
export function viewOf(index, state, steps = LESSONS) {
  const step = steps[index];
  const reaction = step.reaction?.(state) ?? null;
  const done = !reaction && Boolean(step.done(state));
  return {
    index,
    count: steps.length,
    id: step.id,
    title: step.title,
    text: done ? step.doneText : reaction ?? step.text,
    kind: done ? "done" : reaction ? "reaction" : "task",
    done,
    arrow: done || reaction ? null : arrowFor(step, state),
    pointAt: done ? null : step.pointAt ?? null,
    last: index === steps.length - 1,
  };
}
