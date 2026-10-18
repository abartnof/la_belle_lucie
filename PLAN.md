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
- Hint play wins about 16% of Classic deals over 300 games (engine test; research/sim has the
  search lower bound of 19% and greedy 5.7%).

## Next

1. Play-test on desktop; then port to the phone (tune fan offsets for long runs on a small screen).
2. Wire `ui.busy()` (never called).
3. Optional: a "winnable deals" mode (needs a solver at deal time; see lit review §7).

## Decided

- Redeal only when no other move exists; two redeals; shuffle by default (Cadogan, Dick, Morehead).
- Empty fans stay empty unless "king fills" (Cavendish). The draw is once, on the last deal.
- Settings hold look-and-feel and aids; rule changes live in the new-game menu only.
