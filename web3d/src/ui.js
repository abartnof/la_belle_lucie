// The overlay: HUD, buttons, hint bubble, end screen, tutorial pages, help,
// settings and the new-game menu (docs/UI.md). It draws `state` and calls
// `hooks`; it holds no rules. The canvas is a sibling the table controls; the
// overlay lets pointer events through except on its own controls.
//
// createUi(root, hooks) -> { update(state), settings(), busy(bool) }
// hooks = { newGame({seed|null, rules}), undo(), hint(), redeal(), settingsChanged(settings) }

import { PATTERNS } from "../../kit/js/surfaces.js";
import { parseTutorial } from "../../kit/js/tutorial.js";
import TUTORIAL from "../tutorial.md";
import { hintText } from "./hints.js";
import { loadPrefs, savePrefs, defaultStore, decodeRules, encodeRules, stepRedeals, PRESETS, OPTIONS, presetOf, parseSeed, FACES } from "./prefs.js";
import { duePage, pageNote, PAGE_KEYS } from "./tutorial-flow.js";

const DRAW_WORDS = { later: "on the last deal", ready: "ready", used: "used" };

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "onclick") node.addEventListener("click", v);
    else if (k === "onchange") node.addEventListener("change", v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...kids.flat().filter((x) => x != null));
  return node;
}

function spansToNodes(spans, openPage) {
  return spans.map((s) => {
    if (s.page) return el("button", { type: "button", class: "lbl-link", onclick: () => openPage(s.page) }, s.text);
    if (s.bold) return el("strong", {}, s.text);
    if (s.italic) return el("em", {}, s.text);
    return document.createTextNode(s.text);
  });
}

export function createUi(root, hooks) {
  const store = defaultStore();
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const prefs = loadPrefs(store, { reducedMotion: reduced });
  const pages = parseTutorial(TUTORIAL, PAGE_KEYS);
  const seen = new Set(prefs.seen);
  let state = null;
  let prev = null;
  let isBusy = false;
  let lastHome = -1;
  let lastPrompt = null;
  const persist = () => {
    prefs.seen = [...seen];
    savePrefs(store, prefs);
  };

  // ---- dialogs ---------------------------------------------------------------
  let openDialog = null;
  function dialog(title, cls) {
    const heading = el("h2", { class: "lbl-h", id: `lbl-h-${cls}` }, title);
    const body = el("div", { class: "lbl-dbody" });
    const node = el("dialog", { class: `lbl-dialog lbl-${cls}`, "aria-labelledby": heading.id }, heading, body);
    let opener = null;
    node.addEventListener("close", () => {
      if (openDialog === api) openDialog = null;
      (opener?.isConnected ? opener : null)?.focus?.();
      api.onclose?.();
    });
    node.addEventListener("click", (e) => {
      if (e.target === node) node.close();
    });
    const api = {
      node,
      body,
      heading,
      onclose: null,
      open() {
        opener = document.activeElement;
        openDialog = api;
        if (!node.isConnected) root.append(node);
        if (typeof node.showModal === "function") node.showModal();
        else node.setAttribute("open", "");
        (node.querySelector("[data-first]") ?? node.querySelector("button, input, select"))?.focus();
      },
      close() {
        if (typeof node.close === "function") node.close();
        else node.removeAttribute("open");
      },
    };
    return api;
  }
  const button = (label, onclick, cls = "", attrs = {}) => el("button", { type: "button", class: `lbl-btn ${cls}`.trim(), onclick, ...attrs }, label);

  // ---- the HUD and the bar ---------------------------------------------------
  const stat = (name) => {
    const value = el("span", { class: "lbl-v" });
    return { node: el("li", { class: "lbl-stat" }, el("span", { class: "lbl-k" }, name), " ", value), value };
  };
  const sHome = stat("Home");
  const sRedeals = stat("Redeals");
  const sDraw = stat("Draw");
  const sMoves = stat("Moves");
  const hud = el("ul", { class: "lbl-hud", "aria-label": "Game status" }, sHome.node, sRedeals.node, sDraw.node, sMoves.node);

  const bUndo = button("Undo", () => hooks.undo());
  const bHint = button("Hint", () => hooks.hint());
  const bRedeal = button("Redeal", () => hooks.redeal());
  const bNew = button("New game", () => openNewGame(), "lbl-quiet");
  const bSettings = button("Settings", () => openSettings(), "lbl-quiet");
  const bHelp = button("Help", () => openHelp(), "lbl-quiet");
  const bar = el("div", { class: "lbl-bar", role: "toolbar", "aria-label": "Game controls" }, bUndo, bHint, bRedeal, bNew, bSettings, bHelp);

  const sr = el("p", { class: "lbl-sr", "aria-live": "polite" });
  const hintDo = el("p", { class: "lbl-hint-do" });
  const hintWhy = el("p", { class: "lbl-hint-why" });
  const hintClose = button("Dismiss", () => hideHint(), "lbl-quiet lbl-small", { "aria-label": "Dismiss hint" });
  const hintBox = el("div", { class: "lbl-hint", role: "status", "aria-live": "polite", hidden: true }, hintDo, hintWhy, hintClose);
  function hideHint() {
    hintBox.hidden = true;
    hintDo.textContent = hintWhy.textContent = "";
  }

  const endTitle = el("h2", { class: "lbl-h", tabindex: "-1" });
  const endText = el("p", {});
  const end = el(
    "section",
    { class: "lbl-end", hidden: true, "aria-label": "Game over" },
    endTitle,
    endText,
    el("div", { class: "lbl-row" }, button("New game", () => openNewGame(), "", { "data-first": true }), button("Same deal again", () => hooks.newGame({ seed: state.seed, rules: state.rules }), "lbl-quiet")),
  );

  const layer = el("div", { class: "lbl-ui" }, hud, hintBox, end, bar, sr);
  root.append(layer);

  // ---- the tutorial -----------------------------------------------------------
  const tut = dialog("", "tutorial");
  function showPage(key, { fromHelp = false } = {}) {
    const index = PAGE_KEYS.indexOf(key);
    const page = pages[index];
    if (!page) return;
    tut.heading.textContent = page.title;
    tut.body.replaceChildren(
      ...page.blocks.map((b) => {
        if (b.type === "h") return el("h3", {}, ...spansToNodes(b.spans, showPage));
        if (b.type === "p") return el("p", {}, ...spansToNodes(b.spans, showPage));
        return el(b.type, {}, ...b.items.map((it) => el("li", {}, ...spansToNodes(it, showPage))));
      }),
      pageNote(key, state?.options) ? el("p", {}, pageNote(key, state?.options)) : null,
      el(
        "div",
        { class: "lbl-row" },
        button(fromHelp ? "Close" : "Got it", () => tut.close(), "", { "data-first": true }),
        fromHelp ? null : button("Skip the tutorial", () => { PAGE_KEYS.forEach((k) => seen.add(k)); persist(); tut.close(); }, "lbl-quiet"),
      ),
    );
    seen.add(key);
    persist();
    tut.onclose = () => {
      tut.onclose = null;
      if (!fromHelp) queueMicrotask(checkTutorial);
    };
    if (tut.node.open) tut.node.close();
    tut.open();
  }
  function checkTutorial() {
    if (!state || openDialog) return;
    const key = duePage(prev, state, seen, { king: Boolean(state.options?.king) });
    if (key) showPage(key);
  }

  // ---- help -------------------------------------------------------------------
  function openHelp() {
    const help = dialog("Help", "help");
    help.body.append(
      el("p", {}, "Move the top card of a fan onto its own suit, one rank higher, or home. Read a page again:"),
      el("ul", { class: "lbl-plain" }, ...pages.map((p) => el("li", {}, button(p.title, () => { help.close(); showPage(p.key, { fromHelp: true }); }, "lbl-quiet lbl-wide")))),
      el(
        "div",
        { class: "lbl-row" },
        button("Show the tutorial again", () => { seen.clear(); persist(); help.close(); checkTutorial(); }, "lbl-quiet"),
        button("Close", () => help.close(), "", { "data-first": true }),
      ),
    );
    help.onclose = () => help.node.remove();
    help.open();
  }

  // ---- settings ---------------------------------------------------------------
  const settingsNow = () => ({ ...prefs.settings });
  function changed(patch) {
    prefs.settings = { ...prefs.settings, ...patch };
    persist();
    applyHintsSetting();
    hooks.settingsChanged?.(settingsNow());
  }
  function check(id, label, words, key) {
    return el("div", { class: "lbl-field" }, el("label", { for: id }, el("input", { type: "checkbox", id, checked: prefs.settings[key], onchange: (e) => changed({ [key]: e.target.checked }) }), " ", label), el("p", { class: "lbl-note", id: `${id}-d` }, words));
  }
  function select(id, label, options, key, words) {
    const sel = el("select", { id, "aria-describedby": words ? `${id}-d` : false, onchange: (e) => changed({ [key]: e.target.value }) }, options.map(([v, t]) => el("option", { value: v, selected: v === prefs.settings[key] }, t)));
    return el("div", { class: "lbl-field" }, el("label", { for: id }, label), " ", sel, words ? el("p", { class: "lbl-note", id: `${id}-d` }, words) : null);
  }
  function openSettings() {
    const d = dialog("Settings", "settings");
    d.body.append(
      check("lbl-s-hints", "Hints", "Shows the Hint button.", "hints"),
      check("lbl-s-hl", "Highlight legal targets", "Lights the places the chosen card may go.", "highlight"),
      check("lbl-s-home", "Play cards home automatically", "A card that can go home goes at once, with no click.", "autoHome"),
      check("lbl-s-moves", "Count moves", "Shows the move count.", "showMoves"),
      select("lbl-s-speed", "Animation", [["normal", "Normal"], ["instant", "Instant"]], "speed"),
      select("lbl-s-faces", "Card faces", FACES.map((f) => [f, { auto: "Automatic", classic: "Classic", jumbo: "Jumbo" }[f]]), "faces", "Automatic uses large indices on small screens."),
      select("lbl-s-table", "Table pattern", PATTERNS.map((p) => [p.id, p.name]), "table"),
      el("p", { class: "lbl-note" }, "Rules are chosen in New game, never mid-game."),
      el("div", { class: "lbl-row" }, button("Done", () => d.close(), "", { "data-first": true })),
    );
    d.onclose = () => d.node.remove();
    d.open();
  }

  // ---- new game ---------------------------------------------------------------
  function openNewGame() {
    const d = dialog("New game", "newgame");
    let code = state && Number.isInteger(state.rules) ? state.rules : prefs.rules;
    const form = el("div", { class: "lbl-form" });
    const seedInput = el("input", { type: "text", inputmode: "numeric", id: "lbl-seed", autocomplete: "off", placeholder: "Random", "aria-describedby": "lbl-seed-d" });
    const inProgress = () => Boolean(state && state.prompt === "play" && state.moves > 0);
    const confirmBox = el("div", { class: "lbl-confirm", hidden: true, role: "alert" }, el("p", {}, "Leave the game in progress and deal a new one?"));
    function start() {
      prefs.rules = code;
      persist();
      d.close();
      hooks.newGame({ seed: parseSeed(seedInput.value), rules: code });
    }
    const go = button("Deal", () => {
      if (inProgress() && confirmBox.hidden) {
        confirmBox.hidden = false;
        go.hidden = true;
        yes.focus();
      } else start();
    });
    const yes = button("Yes, deal anew", start, "lbl-danger");
    confirmBox.append(el("div", { class: "lbl-row" }, yes, button("Keep playing", () => d.close(), "lbl-quiet")));
    function draw() {
      const o = decodeRules(code);
      const cur = presetOf(code);
      form.replaceChildren(
        el("fieldset", { class: "lbl-set" }, el("legend", {}, "Preset"), ...PRESETS.map((p) => {
          const id = `lbl-p-${p.id}`;
          return el("div", { class: "lbl-opt" }, el("label", { for: id }, el("input", { type: "radio", name: "lbl-preset", id, checked: cur === p.id, onchange: () => { code = p.code; draw(); } }), " ", el("strong", {}, p.name)), el("p", { class: "lbl-note" }, `${p.words} ${p.source}.`));
        }), cur === "custom" ? el("p", { class: "lbl-note" }, "Custom: your own mix of the options below.") : null),
        el("fieldset", { class: "lbl-set" }, el("legend", {}, "Options"),
          el("div", { class: "lbl-opt" }, el("label", { for: "lbl-o-order" }, OPTIONS.inorder.name, " "), el("select", { id: "lbl-o-order", "aria-describedby": "lbl-o-order-d", onchange: (e) => { code = encodeRules({ ...o, inorder: e.target.value === "order" }); draw(); } }, el("option", { value: "shuffle", selected: !o.inorder }, "Shuffled"), el("option", { value: "order", selected: o.inorder }, "In order")), el("p", { class: "lbl-note", id: "lbl-o-order-d" }, OPTIONS.inorder.words)),
          el("div", { class: "lbl-opt" }, el("span", { id: "lbl-o-red" }, OPTIONS.redeals.name), " ", el("span", { class: "lbl-stepper", role: "group", "aria-labelledby": "lbl-o-red" }, button("−", () => { code = encodeRules({ ...o, redeals: stepRedeals(o.redeals, -1) }); draw(); }, "lbl-step", { "aria-label": "Fewer redeals", disabled: o.redeals <= 0 }), el("output", { class: "lbl-count", "aria-live": "polite" }, String(o.redeals)), button("+", () => { code = encodeRules({ ...o, redeals: stepRedeals(o.redeals, 1) }); draw(); }, "lbl-step", { "aria-label": "More redeals", disabled: o.redeals >= 2 })), el("p", { class: "lbl-note" }, OPTIONS.redeals.words)),
          ...["draw", "king", "trefoil"].map((k) => el("div", { class: "lbl-opt" }, el("label", { for: `lbl-o-${k}` }, el("input", { type: "checkbox", id: `lbl-o-${k}`, "aria-describedby": `lbl-o-${k}-d`, checked: o[k], onchange: (e) => { code = encodeRules({ ...o, [k]: e.target.checked }); draw(); } }), " ", OPTIONS[k].name), el("p", { class: "lbl-note", id: `lbl-o-${k}-d` }, OPTIONS[k].words))),
        ),
        el("div", { class: "lbl-opt" }, el("label", { for: "lbl-seed" }, "Deal number "), seedInput, el("p", { class: "lbl-note", id: "lbl-seed-d" }, "Leave empty for a random deal. The same number and rules always deal the same game.")),
      );
    }
    draw();
    d.body.append(form, confirmBox, el("div", { class: "lbl-row" }, go, button("Cancel", () => d.close(), "lbl-quiet")));
    d.onclose = () => d.node.remove();
    d.open();
  }

  // ---- state -------------------------------------------------------------------
  function applyHintsSetting() {
    bHint.hidden = !prefs.settings.hints;
    sMoves.node.hidden = !prefs.settings.showMoves;
    if (!prefs.settings.hints) hideHint();
  }
  const set = (btn, on) => { btn.disabled = isBusy || !on; };
  function update(next) {
    prev = state;
    state = next;
    const home = next.home.reduce((a, b) => a + b, 0);
    sHome.value.textContent = `${home}/52`;
    sRedeals.value.textContent = String(next.redeals_left);
    sDraw.node.hidden = next.draw === "off";
    sDraw.value.textContent = DRAW_WORDS[next.draw] ?? "";
    sMoves.value.textContent = String(next.moves);
    const playing = next.prompt === "play";
    set(bUndo, next.undoable);
    set(bHint, playing);
    set(bRedeal, playing && next.legal.includes("redeal"));
    bRedeal.textContent = `Redeal (${next.redeals_left})`;
    applyHintsSetting();
    if (next.hint && prefs.settings.hints && playing) {
      const t = hintText(next.hint, next);
      hintDo.textContent = t.do;
      hintWhy.textContent = t.why;
      hintBox.hidden = false;
    } else hideHint();
    end.hidden = playing;
    if (!playing) {
      endTitle.textContent = next.prompt === "won" ? "All 52 cards are home." : "No move is left.";
      endText.textContent = next.prompt === "won" ? `Well played, in ${next.moves} moves.` : `${home} of 52 cards are home. Undo a move, or try again.`;
      if (lastPrompt === "play") (end.querySelector("[data-first]"))?.focus();
    }
    if (home !== lastHome || next.prompt !== lastPrompt) {
      sr.textContent = playing ? `${home} of 52 cards home.` : endTitle.textContent;
      lastHome = home;
    }
    lastPrompt = next.prompt;
    checkTutorial();
  }

  function busy(on) {
    isBusy = Boolean(on);
    layer.setAttribute("aria-busy", String(isBusy));
    if (state) update(state);
  }

  applyHintsSetting();
  return { update: (s) => update(s), settings: settingsNow, busy };
}
