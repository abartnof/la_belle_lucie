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
**Every new game starts at the New game menu.** On load nothing is dealt: the page opens the menu (`openMenu`, built by `menu-start.js`) over an empty table, with Classic or the last game's rules selected and the deal number empty, or the `#seed=..&rules=..` of a shared deal prefilled; the player confirms with Deal. That first menu has no Cancel and Escape, a click outside or any other route never closes it for good (if it closes, it opens again). A deal number that is not a whole number from 0 to 4294967295 is refused with a message in the menu, never turned into a random deal; the rules code is normalised as the engine reads it (a redeal count above 2 means 2) before the menu shows or saves it. The bar's and the end screen's New game open the same menu (cancellable; the abandon confirm only once play has started). Same deal again redeals at once. The lessons begin at the first deal.
The new-game menu holds the **rules** (presets and options of RULES.md) and a deal number; settings hold only look-and-feel and aids.
`update(state)` is called after every state change; the ui shows the status line, the
hint bubble (`state.hint` composed by `hints.js`), and the tutorial page that falls due.

## `hints.js`
`hintText(hint, state)` -> `{ do: "Move the 6♥ onto the 7♥.", why: "<general principle>" }`.
Exactly two sentences, in that order: what to do here; the generalisable rule it
illustrates (no card names in the rule). Tested.

## The lessons (`lessons.js`, `lesson-run.js`)
The tutorial is six short moments of play on the real table, not text pages: Build, Home, Only the top card moves, Redeal, Win, and the check. Each is a layout started with `engine.lesson({layout, rules: 4})`; a step is data (layout, words, the moves the arrow shows, `done(state)`, and for the check a `reaction(state)` when the costly build is made). Legal moves still come from `state.legal`; the page holds no rule.
A card panel at the right (above the bar below 760 px) says what is going on in one or two sentences, with "n of 6", a text "Skip tutorial" and a filled "Next" that is disabled until the step is done. The table is framed beside it (`margins.right`, or `margins.bottom` when narrow). The hint arrow and blue outlines show the move; the Redeal lesson rings the lit button. Hints and the end screen are off during the lessons; Undo, Settings and the HUD work. Screen readers hear each step and its result.
They start at the first deal of a player whose prefs `seen` lacks "lessons". When they end (last Next, or Skip) the real game of the menu's seed and rules is dealt fresh at move 0 and "lessons" is kept. New game from the bar mid-lessons leaves them unfinished. Help's "Play the lessons again" starts them over the table; mid-game it asks first ("the lessons end with this deal dealt afresh"): a game in progress is not kept.

## `tutorial-flow.js`
`duePage(prevState, state, seen, options)` -> page key or null. Text pages in `tutorial.md` remain only for the options, just in time: `draw` (when it is ready) and `king` (when a fan empties and kings fill).

## `table.js`
`createTable(canvas, hooks)` (`hooks.margins()` gives `{top, bottom, side, left, right}`, left and right defaulting to side) -> `{ show(state, {instant, redeal}), highlight({select, targets, hint}), setSettings(s), onClick(cb) }`
where clicks arrive as `{ fan: i | null, home: bool, card: code | null }`.
`show` with `redeal: true` (the command was a redeal; not an undo, not at `instant` speed) plays one of the effects of `redeal-fx.js` (the setting `redealFx`: `random`, an effect, or `simple` for the plain slide), told through `hooks.busy(bool)`; the cards then lie exactly where `show` lays them. `redealClock` lets tests step it by hand.

Keyboard (on the canvas): arrows move between fans, F the foundations, Enter chooses a top card or plays the chosen card to the fan, H sends it home, Escape clears. With the draw ready, D chooses the first buried card of the focused fan that the draw may take (D again, the next; the live region names it and where it can go); Enter on the target fan or H (home) plays it.
Escape on a text page dismisses it ("Got it" does too; Help has both pages). Focus returns to the control that opened a dialog, or to the table if that is gone. A command or click that arrives while a redeal effect plays is dropped and announced ("Wait for the cards to settle."); the effect always ends (a fault in a frame or `FX_MS` plus a grace of wall time snaps the cards to their poses).
