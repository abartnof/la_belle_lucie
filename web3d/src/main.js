// La Belle Lucie in the browser.
//
// A client of the wasm module (docs/PROTOCOL.md): it draws `state` and sends
// commands back, and holds no rules. What may be played is `state.legal`.
// engine.js talks to the module, table.js draws the cards (layout.js says where
// they lie), ui.js is the overlay, and selection.js says what a click means.

import { decodeBase64 } from "../../kit/js/engine.js";
import { loadEngine } from "./engine.js";
import { cardName } from "./layout.js";
import { defaultStore, loadPrefs } from "./prefs.js";
import { decide, targetsOf } from "./selection.js";
import { createTable } from "./table.js";
import { createUi } from "./ui.js";

/* global WASM_BASE64 */

const DEFAULT_RULES = 4;

// "#seed=12&rules=4" -> { seed, rules } (either may be absent).
export function parseHash(hash) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ""));
  const num = (k, max) => {
    const v = params.get(k);
    return v !== null && /^\d{1,10}$/.test(v) && Number(v) <= max ? Number(v) : null;
  };
  return { seed: num("seed", 4294967295), rules: num("rules", 63) };
}

export const hashFor = (seed, rules) => `#seed=${seed}&rules=${rules}`;

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
  let ui = null;
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
    return { ...(top ? { top } : {}), ...(bar ? { bottom: (h - bar.top + 6) / h } : {}) };
  }

  const table = createTable(canvas, { margins });
  const announce = (text) => table.announce(text);

  function paint() {
    const targets = settings.highlight ? targetsOf(state, sel) : [];
    const hint = state.hint && state.prompt === "play" ? hintMarks(state.hint) : null;
    table.highlight({ select: sel?.card ?? null, targets, hint });
  }

  // The cards and places a hint names (PROTOCOL.md `hint`).
  function hintMarks(h) {
    const targets = [];
    const m = /^(?:draw f\d+:\d+|f(\d+))>(h|f(\d+))$/.exec(h.move);
    if (m && m[2] === "h") targets.push({ home: true, suit: h.card[1] });
    else if (m && m[3] !== undefined && !h.onto) targets.push({ fan: Number(m[3]) });
    return { cards: [h.card, h.onto].filter(Boolean), targets };
  }

  function setState(next, { instant = false, say = null } = {}) {
    state = next;
    sel = null;
    table.show(state, { instant });
    paint();
    ui.update(state);
    table.setMargins({});
    if (say) announce(say);
    else if (state.prompt === "won") announce("All 52 cards are home. You have won.");
    else if (state.prompt === "lost") announce("No move is left.");
  }

  function send(command) {
    if (stopped) return;
    const result = engine.send(command);
    if (!result?.ok) {
      announce("That move is not allowed.");
      return;
    }
    setState(result.state);
    if (command === "hint" && state.hint) announce(`Hint: move the ${cardName(state.hint.card)}.`);
  }

  function newGame({ seed, rules }) {
    if (stopped) return;
    const s = seed ?? randomSeed();
    const code = rules ?? DEFAULT_RULES;
    const next = engine.new({ seed: s, rules: code });
    try {
      history.replaceState(null, "", hashFor(s, code));
    } catch {
      // A file: URL may refuse; the game goes on.
    }
    setState(next, { say: "New game dealt." });
  }

  ui = createUi(uiRoot, {
    newGame,
    undo: () => send("undo"),
    hint: () => send("hint"),
    redeal: () => state.legal.includes("redeal") && send("redeal"),
    settingsChanged(s) {
      settings = { ...settings, ...s };
      table.setSettings(settings);
      if (state) paint();
    },
  });
  settings = { ...settings, ...ui.settings() };
  table.setSettings(settings);

  table.onClick((ev) => {
    if (!state || stopped) return;
    const d = decide(state, sel, ev, { autoHome: settings.autoHome });
    if (d.kind === "send") send(d.command);
    else if (d.kind === "select") {
      sel = d.sel;
      paint();
      const targets = targetsOf(state, sel);
      announce(`Selected the ${cardName(sel.card)}. It can go ${targets.map((t) => targetWords(state, t)).join(", or ")}.`);
    } else if (d.kind === "clear") {
      sel = null;
      paint();
      announce("Selection cleared.");
    } else if (ev.card && ev.action !== "clear") {
      announce(`The ${cardName(ev.card)} cannot move.`);
    }
  });

  const given = parseHash(window.location.hash);
  const prefs = loadPrefs(defaultStore());
  newGame({ seed: given.seed, rules: given.rules ?? prefs.rules ?? DEFAULT_RULES });

  // For tests and the curious: a read-only window onto the page.
  window.lbl = { state: () => state, table, send: (c) => send(c), selected: () => sel, stopped: () => stopped };
}

if (typeof document !== "undefined" && typeof WASM_BASE64 !== "undefined") {
  run((onTrap) => loadEngine(decodeBase64(WASM_BASE64), onTrap));
}
