# La Belle Lucie

(One paragraph: what the game is, and where to play it.)

```
cargo run -p la-belle-lucie-cli -- --seed 7        # in a terminal
cd web3d && npm ci && cd .. && python3 kit/build.py    # builds web3d/la-belle-lucie.html
bin/gate                                      # before every commit
```

Started from the card toolkit's template. `kit/` is the toolkit's table and page builder,
vendored (see `kit/STAMP`); `crates/cardkit-rng` is its seeded generator.
