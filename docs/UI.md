# Page modules and who owns them

| File | Owner | Does |
|---|---|---|
| `web3d/src/engine.js` | engine agent | wasm wrapper: `new({seed, rules})`, `send(cmd)`, `state()` |
| `web3d/src/main.js`, `table.js`, `layout.js` | table agent | the three.js table, card motion, click input, wiring |
| `web3d/src/hints.js`, `tutorial.md`, `tutorial-flow.js`, `prefs.js`, `ui.js`, `ui.css`->`style.css` | ui agent | hint prose, tutorial, settings, new-game menu, HUD overlay |

## `ui.js`
`createUi(root, hooks)` -> `{ update(state), settings(), busy(bool) }`.
`hooks = { newGame({seed|null, rules}), undo(), hint(), redeal(), settingsChanged(settings) }`.
`settings()` = `{ hints: true, table: "plain", faces: "auto", autoHome: false, speed: "normal" /* or "instant" */, showMoves: true }` (superficial; saved in localStorage, always in try/catch).
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
`createTable(canvas, hooks)` -> `{ show(state, {instant}), highlight({select, targets, hint}), setSettings(s), onClick(cb) }`
where clicks arrive as `{ fan: i | null, home: bool, card: code | null }`.
