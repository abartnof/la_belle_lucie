# Plan

Where things stand. Keep this current as work lands.

## Status

- Rules settled in `docs/RULES.md` from the literature review (`docs/la-belle-lucie-lit-review.md`,
  notes in `research/`). Protocol v2 in `docs/PROTOCOL.md`.
- Engine (Rust core, wasm, CLI): rules, four presets and their options, seeded redeals, undo by
  replay, and a hint solver that tags each hint with the rule it illustrates.
- Page: three.js table (landscape and portrait layouts), click, double-click and keyboard play,
  tutorial (three pages before the first move, others just in time), two-sentence hints,
  settings (look and aids) and a new-game menu (rules, with sources, and a deal number).
- `web3d/test/ui.browser.py` tests the UI in Chromium (tutorial, settings, new game, hints, undo/redeal, help, focus, reduced motion); Trefoil's pre-placed aces are on the foundations page.
- New games always start at the New game menu: the page deals nothing on load (a hash only prefills the menu).
- Hints draw an animated arrow from the source card to the target. One focus blue marks everything to
  look at or act on (lit Redeal, hint, chosen card, targets, focus); fans longer than three spread on
  hover, focus or tap. Faces: high-visibility by default, classic, or suit contrast.
- Redeal plays one of seven animations (Random by default; a Settings choice, `redealFx`), each landing
  every card exactly on the engine's layout (`src/redeal-fx.js`, from the maintainer's demo).
- Two independent code reviews (engine, page) were done; their verified findings are fixed.
- Hint play wins about 16% of Classic deals over 300 games (engine test; research/sim has the
  search lower bound of 19% and greedy 5.7%).

## Next

1. Play-test on desktop; then port to the phone (tune fan offsets for long runs on a small screen).
2. Look at the effects on real hardware: high-flying cards look large near the camera; the gravity-well
   light is faint. Card bending from the demo was skipped (the ink hull would need it too).
3. Known, left alone: a hint can differ slightly from a fresh replay of the same record (the cached
   plan); `state.rules` echoes the normalised code (6 reads back as 4).
4. Optional: a "winnable deals" mode (needs a solver at deal time; see lit review §7).

## Decided

- Redeal only when no other move exists; two redeals; shuffle by default (Cadogan, Dick, Morehead).
- Empty fans stay empty unless "king fills" (Cavendish). The draw is once, on the last deal.
- Settings hold look-and-feel and aids; rule changes live in the new-game menu only. The aids (hints, highlight,
  auto-home, move count) also appear in the new-game menu, as the same stored settings.
