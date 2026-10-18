# Page modules and who owns them

| File | Owner | Does |
|---|---|---|
| `web3d/src/engine.js` | engine agent | wasm wrapper: `new({seed, rules})`, `send(cmd)`, `state()` |
| `web3d/src/main.js`, `table.js`, `layout.js` | table agent | the three.js table, card motion, click input, wiring |
| `web3d/src/hints.js`, `tutorial.md`, `tutorial-flow.js`, `prefs.js`, `ui.js`, `ui.css`->`style.css` | ui agent | hint prose, tutorial, settings, new-game menu, HUD overlay |

## `ui.js`
`createUi(root, hooks)` -> `{ update(state), settings(), busy(bool), openMenu({seed, rules}) }`.
`hooks = { newGame({seed|null, rules}), undo(), hint(), redeal(), settingsChanged(settings) }`.
`settings()` = `{ hints: true, table: "plain", faces: "auto", autoHome: false, speed: "normal" /* or "instant" */, showMoves: true }` (superficial; saved in localStorage, always in try/catch).
**Every new game starts at the New game menu.** On load nothing is dealt: the page opens the menu (`openMenu`, built by `menu-start.js`) over an empty table, with Classic or the last game's rules selected and the deal number empty, or the `#seed=..&rules=..` of a shared deal prefilled; the player confirms with Deal. That first menu has no Cancel and Escape does not close it. The bar's and the end screen's New game open the same menu (cancellable; the abandon confirm only once play has started). Same deal again redeals at once. The tutorial begins at the first deal.
The new-game menu holds the **rules** (presets and options of RULES.md) and a deal number; settings hold only look-and-feel and aids.
`update(state)` is called after every state change; the ui shows the status line, the
hint bubble (`state.hint` composed by `hints.js`), and the tutorial page that falls due.

## `hints.js`
`hintText(hint, state)` -> `{ do: "Move the 6♥ onto the 7♥.", why: "<general principle>" }`.
Exactly two sentences, in that order: what to do here; the generalisable rule it
illustrates (no card names in the rule). Tested.

## `tutorial-flow.js`
`duePage(prevState, state, seen, options)` -> page key or null. Pages in `tutorial.md`.
Principle: say exactly what the player needs before meeting each new element, no more.

## `table.js`
`createTable(canvas, hooks)` -> `{ show(state, {instant, redeal}), highlight({select, targets, hint}), setSettings(s), onClick(cb) }`
where clicks arrive as `{ fan: i | null, home: bool, card: code | null }`.
`show` with `redeal: true` (the command was a redeal; not an undo, not at `instant` speed) plays one of the effects of `redeal-fx.js` (the setting `redealFx`: `random`, an effect, or `simple` for the plain slide), told through `hooks.busy(bool)`; the cards then lie exactly where `show` lays them. `redealClock` lets tests step it by hand.
