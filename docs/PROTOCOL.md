# Protocol (PROTOCOL = 2)

The engine holds the rules; the page draws `state` and sends commands.

## Calls (WebAssembly exports, prefix `la_belle_lucie`)
| Export | Does |
|---|---|
| `_alloc(len)` | Address of `len` writable bytes for a command. |
| `_new(seed, rules)` | New table. `rules` is the code in RULES.md. |
| `_lesson(len, rules)` | Replaces the table with the layout game in the bytes just written; 1 if it parsed, else 0 and the old table stays. |
| `_send(len)` | Runs the command in the bytes just written; 1 if accepted. |
| `_out()`, `_out_len()` | The state, UTF-8 JSON. |

## Layout games (`_lesson`)
Text `"<fans> ; <home>"`: fans separated by `/`, cards as codes bottom to top, an empty fan `-`,
home as four counts in suit order S H D C: `6H 9C / KS 7H / - ; 0 0 0 0`. Refused if a card is
unreadable or twice, a card's rank is at or below its suit's home count, a count is over 13,
there are more than 30 fans, or the text exceeds 2000 bytes. The cards need not make up the pack
(the game is won when 52 are home). It is not a seeded deal: `seed` is 0 and `#seed=` links do not
apply. Moves, hint, undo (back to the layout) and redeal behave as usual; a redeal shuffles with
seed 0's stream. The page calls it `lesson({layout, rules})`, answering the state or null.

## Commands (one line)
| Command | Means |
|---|---|
| `move f3>f5` | Top card of fan 3 onto the top card of fan 5 (or into empty fan 5, king fills). |
| `move f3>h` | Top card of fan 3 to its foundation. |
| `draw f2:1>f5` / `draw f2:1>h` | Draw the card at position 1 (0 = bottom) of fan 2 and play it at once. |
| `redeal` | Gather, (shuffle,) deal again. |
| `undo` | Take back the last command (replays the record). Refused at the start. |
| `hint` | Asks for a hint; recorded nowhere; the next state carries `hint`, cleared by any other command. |

Fan numbers are slots (0-based: `f0` is `fans[0]`), stable until a redeal. `send` takes a move with or without the `move ` prefix.

## State
```json
{ "protocol": 2, "prompt": "play", "seed": 5, "rules": 4,
  "options": {"inorder": false, "redeals": 2, "draw": false, "king": false, "trefoil": false},
  "fans": [["7H","2S","KD"], [], ...],
  "home": [0,0,0,0],
  "redeals_left": 2, "draw": "off", "moves": 0,
  "legal": ["f3>h","f3>f5","draw f2:1>h","redeal"],
  "undoable": false,
  "hint": null }
```
- `fans`: each bottom to top; `[]` is an empty slot. Cards are `A23456789TJQK` + `SHDC`.
- `home`: cards on the foundations in suit order S, H, D, C (count = highest rank home).
- `prompt`: `play`, `won`, `lost`.
- `draw`: `off` (option off), `later` (on, redeals remain), `ready`, `used`.
- `legal`: exactly the strings `send` accepts (without the `move ` prefix for moves,
  `draw ...` with it; `redeal`). `undo` and `hint` are always allowed and not listed.
- `hint`: `{ "rule": id, "move": "f3>h" | "f3>f5" | "draw f2:1>f5" | "redeal", "card": "5S",
  "onto": "6S" | null, "uncovers": "4S" | null, "open": 3, "alt": null | { "move": "f1>f4", "card": "9C",
  "onto": "TC", "uncovers": "2H" | null, "open": 2 } }`. `rule` is one of `home`, `dig`, `uncover`,
  `build`, `redeal`, `draw`, `king`, `least_bad`. For `redeal`, `card`, `onto` and `uncovers` are null; `onto` is null
  for a move home or a king into an empty fan; `uncovers` is null for a draw. A king into an empty fan is `king` (or `dig`). `open` is how many plays (a redeal aside) are open after the hint's move (0 for a redeal); `alt` is, for a hinted build, the other build that leaves the most plays open (ties: one that frees a card, then the lowest fan), else null. The page works out what a move freezes from `fans` and `home`. The engine speaks in codes, never prose.
