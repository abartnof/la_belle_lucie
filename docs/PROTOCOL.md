# Protocol (PROTOCOL = 2)

The engine holds the rules; the page draws `state` and sends commands.

## Calls (WebAssembly exports, prefix `la_belle_lucie`)
| Export | Does |
|---|---|
| `_alloc(len)` | Address of `len` writable bytes for a command. |
| `_new(seed, rules)` | New table. `rules` is the code in RULES.md. |
| `_send(len)` | Runs the command in the bytes just written; 1 if accepted. |
| `_out()`, `_out_len()` | The state, UTF-8 JSON. |

## Commands (one line)
| Command | Means |
|---|---|
| `move f3>f5` | Top card of fan 3 onto the top card of fan 5 (or into empty fan 5, king fills). |
| `move f3>h` | Top card of fan 3 to its foundation. |
| `draw f2:1>f5` / `draw f2:1>h` | Draw the card at position 1 (0 = bottom) of fan 2 and play it at once. |
| `redeal` | Gather, (shuffle,) deal again. |
| `undo` | Take back the last command (replays the record). Refused at the start. |
| `hint` | Asks for a hint; recorded nowhere; the next state carries `hint`, cleared by any other command. |

Fan numbers are slots, stable until a redeal.

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
  "onto": "6S" | null, "uncovers": "4S" | null }`. `rule` is one of `home`, `dig`, `uncover`,
  `build`, `redeal`, `draw`, `king`, `least_bad`. The engine speaks in codes, never prose.
