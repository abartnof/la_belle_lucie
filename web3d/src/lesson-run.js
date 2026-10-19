// The lesson series' controller (docs/UI.md). No DOM: main.js shows what it
// hands over. The table is the real table; the engine plays each lesson from its
// layout, and the controller only says which step is on, what the panel says,
// and whether Next may be pressed.
//
// createLessonRun({ engine, steps, hooks }) -> { active, start(), observe(state), next(), skip(), view() }
// hooks = { show(state), panel(view | null), end({ skipped }) }
//   show(state): lay this state on the table at once (a lesson's first position)
//   panel(view): what to draw (lessons.js `viewOf`); null when the series is over
//   end({skipped, failed}): the series is over (finished, skipped, or `failed`: the engine refused a layout)

import { LESSONS, LESSON_RULES, viewOf } from "./lessons.js";

export function createLessonRun({ engine, steps = LESSONS, hooks }) {
  let index = -1;
  let current = null; // the latest state
  let shown = null;

  function publish() {
    shown = viewOf(index, current, steps);
    hooks.panel(shown);
    return shown;
  }

  function load(i) {
    const state = engine.lesson({ layout: steps[i].layout, rules: LESSON_RULES });
    if (!state) return false;
    index = i;
    current = state;
    hooks.show(state);
    publish();
    return true;
  }

  function finish(skipped, failed = false) {
    index = -1;
    current = shown = null;
    hooks.panel(null);
    hooks.end(failed ? { skipped, failed } : { skipped });
  }

  return {
    get active() {
      return index >= 0;
    },
    view: () => shown,
    start() {
      if (!load(0)) finish(true, true);
    },
    // After any command the engine answered: the new state, same lesson.
    observe(state) {
      if (index < 0) return null;
      current = state;
      return publish();
    },
    next() {
      if (index < 0 || !shown?.done) return false;
      if (index + 1 >= steps.length) finish(false);
      else if (!load(index + 1)) finish(true, true);
      return true;
    },
    skip() {
      if (index >= 0) finish(true);
    },
  };
}
