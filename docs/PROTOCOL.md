# Protocol

What the page (or any client) and the engine say to each other. The engine holds the
rules; the client draws `state` and sends commands.

## Calls (WebAssembly exports, prefix `la_belle_lucie`)

| Export | Does |
|---|---|
| `la_belle_lucie_alloc(len)` | Address of `len` writable bytes, for a command. Valid until the next call. |
| `la_belle_lucie_new(seed)` | Sits down at a new table (any old one is discarded). |
| `la_belle_lucie_send(len)` | Carries out the command in the bytes just written; 1 if accepted. |
| `la_belle_lucie_out()`, `la_belle_lucie_out_len()` | Address and length of the state, as UTF-8 JSON. |

## Commands (one line of text)

| Command | Means |
|---|---|
| `draw` | Take the top card of the stock into the hand. |

## State (`PROTOCOL = 1`)

```json
{ "protocol": 1, "prompt": "play", "seed": 5, "stock": 51, "hand": ["7H"], "legal": ["draw"] }
```

Cards are two-character codes: rank `A23456789TJQK`, suit `SHDC`.
The state shows a client only what that player may see: the stock is a count.
