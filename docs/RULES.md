# Rules

Sources are the research notes in `research/` (`[02 §n]` = note 02). The sources
disagree in places; the choices below are the engine's. Presets name the book they follow.

## The game
One 52-card pack, shuffled, dealt face up in fans (packets) of three, the last card alone:
17 fans of three and one of one. [02 §2] Only the top card of a fan can be played.

## Moves
1. **Home.** An ace goes to the foundation of its suit; then 2, 3, ... up to the king, in
   suit. [02 §2]
2. **Build.** A top card goes onto another fan's top card of the *same suit* and *one rank
   higher* (a 6♥ onto a 7♥). One card at a time. [02 §2 (Dick Rule III, Cavendish, Morehead)]
3. **Empty fans** stay empty. [Morehead, 02 §2] Option **king fills**: a king may move into
   an empty fan (Cavendish "The Fan"). A lone card is never moved into an empty fan (no
   change would result).
4. **Redeal**, only when no other move exists ("when all available cards have been
   played", Cadogan). All cards not at home are gathered (fans left to right, each fan
   bottom to top), shuffled (default) and dealt again in threes; the remainder (1 or 2)
   forms a short last fan. Fans are renumbered; empty fans vanish. Default two redeals
   (three deals in all). Option **in order**: no shuffle (Dick's note, Hoffmann's Trefoil).
   The deal reads the gathered cards in order, three at a time, the first of each three at the
   bottom of its fan. (Sources are silent on the order; this is the engine's choice.)
5. **Draw** (option; Dick, Morehead). Once, on the last deal (no redeals left): a buried
   (not top) card may be drawn out of any fan, but only to be played at once: home, or onto
   a legal top card (or an empty fan with king fills).
6. **Won** when all 52 cards are home. **Lost** when no move, redeal or draw remains.

## Rules code (u32, `new(seed, rules)`)
bit 0 in order (no shuffle) | bits 1-2 redeals 0..2 | bit 3 draw | bit 4 king fills |
bit 5 Trefoil (aces pre-placed home, 16 fans of three).

| Preset | Code | Source |
|---|---|---|
| Classic | 4 | Cadogan 1874/1887; Morehead 1949 |
| With the draw | 12 | Dick 1884; Morehead 1949 |
| The Fan | 16 | Cavendish 1890 (king fills, one deal) |
| Trefoil | 37 | Hoffmann 1892 (aces out, redeals in order) |

## Randomness
Seed streams: `DEALS = 0` (first shuffle); redeal k (1-based) shuffles with stream `k`
(purpose = k). Never renumber. Undo replays the record, so a redeal after undo is the same
shuffle of whatever cards are gathered.
