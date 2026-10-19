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
- Hints draw an animated arrow from the source card to the target (smaller and lower on a short hop to a neighbouring pile; cards in play ride above every other card, `src/motion.js`): one solid, toon-shaded, inked prism that
  casts a shadow and moves on Material 3 easing (`src/arrow.js`, `src/arrow-mesh.js`). One focus blue marks everything to
  look at or act on (lit Redeal, hint, chosen card, targets, focus); fans longer than three spread on
  hover, focus or tap. Faces: high-visibility by default, classic, or suit contrast.
- Hint prose weighs the game's central tension (`src/hints.js`): a built card can only leave by going home, so what it covers waits for its suit to go home through the run it sits on. Sentence one says what the move frees, what it freezes and for how long (or that it locks a lower card of its own suit, and whether a redeal can undo it), the plays it leaves open, and the rival build it beats; sentence two is a rule of thumb for that situation. The engine adds `hint.open` and `hint.alt`. Every clause is checked against the position over 75 hint-played games (`test/hints.test.js`). The evidence is under Status.
- Fans show every index at rest up to six cards (99% of piles in 400 simulated Classic games; 94% are four or fewer): a slot is as wide as its pile needs (strip 0.42 of a card, which keeps the 2.6 cm index whole) and a row's slots sit side by side, so the camera takes in the widest row. A longer fan is squeezed and spreads on hover. A card that only slides because a neighbouring pile grew glides flat (`src/layout.js`, `tagOf` in `src/table.js`).
- Redeal plays one of seven animations (Random by default; a Settings choice, `redealFx`), each landing
  every card exactly on the engine's layout (`src/redeal-fx.js`, from the maintainer's demo).
- Two independent code reviews (engine, page) were done; their verified findings are fixed.
- Hint play wins about 16% of Classic deals over 300 games (engine test; research/sim has the
  search lower bound of 19% and greedy 5.7%).

  Coaching evidence (descriptive; 300 hint-played Classic games, 8,788 build hints; 20,999 paired playouts of alternatives): 41% of hints cover a card wanted sooner than the pile releases; an alternative that does costs 2.7 cards home against 0.8 when neither freezes; each play an alternative closes costs about one more card; on the last deal an urgent freeze costs 3.7 against 2.6 with a redeal in hand. Per-decision outcomes are noisy (R² 1.2%), so the prose says "tends to".

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
