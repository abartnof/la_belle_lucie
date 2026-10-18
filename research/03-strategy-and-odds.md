# 03 - Strategy and odds

## A. Literature: rules as printed, strategy advice, published odds

**Rules as printed (primary).**
- Cadogan (1870) is the earliest English text found. Rules: "The uppermost card of each packet is alone available, until by its removal it releases the one beneath", and "The foundations must follow suit". Deal "in packets of three cards dealt together"; the last packet "will contain but one card". [S1]
- Cadogan's building rule: "forming marriages in a descending line on the tableau". Her warning: "great care is requisite, lest in releasing one card another still more necessary to success should be blocked". [S1]
- Cadogan's redeal rule: "the entire tableau may be taken up, shuffled and re-dealt (if necessary twice), then played again as before". So the primary source says SHUFFLED, two redeals. [S1]
- Cadogan's glossary entry "Re-deals" adds: "These are always in addition to the original deal." [S1]
- Cavendish (De La Rue, 1890) calls the game "The Fan". It has 17 "depots" of three plus one single card. Top card to foundation if in suit and ascending. Top card onto another depot's top card if in suit and descending. [S2]
- Cavendish's key difference: a king may be moved into a space left by an emptied depot, "Only one deal is allowed", and "This patience, with careful play, is slightly against the player". [S2]
- Cavendish's variation: "Some players do not permit kings to be moved to spaces. In that case, three deals are allowed. After each deal, the untaken cards are shuffled and redealt in packets of three." [S2]
- Cavendish's hint, the only period strategy rule found: "A card should never be moved on another which has a lower card of a suit in the same depot. For instance: In the Example, if ten of diamonds is moved on the knave, the patience is blocked." He also says foundation-eligible cards "should be taken at once". [S2]
- The "gather in order and re-deal without shuffling" rule given in the task is NOT in Cadogan or Cavendish. Both say shuffle. I did not find a source for it. I saw one wording only on the current Wikipedia page, which says "reshuffled" and repeats "two reshuffles" in its own rule list. [pointer only, not cited as fact] The no-shuffle rule appears to be a misreading, so I tested it as a counterfactual. [S1][S2]
- Modern web pages agree on shuffle: Semicolon says "scoop up all the tableau cards, shuffle them, and again lay them out in piles of three", repeatable twice. [S5] online-solitaire.com says "gathered up, reshuffled", twice. [S4]

**Strategy advice (modern, secondary).**
- Wikibooks gives a strategy section. Its main points: think before moving, because cards can only move once. Safe builds are onto a single-card fan, onto a king, or onto a same-suit run. Foundation moves are always safe. Check whether the target card can itself move first. [S6] The Wikibooks text is itself uncited. It is a pointer, not authority.
- Semicolon's hint is the same as Cavendish's: don't build a 7 on an 8 when a 6 of that suit lies beneath it. Expect to use the "single draw" near the end. [S5]
- Not obtained: Morehead & Mott-Smith, Dalton, Bergholt, Parlett. Morehead's Complete Book is lending-only at archive.org, and the full-text download returned 401 (Dalton, Bergholt 1953, Morehead 1971). The 1917 Bergholt "Second New Book" text has no Lucie/fan entry. Dick's *Games of Patience* (date not checked) lists "La Belle Lucie ... 59" only in its table of contents; the OCR body has no entry. [S3] Morehead's book is advertised as giving "odds for winning" per game but I could not read its figure. [UNVERIFIED]

**Published win rates, each followed to its source.**
- "~8%" (classicklondikesolitaire.com): "The hardest fan solitaire at ~8% win rate". No source or method is given. [S7]
- "close to 40% for a careful player" (online-solitaire.com): no source or method is given. The page cites Cadogan only for history. [S4]
- A search-result snippet attributes "about 40% without the draw, about 60% with a draw" to Goodsol's promotional page. The page returned 403, so I did not read it. Treat as second-hand and [UNVERIFIED]. Goodsol's page, per that snippet, says Parlett allows no draw and Morehead & Mott-Smith allow one on the last deal. [snippet, no fetch] [UNVERIFIED]
- Wikipedia/Wikibooks: "For each king left in the second redeal, there is a 66% chance that the cascade cannot be solved". Not a win rate, and no source given. [S6]
- No academic or solver study of La Belle Lucie was found. I did find a solver study of the related game Cruel at politaire.com in a search snippet only. It is not La Belle Lucie and I did not read it. [UNVERIFIED]
- Conclusion: every published figure is unsourced. None comes from a solver. The ORIGINAL COMPUTATION below is the only measurement.

## B. ORIGINAL COMPUTATION (research/sim/lbl.c, verify.py, results.txt)

**Rules implemented.**
- 52 cards, shuffled uniformly (splitmix64, fixed seeds). Dealt as 17 fans of 3 plus 1 single. All face up. Only top cards are playable. [S1][S2]
- Top card goes to a foundation if same suit and next rank, aces first, up to king. [S1][S2]
- Top card goes onto another fan's top card if same suit and exactly one rank lower. [S1][S2]
- Empty fans are never refilled, with no kings-to-space. This is the Cadogan/Wikipedia-style rule. Cavendish's one-deal king-to-space rule was NOT tested.
- Foundation moves are made automatically. This is lossless: any lower card of that suit is already on the foundation.
- A redeal is allowed only when no move remains ("strict" mode). Up to 2 redeals, so 3 deals in all. A relaxed run (RELAX=1) lets the solver redeal voluntarily and was tested once.
- Redeal modes: **shuffle** (Cadogan, Cavendish; the primary-source rule); **gather** (fans picked up left to right, each bottom to top, re-dealt in threes, no shuffle; my own convention); **gatherrev** (same, stack reversed first). The two gather conventions were unsourced counterfactuals.
- Solvers: greedy takes the best-scored legal move, with a score that avoids burying a lower same-suit card and prefers freeing foundation-ready cards. The search solver is depth-first with a transposition table, node cap 200,000 per deal, and move ordering by the same score. For gather modes it searches through the redeals, since the redeal is deterministic. For shuffle mode it cannot plan the future shuffle, so it picks the dead-end layout with the most foundation cards in each phase. That makes it a lower bound, not the optimum.
- "lost, cap hit" counts deals where the cap ended the search, so the win rate is a lower bound. All other losses are proved: search was exhausted.
- Validation: `TRACE=300 lbl gather dfs 300 7 ...` printed 274 winning move lists. verify.py is an independent re-implementation of the deal and rules. It replayed all 274 and confirmed legality, that no move remained at each redeal, and that all 52 cards reached the foundations (274 verified, 0 failed).

**Results (10,000 deals each, seed 1 unless noted).**

| Redeal rule | Solver | 0 redeals | 1 redeal | 2 redeals |
|---|---|---|---|---|
| shuffle (primary-source rule) | greedy | 0.45% | 2.17% | 5.72% |
| shuffle | search, per-phase best layout (lower bound) | 4.24% | 10.39% | 19.06% |
| gather (counterfactual) | greedy | 0.45% | 3.62% | 10.01% |
| gather | search | 4.24% | 60.51% | 87.43% |
| gatherrev (counterfactual) | greedy | 0.45% | 2.63% | 11.94% |
| gatherrev | search | 4.24% | 42.05% | 90.95% |

- The 0-redeal deal-and-play rate is the same for every mode because the first deal is the same. The 4.24% is a lower bound: 533 deals hit the cap.
- Cap check: with a 2,000,000-node cap the gather/2-redeal rate is 87.48% against 87.43% at 200,000. Only 1 deal remained undecided. Seed 2 gives 87.42%.
- Relaxed (voluntary redeal) gather search: 89.70%, with 1,029 deals capped, so it is only a lower bound.
- Greedy with seed 2 gave 0.67% / 3.98% / 10.13% (gather), 11.67% (gatherrev) and 5.87% (shuffle) at 2 redeals, so the greedy numbers are stable to about 0.5 points.

**What the numbers say.**
- With the primary-source shuffle rule and a simple greedy heuristic, about 5.7% of deals win. That is the same order as the unsourced "~8%" claim. [S7] The measured search lower bound is about 19%. So the real shuffle rate for a perfect player is somewhere above 19%, and probably well above. I could not bound it from above. The unsourced "~40%" for a careful human is consistent with this. [S4]
- If redeals did NOT shuffle, a perfect-information player would win about 87-91% of deals, because the redeal can be planned. Most of that comes from the second redeal. So the shuffle is what makes the game hard, and a no-shuffle redeal would make it a planning puzzle.
- Move order matters: even in a single deal, search wins 4.24% against greedy's 0.45%. Building a card onto its parent and moving the parent elsewhere are mutually exclusive, so the game is not confluent.

## C. Implications for the game design
- Deal guarantee: the game is hard enough at 2 shuffled redeals (greedy ~6%) that fully random deals will feel unfair. An optional "winnable deal" mode could use a solver at deal time. Under shuffle the future redeal is random, so a guarantee needs either a seeded redeal (deterministic, tested) or a single-phase solvability check. Seeded redeals make a guarantee checkable; I measured no-shuffle rates only as a counterfactual.
- Offer the rule choice explicitly in the rules screen: shuffle (historical, [S1][S2]), no-shuffle, and Cavendish-style one deal with king-to-space [S2]. Label the default with its source.
- Hints: the dominant mistake is burying a lower same-suit card, which Cavendish and Semicolon both warn against. [S2][S5] A hint system can flag it at move time ("this blocks the 6 under it") without solving. A full hint needs search; the solver above shows 200k nodes per deal is enough in nearly all cases.
- Undo: since moves are irreversible puzzles and the whole layout is visible, unlimited undo is cheap and removes the "one blocking move" punishment. Decide whether undo across a redeal is allowed. With shuffle it would let a player re-roll the shuffle, so undo should stop at the redeal, or the shuffle should be seeded so a re-roll gives the same result.
- Show a "stuck" detector: strict redeal-only-when-stuck is simple to test. Decide whether voluntary early redeal is allowed. Cadogan's wording ("taken up ... if necessary") implies only when needed. [S1]

## Open questions
1. What do Morehead & Mott-Smith, Dalton, Bergholt and Parlett actually say about the redeal (shuffle or not, and the "draw")? And what odds does Morehead print? Not obtained.
2. Where does the "gather in order, no shuffle" rule come from? Cadogan, Cavendish and every web page say shuffle.
3. What is the true shuffle-rule win rate under optimal play? My search only gives a lower bound (19%).
4. What was the Cavendish one-deal king-to-space rate? Not simulated.
5. Goodsol's page (403) and the Cruel solver study were not read.

## Sources
- S1. Lady Adelaide Cadogan, *Illustrated Games of Solitaire or Patience*, 1870. Gutenberg #21642, https://gutenberg.org/cache/epub/21642/pg21642.txt. "La Belle Lucie" entry (lines 158-190 of the local file) and "Re-deals" note (line 148). Local: research/sources/03/cadogan.txt.
- S2. "Cavendish", *Patience Games with Examples Played Through*, Thos. De La Rue, 1890. https://archive.org/details/patiencegameswit0000cave. "The Fan" (lines about 9065-9145 of the OCR file). [OCR] Local: research/sources/03/patiencegameswit0000cave.txt.
- S3. Dick's *Games of Patience*, Dick & Fitzgerald, https://archive.org/details/dicksgamespatie00unkngoog (table of contents only, line 6510); Bergholt, *A Second New Book of Patience Games*, 1917, https://archive.org/details/asecondnewbookp00berggoog (no Lucie hit); Jones, *Games of Patience, second series*, 1898, https://archive.org/details/gamesofpatiencef00joneiala (no hit). [OCR] Local: research/sources/03/.
- S4. online-solitaire.com, La Belle Lucie page, https://online-solitaire.com/la-belle-lucie-solitaire, fetched 2026-10-18. Secondary, unsourced.
- S5. Semicolon Software, "Rules for La Belle Lucie", https://semicolon.com/Solitaire/Rules/LaBelleLucie.html, fetched 2026-10-18. Secondary.
- S6. Wikibooks, "Solitaire card games/La Belle Lucie", https://en.wikibooks.org/wiki/Solitaire_card_games/La_Belle_Lucie, fetched 2026-10-18. Pointer; its bibliography lists only Rigal, *Card Games for Dummies*.
- S7. classicklondikesolitaire.com, La Belle Lucie page, https://classicklondikesolitaire.com/la-belle-lucie-solitaire, fetched 2026-10-18. Secondary, unsourced.
- Code: research/sim/lbl.c (build `gcc -O2 lbl.c`; usage in the file header), research/sim/verify.py, research/sim/results.txt.
