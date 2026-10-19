// The overlay: HUD, buttons, hint bubble, end screen, tutorial pages, help,
// settings and the new-game menu (docs/UI.md). It draws `state` and calls
// `hooks`; it holds no rules. The canvas is a sibling the table controls; the
// overlay lets pointer events through except on its own controls.
//
// createUi(root, hooks) -> { update(state), settings(), busy(bool), openMenu({seed, rules}) }
// openMenu opens the New game menu with no game behind it (the page's start): it cannot be cancelled.
// hooks = { newGame({seed|null, rules}), undo(), hint(), redeal(), settingsChanged(settings),
//           lessonNext(), lessonSkip(), startLessons() }
// lesson(view | null) shows the lesson panel (lessons.js `viewOf`) or takes it away; lessonsSeen() and
// markLessonsSeen() read and keep the prefs `seen` key "lessons".

import { PATTERNS } from "../../kit/js/surfaces.js";
import { parseTutorial } from "../../kit/js/tutorial.js";
import TUTORIAL from "../tutorial.md";
import { hintText } from "./hints.js";
import { loadPrefs, savePrefs, defaultStore, decodeRules, encodeRules, stepRedeals, PRESETS, OPTIONS, presetOf, parseSeed, seedProblem, normalizeRules, REDEAL_FX } from "./prefs.js";
import { LESSONS_KEY } from "./lessons.js";
import { EFFECT_NAMES } from "./redeal-fx.js";
import { duePage, PAGE_KEYS } from "./tutorial-flow.js";

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

// A 24-unit Material-style icon button's picture (our own drawing: a note, and a slash when the music is off).
const SVG_NS = "http://www.w3.org/2000/svg";
function svg(paths) {
  const node = document.createElementNS(SVG_NS, "svg");
  node.setAttribute("viewBox", "0 0 24 24");
  node.setAttribute("aria-hidden", "true");
  node.setAttribute("focusable", "false");
  for (const [cls, d] of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", cls);
    node.append(path);
  }
  return node;
}
const NOTE = "M12 3v10.55a4 4 0 1 0 2 3.45V7h4V3h-6z";
const SLASH = "M4.3 3 3 4.3 19.7 21 21 19.7z";
// Transport symbols, as on any player: play, pause, skip to the next.
const PLAY = "M8 5v14l11-7z";
const PAUSE = "M6 5h4v14H6zM14 5h4v14h-4z";
const NEXT = "M6 6l8.5 6L6 18zM16 6h2v12h-2z";

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
  // Where focus goes when a dialog closes and the control that opened it is gone.
  function focusBack() {
    if (typeof hooks.focusTable === "function") hooks.focusTable();
    else if (!bHint.hidden && !bHint.disabled) bHint.focus();
  }
  function dialog(title, cls) {
    const heading = el("h2", { class: "lbl-h", id: `lbl-h-${cls}` }, title);
    const body = el("div", { class: "lbl-dbody" });
    const node = el("dialog", { class: `lbl-dialog lbl-${cls}`, "aria-labelledby": heading.id }, heading, body);
    let opener = null;
    node.addEventListener("close", () => {
      // A stale event: the dialog was opened again since it closed.
      if (node.open) return;
      if (api.locked) {
        // The first menu has nothing behind it: however it closed (Escape twice,
        // a stray close), it comes back.
        api.reshow();
        return;
      }
      if (openDialog === api) openDialog = null;
      const back = opener?.isConnected && opener !== document.body && !opener.disabled ? opener : null;
      if (back) back.focus?.();
      else focusBack();
      api.onclose?.();
    });
    node.addEventListener("cancel", (e) => {
      api.escaped = true;
      if (api.locked) e.preventDefault();
    });
    node.addEventListener("click", (e) => {
      if (e.target === node && !api.locked) node.close();
    });
    const api = {
      node,
      body,
      heading,
      onclose: null,
      locked: false,
      escaped: false,
      returnTo: null, // where focus goes back to, if not where it was on opening
      focusIn() {
        (node.querySelector("[data-first]") ?? node.querySelector("button, input, select"))?.focus();
      },
      open() {
        api.escaped = false;
        if (node.open) {
          // Already showing (a tutorial page replaced by another): keep what it will return focus to.
          openDialog = api;
          api.focusIn();
          return;
        }
        const was = document.activeElement;
        opener = api.returnTo ?? (was && !node.contains(was) ? was : opener);
        openDialog = api;
        api.show();
      },
      show() {
        if (!node.isConnected) root.append(node);
        if (typeof node.showModal === "function") node.showModal();
        else node.setAttribute("open", "");
        api.focusIn();
      },
      reshow() {
        openDialog = api;
        api.show();
      },
      close() {
        if (openDialog === api) openDialog = null;
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
  const sRedeals = stat("Redeals remaining");
  const sDraw = stat("Draw");
  const sMoves = stat("Moves");
  // The music: a Material 3 toggle icon button at the end of the HUD.
  // Collapsed, a note; opened, it grows sideways into a player: the song's name, play or pause, next.
  const musicTitle = el("span", { class: "lbl-music-title", id: "lbl-music-title" });
  const bPlay = el("button", { type: "button", class: "lbl-iconbtn lbl-flat lbl-music-play", onclick: () => changed({ music: !prefs.settings.music }) });
  const playIcon = svg([["lbl-playing", PAUSE], ["lbl-stopped", PLAY]]);
  bPlay.append(playIcon);
  const bNext = el("button", { type: "button", class: "lbl-iconbtn lbl-flat lbl-music-next", "aria-label": "Next song", title: "Next song", onclick: () => hooks.musicNext?.() }, svg([["", NEXT]]));
  const musicBody = el("div", { class: "lbl-music-body", id: "lbl-music-body" }, el("div", { class: "lbl-music-inner" }, musicTitle, bPlay, bNext));
  const bMusic = el("button", { type: "button", class: "lbl-iconbtn lbl-music-toggle", "aria-pressed": "true", "aria-expanded": "false", "aria-controls": "lbl-music-body", "aria-label": "Music player", title: "Music" }, svg([["lbl-note", NOTE], ["lbl-slash", SLASH]]));
  const musicBox = el("div", { class: "lbl-music", role: "group", "aria-label": "Music" }, bMusic, musicBody);
  const setMusicOpen = (open) => {
    musicBox.classList.toggle("lbl-open", open);
    bMusic.setAttribute("aria-expanded", String(open));
    musicBody.inert = !open;
  };
  setMusicOpen(false);
  bMusic.addEventListener("click", () => setMusicOpen(!musicBox.classList.contains("lbl-open")));
  document.addEventListener("pointerdown", (e) => musicBox.classList.contains("lbl-open") && !musicBox.contains(e.target) && setMusicOpen(false));
  musicBox.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !musicBox.classList.contains("lbl-open")) return;
    e.stopPropagation();
    setMusicOpen(false);
    bMusic.focus();
  });
  function musicState(info) {
    const on = prefs.settings.music;
    bMusic.setAttribute("aria-pressed", String(on));
    bMusic.title = on && info?.title ? `Music: ${info.title}` : on ? "Music" : "Music (paused)";
    musicTitle.textContent = info?.title ?? "Music";
    bPlay.setAttribute("aria-pressed", String(on));
    bPlay.setAttribute("aria-label", on ? "Pause the music" : "Play the music");
    bPlay.title = on ? "Pause" : "Play";
    playIcon.classList.toggle("lbl-is-playing", on);
  }
  const hud = el("ul", { class: "lbl-hud", "aria-label": "Game status" }, sHome.node, sRedeals.node, sDraw.node, sMoves.node, el("li", { class: "lbl-tool" }, musicBox));

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
  const hintClose = button("\u00d7", () => { hideHint(); hooks.hintDismissed?.(); }, "lbl-quiet lbl-small lbl-x", { "aria-label": "Dismiss hint" });
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
    el("div", { class: "lbl-row" }, button("New game", () => openNewGame(), "lbl-primary", { "data-first": true }), button("Same deal again", () => hooks.newGame({ seed: state.seed, rules: state.rules }), "lbl-quiet")),
  );

  // ---- the lesson panel ---------------------------------------------------------
  // A Material 3 card at the side of the table (above the bar on a narrow window):
  // the step counter, a title, one or two sentences, a text button to skip and a
  // filled button for Next, which waits until the step is done.
  let lessonMode = false;
  let lView = null;
  const lCount = el("p", { class: "lbl-lesson-count" });
  const lTitle = el("h2", { class: "lbl-lesson-title" });
  const lText = el("p", { class: "lbl-lesson-text" });
  const lNext = el("button", { type: "button", class: "lbl-filled", onclick: () => hooks.lessonNext?.() }, "Next");
  const lSkip = el("button", { type: "button", class: "lbl-textbtn", onclick: () => hooks.lessonSkip?.() }, "Skip tutorial");
  const lesson = el("section", { class: "lbl-lesson", "aria-label": "Lesson", hidden: true }, lCount, lTitle, lText, el("div", { class: "lbl-lesson-actions" }, lSkip, lNext));
  // Above the bar on a narrow window, whatever height the bar wraps to.
  function placeLesson() {
    const narrow = (window.innerWidth || 1000) < 760;
    const r = bar.getBoundingClientRect();
    lesson.style.bottom = narrow && r.height ? `${Math.round(window.innerHeight - r.top + 8)}px` : "";
  }
  window.addEventListener("resize", placeLesson);
  function showLesson(view) {
    lView = view;
    lessonMode = Boolean(view);
    lesson.hidden = !view;
    if (state) update(state);
    if (!view) {
      bRedeal.classList.remove("lbl-point");
      return;
    }
    lCount.textContent = `${view.index + 1} of ${view.count}`;
    lTitle.textContent = view.title;
    lText.textContent = view.text;
    lesson.dataset.kind = view.kind;
    lNext.disabled = isBusy || !view.done;
    placeLesson();
    lNext.textContent = view.last ? "Play" : "Next";
    bRedeal.classList.toggle("lbl-point", view.pointAt === "redeal");
  }

  // No game yet: the strips stay hidden until the first deal (the menu is all there is).
  const layer = el("div", { class: "lbl-ui lbl-idle" }, hud, hintBox, lesson, end, bar, sr);
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
      el(
        "div",
        { class: "lbl-row" },
        button(fromHelp ? "Close" : "Got it", () => tut.close(), "", { "data-first": true }),
        fromHelp ? null : button("Skip the tutorial", () => { PAGE_KEYS.forEach((k) => seen.add(k)); persist(); tut.close(); }, "lbl-quiet"),
      ),
    );
    seen.add(key);
    persist();
    // Escape dismisses the tutorial for now (the pages not yet read stay unread:
    // the just-in-time ones come when their element first does, and all are in Help);
    // "Got it" goes on to the next page that is due.
    tut.onclose = () => {
      tut.onclose = null;
      if (!fromHelp && !tut.escaped) queueMicrotask(checkTutorial);
    };
    // Another page while one is showing replaces it in place (no close and reopen,
    // whose late close event would undo the new page).
    if (!tut.node.open) tut.returnTo = fromHelp ? bHelp : null;
    tut.open();
  }
  function checkTutorial() {
    if (!state || openDialog || lessonMode) return;
    const key = duePage(prev, state, seen, { king: Boolean(state.options?.king) });
    if (key) showPage(key);
  }

  // ---- help -------------------------------------------------------------------
  // A game in progress cannot be kept while the lessons use the table: the lessons end with this deal dealt afresh.
  const inProgress = () => Boolean(!lessonMode && state && state.prompt === "play" && state.moves > 0);
  const yesLeave = button("Yes, leave this game", null, "lbl-danger");
  const noLeave = button("Keep playing", null, "lbl-quiet");
  const confirmLeave = el("div", { class: "lbl-confirm", hidden: true, role: "alert" }, el("p", {}, "Leave the game in progress? The lessons end with this deal dealt afresh."), el("div", { class: "lbl-row" }, yesLeave, noLeave));
  function openHelp() {
    confirmLeave.hidden = true;
    const help = dialog("Help", "help");
    help.body.append(
      el("p", {}, "Move the top card of a fan onto its own suit, one rank higher, or home. Read about an option:"),
      el("ul", { class: "lbl-plain" }, ...pages.map((p) => el("li", {}, button(p.title, () => { help.close(); showPage(p.key, { fromHelp: true }); }, "lbl-quiet lbl-wide")))),
      el(
        "div",
        { class: "lbl-row" },
        button("Play the lessons again", () => {
          if (inProgress() && confirmLeave.hidden) {
            confirmLeave.hidden = false;
            yesLeave.focus();
          } else if (!inProgress()) { help.close(); hooks.startLessons?.(); }
        }, "lbl-quiet"),
        button("Close", () => help.close(), "", { "data-first": true }),
      ),
      confirmLeave,
    );
    yesLeave.onclick = () => { help.close(); hooks.startLessons?.(); };
    noLeave.onclick = () => { confirmLeave.hidden = true; };
    help.onclose = () => help.node.remove();
    help.open();
  }

  // ---- settings ---------------------------------------------------------------
  const settingsNow = () => ({ ...prefs.settings });
  function changed(patch) {
    prefs.settings = { ...prefs.settings, ...patch };
    persist();
    applyHintsSetting();
    musicState(null);
    hooks.settingsChanged?.(settingsNow());
  }
  function check(id, label, words, key) {
    return el("div", { class: "lbl-field" }, el("label", { for: id }, el("input", { type: "checkbox", id, checked: prefs.settings[key], onchange: (e) => changed({ [key]: e.target.checked }) }), " ", label), words ? el("p", { class: "lbl-note", id: `${id}-d` }, words) : null);
  }
  function select(id, label, options, key, words) {
    const sel = el("select", { id, "aria-describedby": words ? `${id}-d` : false, onchange: (e) => changed({ [key]: e.target.value }) }, options.map(([v, t]) => el("option", { value: v, selected: v === (prefs.settings[key] === "jumbo" ? "auto" : prefs.settings[key]) }, t)));
    return el("div", { class: "lbl-field" }, el("label", { for: id }, label), " ", sel, words ? el("p", { class: "lbl-note", id: `${id}-d` }, words) : null);
  }
  function openSettings() {
    const d = dialog("Settings", "settings");
    d.body.append(
      check("lbl-s-hints", "Hints", "Shows the Hint button.", "hints"),
      check("lbl-s-hl", "Highlight legal targets", "Lights the places the chosen card may go.", "highlight"),
      check("lbl-s-home", "Play cards home automatically", "A card that can go home goes at once, with no click.", "autoHome"),
      check("lbl-s-moves", "Count moves", "Shows the move count.", "showMoves"),
      check("lbl-s-music", "Music", null, "music"),
      select("lbl-s-speed", "Animation", [["normal", "Normal"], ["instant", "Instant"]], "speed"),
      select("lbl-s-redeal", "Redeal animation", REDEAL_FX.map((id) => [id, id === "random" ? "Random" : id === "simple" ? "Simple" : EFFECT_NAMES[id]]), "redealFx", "How the cards are gathered and dealt again. Random picks a different one each time; Simple is the plain slide. Instant animation skips it."),
      select("lbl-s-faces", "Card faces", [["auto", "High-visibility"], ["classic", "Classic"], ["contrast", "Suit contrast"]], "faces", "High-visibility has large corner indices that stay readable where cards overlap. Suit contrast adds white-on-black clubs and white-on-red diamonds."),
      select("lbl-s-table", "Table pattern", PATTERNS.map((p) => [p.id, p.name]), "table"),
      el("p", { class: "lbl-note" }, "Rules are chosen in New game, never mid-game."),
      el("div", { class: "lbl-row" }, button("Done", () => d.close(), "", { "data-first": true })),
    );
    d.onclose = () => d.node.remove();
    d.open();
  }

  // ---- new game ---------------------------------------------------------------
  // `first`: the page's opening menu, with no game behind it: nothing to cancel back to.
  function openNewGame({ first = false, seed = null, rules = null } = {}) {
    const d = dialog("New game", "newgame");
    d.locked = first;
    let code = normalizeRules(rules ?? (state && Number.isInteger(state.rules) ? state.rules : prefs.rules));
    const form = el("div", { class: "lbl-form" });
    const seedInput = el("input", { type: "text", inputmode: "numeric", id: "lbl-seed", autocomplete: "off", placeholder: "Random", "aria-describedby": "lbl-seed-d lbl-seed-bad", value: seed ?? false });
    seedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go.click();
      }
    });
    const seedMsg = el("p", { class: "lbl-note lbl-bad", id: "lbl-seed-bad", role: "alert", hidden: true });
    // Says why the deal number cannot be used (and marks the field), or hides the message.
    function checkSeed() {
      const why = seedProblem(seedInput.value);
      seedMsg.hidden = !why;
      seedMsg.textContent = why ?? "";
      if (why) seedInput.setAttribute("aria-invalid", "true");
      else seedInput.removeAttribute("aria-invalid");
      return !why;
    }
    seedInput.addEventListener("input", () => {
      if (!seedMsg.hidden) checkSeed();
    });
    const confirmBox = el("div", { class: "lbl-confirm", hidden: true, role: "alert" }, el("p", {}, "Leave the game in progress and deal a new one?"));
    function start() {
      if (!checkSeed()) {
        confirmBox.hidden = true;
        go.hidden = false;
        seedInput.focus();
        return;
      }
      prefs.rules = code;
      persist();
      const deal = { seed: parseSeed(seedInput.value), rules: code, tutorial: tutorialBox.checked };
      // Declined: it is not offered again (it can be asked for here, or in Help).
      if (!deal.tutorial && !seen.has(LESSONS_KEY)) {
        seen.add(LESSONS_KEY);
        persist();
      }
      d.locked = false;
      d.close();
      try {
        hooks.newGame(deal);
      } finally {
        // Nothing dealt (a fault): never leave the page with no game and no menu.
        if (!state) openNewGame({ first: true, seed: seedInput.value || null, rules: code });
      }
    }
    const go = button("Deal", () => {
      if (!checkSeed()) {
        seedInput.focus();
        return;
      }
      if (inProgress() && confirmBox.hidden) {
        confirmBox.hidden = false;
        go.hidden = true;
        yes.focus();
      } else start();
    }, "lbl-primary");
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
        el("div", { class: "lbl-opt" }, el("label", { for: "lbl-seed" }, "Deal number "), seedInput, el("p", { class: "lbl-note", id: "lbl-seed-d" }, "Leave empty for a random deal. The same number and rules always deal the same game."), seedMsg),
      );
    }
    draw();
    // The music and the aids as in Settings, here too (the same stored settings), and first: a new
    // player changes these far more often than the rules.
    // The lessons are on for a player who has not had them, and off once they have.
    const tutorialBox = el("input", { type: "checkbox", id: "lbl-n-tutorial", checked: !seen.has(LESSONS_KEY) });
    const sound = el("fieldset", { class: "lbl-set" }, el("legend", {}, "Start"),
      el("div", { class: "lbl-field" }, el("label", { for: "lbl-n-tutorial" }, tutorialBox, " Tutorial: six short lessons first")),
      check("lbl-n-music", "Music", null, "music"),
    );
    const aids = el("fieldset", { class: "lbl-set" }, el("legend", {}, "Aids"),
      check("lbl-n-hints", "Hints", "Shows the Hint button.", "hints"),
      check("lbl-n-hl", "Highlight legal targets", "Lights the places the chosen card may go.", "highlight"),
      check("lbl-n-home", "Play cards home automatically", "A card that can go home goes at once, with no click.", "autoHome"),
      check("lbl-n-moves", "Count moves", "Shows the move count.", "showMoves"),
    );
    d.body.append(sound, aids, form, confirmBox, el("div", { class: "lbl-row lbl-actions" }, go, first ? null : button("Cancel", () => d.close(), "lbl-quiet")));
    d.onclose = () => d.node.remove();
    if (seed != null) checkSeed(); // a bad number from a shared link is said, not dropped
    d.open();
  }

  // ---- state -------------------------------------------------------------------
  function applyHintsSetting() {
    bHint.hidden = !prefs.settings.hints || lessonMode;
    sMoves.node.hidden = !prefs.settings.showMoves;
    if (!prefs.settings.hints) hideHint();
  }
  const set = (btn, on) => { btn.disabled = isBusy || !on; };
  function update(next) {
    prev = state;
    state = next;
    layer.classList.remove("lbl-idle");
    const home = next.home.reduce((a, b) => a + b, 0);
    sHome.value.textContent = `${home}/52`;
    sRedeals.value.textContent = String(next.redeals_left);
    sDraw.node.hidden = next.draw === "off";
    sDraw.value.textContent = DRAW_WORDS[next.draw] ?? "";
    sMoves.value.textContent = String(next.moves);
    const playing = next.prompt === "play";
    set(bUndo, next.undoable);
    set(bHint, playing && !lessonMode);
    // In the lessons the redeal is for the redeal lesson alone.
    const redealOk = playing && next.legal.includes("redeal") && (!lessonMode || lView?.id === "redeal");
    set(bRedeal, redealOk);
    bRedeal.textContent = `Redeal (${next.redeals_left})`;
    // Lit only when it is the one thing left to do: the engine offers a redeal when no other move exists.
    const ready = redealOk;
    bRedeal.classList.toggle("lbl-ready", ready);
    bRedeal.title = ready ? "No other move is left: gather the cards and deal again" : "";
    applyHintsSetting();
    if (next.hint && prefs.settings.hints && playing && !lessonMode) {
      const t = hintText(next.hint, next);
      hintDo.textContent = t.do;
      hintWhy.textContent = t.why;
      hintBox.hidden = false;
    } else hideHint();
    end.hidden = playing || lessonMode;
    if (!playing && !lessonMode) {
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
    lNext.disabled = isBusy || !lView?.done;
    if (state) update(state);
  }

  applyHintsSetting();
  musicState(null);
  return { update: (s) => update(s), music: musicState, settings: settingsNow, busy, openMenu: (o) => openNewGame(o), showPage: (k, o) => showPage(k, o),
    lesson: showLesson,
    lessonsSeen: () => seen.has(LESSONS_KEY),
    markLessonsSeen() {
      seen.add(LESSONS_KEY);
      persist();
    },
  };
}
