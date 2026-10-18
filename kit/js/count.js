// From cassino web3d/src/choreography.js @ 73f0cd7 (Plan.count's timing),
// web3d/src/director.js @ 73f0cd7 (animate's pace) and web3d/src/main.js @
// 73f0cd7 (the quiet window), made generic.
// The count ritual's sequencing, as data on the plan's clock (ms): the
// count told line by line, a line a beat; each line's popup, which holds
// back that player's next one; each counted card turned up as its popup
// comes; and the window in which the talk system keeps silent. The game's
// choreography moves its cards by these times (kinematics.js, timeline.js);
// the HUD (hud.js) plays the popups on the director's clock (director.at), so
// the two keep time with each other and stop together when the table is held.
import { saying } from "./dialogue.js";
import { popupsOf } from "./scoring.js";

export const HUD_TIMING = Object.freeze({
  line: 1000, // a count line's beat
  busy: 1960, // a side's popup, the return included, before its next
});

// The count's pace, as the choreography takes it: whose popup each line
// brings (a player's next waits for the last), and how long one is busy.
export const paceOf = (game, lines) => ({ popups: popupsOf(game, lines), busy: HUD_TIMING.busy });

// The pace at the table's speed. The plan's clock is divided by the speed
// when it is played, a popup lasts the same wall time at any, so `busy` is
// multiplied back; at Instant (above `instant`) nothing waits for the popups.
export function scalePace(pace, speed, instant = 10) {
  if (!pace || speed > instant) return null;
  return { ...pace, busy: (pace.busy ?? 0) * speed };
}

// The count's times: { lines: [ms a line is said], turns: [{ line, at, side,
// cards }] for each line that turns cards up, end }. `start` is when the first
// line is said (the caller adds the beat after what came before); `pace`
// holds a side's next popup back; the game's `cards` says which cards a line
// turns up, `pace.popups` whose popup it is.
export function countSchedule(game, lines, { start = 0, line = HUD_TIMING.line, pace = null } = {}) {
  let t = start;
  const free = {};
  const times = [];
  const turns = [];
  lines.forEach((l, i) => {
    const side = pace?.popups?.[i];
    if (side) {
      t = Math.max(t, free[side] ?? t);
      free[side] = t + (pace.busy ?? 0);
    }
    times.push(t);
    const cards = game.cards(l, i, lines);
    if (cards.length) turns.push({ line: i, at: t, side: game.line(l).side, cards });
    t += line;
  });
  return { lines: times, turns, end: t };
}

// ---- the talk system stays silent ------------------------------------------
// Nothing is said while a hand is scored: the popups tell it. `count` is the
// choreography's count ({ at, lines, end }), `beats` when each event is seen.

export const quietWindow = (count, beats = {}) => (count ? { from: beats[count.at] ?? count.lines[0] ?? 0, to: count.end } : null);

// Whether a line said at `ms` (it takes `saying(words)`) overlaps the quiet.
export const muted = (quiet, ms, words) => Boolean(quiet) && ms + saying(words) > quiet.from && ms < quiet.to;
