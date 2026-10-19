// La Belle Lucie in the browser.
//
// A client of the wasm module (docs/PROTOCOL.md): it draws `state` and sends
// commands back, and holds no rules. What may be played is `state.legal`.
// engine.js talks to the module, table.js draws the cards (layout.js says where
// they lie), ui.js is the overlay, and selection.js says what a click means.

import { decodeBase64 } from "../../kit/js/engine.js";
import { loadEngine } from "./engine.js";
import { hashFor, parseHash } from "./hash.js";
import { cardName } from "./layout.js";
import { createLessonRun } from "./lesson-run.js";
import { firstMenu } from "./menu-start.js";
import { createMusic, TRACKS } from "./music.js";
import { defaultStore, loadPrefs } from "./prefs.js";
import { decide, targetsOf } from "./selection.js";
import { createTable } from "./table.js";
import { createUi } from "./ui.js";

/* global WASM_BASE64 */

const DEFAULT_RULES = 4;

const WAIT_WORDS = "Wait for the cards to settle.";
const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

// "to the seven of hearts in fan 4", "to empty fan 2", "home".
function targetWords(state, t) {
  if (t.home) return "home";
  const top = state.fans[t.fan].at(-1);
  return top ? `onto the ${cardName(top)} in fan ${t.fan + 1}` : `into empty fan ${t.fan + 1}`;
}

function start(root) {
  const canvas = document.createElement("canvas");
  canvas.id = "stage";
  const uiRoot = document.createElement("div");
  uiRoot.id = "ui";
  root.replaceChildren(canvas, uiRoot);
  return { canvas, uiRoot };
}

export async function run(makeEngine) {
  const root = document.getElementById("app");
  const { canvas, uiRoot } = start(root);
  let stopped = false;
  const engine = await makeEngine((error) => {
    console.error(error);
    stopped = true;
    announce("The table has stopped. Reload the page.");
    const note = document.createElement("p");
    note.className = "lbl-stopped";
    note.setAttribute("role", "alert");
    note.textContent = "The table has stopped. Reload the page.";
    note.style.cssText = "position:fixed;top:40%;left:0;right:0;text-align:center;color:#fff;font:600 1.2rem system-ui;z-index:20";
    document.body.append(note);
  });

  let state = null;
  let sel = null;
  let hintDismissed = false;
  let ui = null;
  let animating = false; // a redeal is playing: clicks and hints wait
  let lessonView = null; // the lesson panel's step while the lessons run (lessons.js `viewOf`)
  let pending = null; // the real deal the lessons give way to: { seed, rules }
  let lessonSeen = { index: -1, kind: null }; // what was last announced
  let settings = { autoHome: false, highlight: true, speed: "normal" };

  // The overlay's strips, so the table is framed between them.
  const px = (selector) => {
    const node = document.querySelector(selector);
    if (!node || node.hidden) return null;
    const r = node.getBoundingClientRect();
    return r.width && r.height ? r : null;
  };
  function margins() {
    const h = window.innerHeight || 1;
    // Only the fixed strips: the hint bubble floats over the table and never
    // moves it.
    const top = [".lbl-hud"].map(px).filter(Boolean).reduce((m, r) => Math.max(m, (r.bottom + 6) / h), 0);
    const bar = px(".lbl-bar");
    const out = { ...(top ? { top } : {}), ...(bar ? { bottom: (h - bar.top + 6) / h } : {}) };
    // The lesson panel sits at the right (above the bar on a narrow window): the table is framed beside it.
    const panel = px(".lbl-lesson");
    if (panel) {
      const w = window.innerWidth || 1;
      if (w < 760) out.bottom = (h - panel.top + 6) / h;
      else out.right = (w - panel.left + 12) / w;
    }
    return out;
  }

  const table = createTable(canvas, {
    margins,
    busy(on) {
      animating = on;
      ui?.busy(on);
    },
  });
  const announce = (text) => table.announce(text);

  function paint() {
    const targets = settings.highlight ? targetsOf(state, sel) : [];
    // In the lessons the lesson's arrow guides, whatever the hint setting says.
    const shown = lessonView ? lessonView.arrow : state.hint && settings.hints !== false && !hintDismissed ? state.hint : null;
    const hint = shown && state.prompt === "play" ? hintMarks(shown) : null;
    table.highlight({ select: sel?.card ?? null, targets, hint });
  }

  // The cards and places a hint names (PROTOCOL.md `hint`).
  function hintMarks(h) {
    const targets = [];
    const m = /^(?:draw f\d+:\d+|f(\d+))>(h|f(\d+))$/.exec(h.move);
    if (m && m[2] === "h") targets.push({ home: true, suit: h.card[1] });
    else if (m && m[3] !== undefined && !h.onto) targets.push({ fan: Number(m[3]) });
    return { cards: [h.card, h.onto].filter(Boolean), targets, move: h.move, card: h.card, onto: h.onto };
  }

  function setState(next, { instant = false, say = null, redeal = false } = {}) {
    state = next;
    sel = null;
    hintDismissed = false;
    table.show(state, { instant, redeal });
    paint();
    ui.update(state);
    table.setMargins({});
    if (say) announce(say);
    else if (lessonView) return;
    else if (state.prompt === "won") announce("All 52 cards are home. You have won.");
    else if (state.prompt === "lost") announce("No move is left.");
  }

  function send(command) {
    if (stopped) return;
    // A redeal belongs to the redeal lesson: any other step is about something else.
    if (lessonView && lessonView.id !== "redeal" && command.trim() === "redeal") return;
    if (animating) {
      announce(WAIT_WORDS);
      return;
    }
    const result = engine.send(command);
    if (!result?.ok) {
      announce("That move is not allowed.");
      return;
    }
    setState(result.state, { redeal: command.trim() === "redeal" });
    if (lessons.active) lessons.observe(state);
    if (command === "hint" && state.hint) announce(state.hint.card ? `Hint: move the ${cardName(state.hint.card)}.` : "Hint: take a redeal.");
  }

  // The menu's Deal. With the Tutorial box ticked the lessons come first and the deal waits.
  function newGame({ seed, rules, tutorial = false }) {
    if (stopped) return;
    const deal = { seed: seed ?? randomSeed(), rules: rules ?? DEFAULT_RULES };
    if (lessons.active) {
      // The menu was used mid-lessons: leave them (unfinished, so they come again) and deal.
      pending = null;
      lessons.skip();
    } else if (canLesson && tutorial) {
      startLessons(deal);
      return;
    }
    dealReal(deal);
  }

  function startLessons(deal) {
    pending = deal;
    lessons.start();
  }

  function dealReal({ seed: s, rules: code }) {
    const next = engine.new({ seed: s, rules: code });
    try {
      history.replaceState(null, "", hashFor(s, code));
    } catch {
      // A file: URL may refuse; the game goes on.
    }
    setState(next, { say: "New game dealt." });
  }

  // The lessons need the engine's `lesson` (docs/PROTOCOL.md); without it the page plays as before.
  const canLesson = typeof engine.lesson === "function";
  const lessons = createLessonRun({
    engine,
    hooks: {
      show: (s) => setState(s, { say: null }),
      panel(view) {
        lessonView = view;
        if (!view) return;
        ui.lesson(view);
        paint();
        table.setMargins({});
        if (view.index !== lessonSeen.index) announce(`Lesson ${view.index + 1} of ${view.count}. ${view.title}. ${view.text}`);
        else if (view.kind !== lessonSeen.kind && view.kind !== "task") announce(view.text);
        lessonSeen = { index: view.index, kind: view.kind };
      },
      end({ failed }) {
        lessonSeen = { index: -1, kind: null };
        const deal = pending;
        pending = null;
        if (!failed && deal) ui.markLessonsSeen();
        if (deal) dealReal(deal);
        ui.lesson(null);
        table.setMargins({});
      },
    },
  });

  ui = createUi(uiRoot, {
    newGame,
    lessonNext: () => {
      if (!animating && lessons.next()) canvas.focus();
    },
    lessonSkip: () => lessons.skip(),
    startLessons: () => {
      if (stopped || !canLesson) return;
      if (lessons.active) return;
      startLessons({ seed: state.seed, rules: state.rules });
    },
    undo: () => send("undo"),
    hint: () => send("hint"),
    hintDismissed: () => {
      hintDismissed = true;
      paint();
    },
    redeal: () => state.legal.includes("redeal") && send("redeal"),
    focusTable: () => canvas.focus(),
    musicNext: () => music.next(),
    settingsChanged(s) {
      settings = { ...settings, ...s };
      table.setSettings(settings);
      music.setOn(settings.music !== false);
      if (state) paint();
    },
  });
  settings = { ...settings, ...ui.settings() };
  table.setSettings(settings);
  // The soundtrack is on unless the player turned it off; the browser starts it at the first click or key.
  const music = createMusic({ sources: typeof MUSIC_SOURCES !== "undefined" ? MUSIC_SOURCES : {}, start: Math.floor(Math.random() * TRACKS.length) });
  music.onChange((info) => ui.music(info));
  music.setOn(settings.music !== false);

  table.onClick((ev) => {
    if (!state || stopped) return;
    if (animating) {
      if (ev.action !== "clear") announce(WAIT_WORDS);
      return;
    }
    const d = decide(state, sel, ev, { autoHome: settings.autoHome });
    if (d.kind === "send") send(d.command);
    else if (d.kind === "select") {
      sel = d.sel;
      paint();
      const targets = targetsOf(state, sel);
      const where = targets.map((t) => targetWords(state, t)).join(", or ");
      announce(sel.pos == null ? `Selected the ${cardName(sel.card)}. It can go ${where}.` : `Selected the ${cardName(sel.card)}, buried in fan ${sel.fan + 1}, to draw. It can go ${where}. D picks the next buried card.`);
    } else if (d.kind === "clear") {
      sel = null;
      paint();
      announce("Selection cleared.");
    } else if (ev.action === "cycle") {
      announce("No buried card in this fan can be drawn.");
    } else if (ev.card && ev.action !== "clear") {
      announce(`The ${cardName(ev.card)} cannot move.`);
    }
  });

  const given = parseHash(window.location.hash);
  const prefs = loadPrefs(defaultStore());
  // Nothing is dealt until the player confirms in the menu.
  ui.openMenu({ ...firstMenu(given, prefs), first: true });

  // For tests and the curious: a read-only window onto the page.
  window.lbl = { lessons, ui, music, state: () => state, table, send: (c) => send(c), selected: () => sel, stopped: () => stopped };
}

if (typeof document !== "undefined" && typeof WASM_BASE64 !== "undefined") {
  run((onTrap) => loadEngine(decodeBase64(WASM_BASE64), onTrap));
}
