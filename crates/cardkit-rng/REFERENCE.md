# Reference outputs for the seeded generator

The engine's generator (`crates/bezique-core/src/rng.rs`) is xoshiro256\*\*,
seeded with four outputs of SplitMix64, as their author recommends. Its tests
pin the numbers in `vectors.txt`, which come from the authors' own C code:

| File | Source | SHA-256 at retrieval (2026-10-01) |
|---|---|---|
| `splitmix64.c` | https://prng.di.unimi.it/splitmix64.c | `071795a8e29978a5cbd7015ce8f7d772e7ab4631e574e9102b748fe99105ff3d` |
| `xoshiro256starstar.c` | https://prng.di.unimi.it/xoshiro256starstar.c | `413bfcae1a0c9a0dc03f7de6c78106a67361dcce4dae15eef3195014d1dbe9ce` |
| `f2x.c` | https://prng.di.unimi.it/f2x.c (included by the above) | `62e9b22bd882c6dade29a57cabcd079abf83522218415e3e9a95a4e6086dac99` |

All three are by Sebastiano Vigna (and David Blackman for xoshiro), dedicated
to the public domain. They are kept unchanged. `vectors.c` is this project's
harness; to regenerate:

```
cc -O2 -o vectors.out vectors.c && ./vectors.out > vectors.txt && rm vectors.out
```

Nothing here is built into the game.
