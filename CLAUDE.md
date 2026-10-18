# Working on this repository

La Belle Lucie, as a Rust engine compiled to WebAssembly, a terminal client, and one
offline web page. Start with `PLAN.md` (where things stand), then `docs/RULES.md`
(the rules, once settled) and `docs/PROTOCOL.md` (what the page and the engine say
to each other).

Started from the card toolkit's template; `kit/STAMP` says which toolkit commit.

Standing rules:

- **Test-driven.** Write the test, watch it fail, then make it pass.
- **Atomic commits, often**: one logical change each, with `PLAN.md` kept current as
  work lands.
- **The gate before every commit**: `bin/gate || exit 1` and then `git commit ...`.
  It runs `cargo fmt --check`, `clippy -D warnings` and `cargo test`, builds the wasm,
  runs the Node tests, and checks that the committed page is built from the current
  sources (rebuild with `python3 kit/build.py` and commit it with any engine or table
  change). It prints one line. **Never pipe it** (`bin/gate | tail` reports tail's
  status, not the gate's). Needs `npm ci` in `web3d/` first.
  The gate opens no browser: before committing a change to the page, also run
  `~/piquet/.venv/bin/python web3d/test/browser.py` (Playwright and the system Chromium;
  checks no network, no console error, and that clicking plays).
- **The engine holds the rules; clients hold none.** The page draws `state` and sends
  commands; what may be played is `state.legal`. The engine speaks in codes, never prose.
- **A seed and the commands fix a game.** Everything random comes from one seed through
  `cardkit_rng::Rng::stream(seed, purpose)`, one stream per purpose, so how much an
  agent thinks never changes the cards. Never renumber a published purpose.
- **Simulations stop when the signal is clear.** Fix the comparison, a floor and a
  ceiling on the number of resamples, the batch size and an O'Brien-Fleming boundary
  before the first batch. Run in batches, look between them, and stop when the effect
  crosses the boundary or is plainly too small to matter, never before the floor. Never
  peek with an unadjusted p < 0.05. Always mirrored pairs (each deal played twice, seats
  swapped). Report the floor, the ceiling, the number used and the interval at the last
  look.
- **Review before a long run**: a code review of what the run depends on comes first.
- **Documents are public-facing and terse**: decisions, evidence, what follows. The
  person who commissioned the game is "the maintainer", never named.
- **Consult the user before anything that spends money** or any long compute run, with
  an estimate in hand.
- **Every third-party asset is recorded in `CREDITS.md` in the commit that adds it.**
