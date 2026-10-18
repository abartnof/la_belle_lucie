# Plan

Where things stand. Keep this current as work lands.

## Status

- Started from the card toolkit's template (see `kit/STAMP`). The engine is a
  placeholder: a shuffled pack and `draw`.

## Next

1. Settle the rules in `docs/RULES.md` (cite sources; worked examples become test
   fixtures).
2. Replace `crates/la-belle-lucie-core/src/cards.rs` if the pack is not plain 52 cards, and
   `game.rs` with the real rules. Keep the shape: seed, command with a text form,
   `apply` returning `Result`, `legal`.
3. Grow `docs/PROTOCOL.md` with the state; bump `PROTOCOL` when its shape changes.
4. Build the table: wire the kit's scene, deck and director in `web3d/src/main.js`
   with a `choreography.js` of this game's own.

## Decided

(nothing yet)
