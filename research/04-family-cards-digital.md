# 04 Family, cards, digital implementations

Scope: related patiences, physical presentation and period vocabulary, digital implementations, cultural references. Every factual sentence carries a source tag. Wikipedia was used only as a pointer to find sources and is never cited.

## (a) The family of related patiences

Period sources

- Cadogan, La Belle Lucie: one 52-card pack. The tableau is packets of three cards "dealt together", with the last packet holding one card. Only the top card of each packet is available. Foundations are the four aces, built up by suit to the king. Cards are built on the tableau "by forming marriages in a descending line". Where the book defines marriage, it means same-suit cards only. The tableau may be taken up, shuffled and re-dealt "(if necessary twice)". [S1][S2]
- The same Cadogan entry says two packs with eight aces make "THE HOUSE IN THE WOOD". A second two-pack form, with foundations of four aces and four kings and marriages built both up and down, is "THE HOUSE ON THE HILL". [S1][S2]
- Cavendish (1890) has no game titled La Belle Lucie in the OCR I searched. His equivalent is "THE FAN" (Diagram XXXVI, a one-pack game):
  - Deal in packets of three face up to form "seventeen depôts", with one card over that gets its own depot. [S3]
  - Aces go to the foundations. A top card may move onto another depot's top card if it is in descending sequence and in suit. [S3]
  - A king may go into a vacant space. Only one deal is allowed. [S3]
  - A variation: "Some players do not permit kings to be moved to spaces. In that case, three deals are allowed", with the untaken cards shuffled and redealt in threes. [S3]
  - His hint: never move a card onto another that has a lower card of the same suit in the same depot. [S3]
  - Cavendish says the variations are numerous because fan patiences were played "independently of each other, and without any recognised rules". [S3]
- Cavendish "THE THREE-CARD FAN" (Diagram XXVII). Kings are placed at the bottom of each depot as the deal falls. Top cards move between depots irrespective of suit. No depot may hold more than three cards. This matches PySolFC's Shamrocks and Shamrocks II. [S3][S6]
- Dick's 1898 copy has "THE FAN", but it is a different game. It uses two packs, a 12-card fan, a reserve packet and auxiliary cards. [S4] The same copy's contents list shows "LA BELLE LUCIE One Pack 59" and "THE SHAMROCKS One Pack 60". The body text I fetched has no entry under either heading, so I cannot quote Dick's rules for them. [S4] [OCR]
- Mary Whitmore Jones (1898) advertises "Fair Lucy" in the contents of Series I, a title that PySolFC lists as an alias. I did not read that series. [S5][S6]
- Not found in the texts I searched: Trefoil, Clover Leaf, Alexander the Great, Alexandra, Midnight Oil. I found no period source for them. [S1][S3][S4][S5]
- The brief's name "Alexandra" does not appear in Cadogan, Cavendish or Dick (grep of the saved texts). [S1][S3][S4]

Modern catalogue relationships (PySolFC rule pages and `fan.py`; PySolFC is a modern implementation, not a period source)

| Game | Relationship to La Belle Lucie | Source |
|---|---|---|
| La Belle Lucie | 18 piles, build down by suit, one card at a time, empty piles not filled, 2 redeals by shuffling the whole tableau; "also known ... Clover Leaf and Midnight Oil" per the rule page; code altnames "Fair Lucy", "Midnight Oil", "Lovely Lucy", "Beautiful Lutecia" | [S6][S7] |
| Fan | Same deal; empty piles refillable by a King only; no redeal | [S6] |
| Trefoil | "Like La Belle Lucie, but 16 piles, and the Aces are moved to the foundations at game start"; 2 redeals | [S6][S7] |
| Three Shuffles and a Draw | As La Belle Lucie plus one draw of any buried card, done by moving the top card of a fan to the Draw pile | [S6][S7] |
| Shamrocks | 18 piles build up or down regardless of suit; max 3 cards per pile; empty piles not filled; no redeal | [S6] |
| Shamrocks II | Shamrocks with kings always dealt to the bottom of each pile | [S6] |
| Clover Leaf | Black aces and red kings go to the foundations at the start; 16 piles of three; build up or down by suit; ace or king fills an empty pile; red foundations built down, black up; no redeal | [S6] |
| Alexander the Great | Clover Leaf with twelve piles of four | [S6] |
| Intelligence | 2 decks; 18 piles of three with aces dealt to foundations; empty piles refilled from the talon; 2 redeals | [S6] |
| Super Flower Garden | Subclass of La Belle Lucie that builds by rank rather than suit | [S7] |

- PySolFC's naming of Clover Leaf and Alexander the Great differs from the common Wikipedia-style summaries that treat "Clover Leaves" as a La Belle Lucie alias. The PySolFC rule page says both things, and the code registers Clover Leaf as a separate game. [S6][S7]
- In PySolFC the whole family shares the `Fan` base class, with game type `GT_FAN_TYPE`. [S7]
- "Pyramid-type" patiences: Cadogan's "pyramid" is a different game, where the foundations are formed in a pyramid. I found no verified link to the fan family. [S1]

## (b) Physical presentation and period vocabulary

- The deck is the "one entire pack of cards", and 17 packets of three plus 1 single card use all 52. [S1]
- Cadogan's figure for La Belle Lucie shows the packets fanned in overlapping rows, with four empty card outlines in a row at the bottom for the foundations. The figure is the frontispiece image `001.jpg` in the Gutenberg HTML, and the saved copy is `cadogan_fig_belle_lucie.jpg`. [S1][S8]
- The book's explanation of tableaux says "The blank spaces show where the foundation cards should be played during the deal". [S1]
- The 1887 print says "placed as in tableau". [S2]
- Vocabulary in Cadogan's own glossary: available, released, suitable and foundation cards, marriage, sequence, lane (an empty space left by a removed row), talon, "to play cards", "Re-deals ... always in addition to the original deal". [S1]
- The glossary defines a marriage as same-suit adjacent cards. [S1]
- Cavendish says "depôts" for packets, "foundations", "space", "taken" and "moved", and "The Fan" for the game; "a card on the top of a depot ... should be taken at once". [S3]
- Dick uses "families" (built on foundations), "released card" and "auxiliary cards" for his own games. [S4]
- Wikipedia's pointer says the original packets were "fans"; I could not find Cadogan describing them as fans for this game. Cadogan uses "fan shape" only for Napoleon at St. Helena. [S1]
- The phrases "gather" and "shuffle and patch": no hit in Cadogan or Cavendish. I did not find a source for them. [UNVERIFIED]
- French and German texts for the period terms: not found. Searches returned only English-language pages. [UNVERIFIED]

## (c) Digital implementations

- PySolFC (GitHub `shlomif/PySolFC`, Python/Tkinter) implements La Belle Lucie as `LaBelleLucie(Fan)`, with a talon limited to `max_rounds=3` (the initial deal plus 2 redeals). [S7]
  - Redeal step: all row cards go to the talon, are shuffled, and are dealt three to a row, with the remainder on the last row. [S7]
  - Foundations are by suit (`SS_FoundationStack`). Row stacks build same-suit down, `max_move=1` and `max_accept=1`. [S7]
  - The layout is rows of (5, 5, 5, 3) stacks, with the talon at the bottom right. Card offset is horizontal, so it plays as a fan. [S7]
- PySolFC UI features, documented in its help pages:
  - Undo/redo is unlimited, and undoing all moves means the game is not scored. [S9]
  - Hints exist; consuming one marks the game lost unless "Free Hints" is on. [S9][S10]
  - Bookmarks (up to nine), auto drop, highlight piles, find card, and a demo autopilot. [S9]
  - Mouse and keyboard play, with the keys A, S, D and R documented. [S10]
  - Scoring is win/loss statistics, with a "perfect game" award for no assists. There is no numeric score. [S9][S10]
  - PySolFC's hint code for the Fan family is `CautiousDefaultHint`, with a FIXME saying "demo is not too clever in this game". [S7]
- Aisleriot (GNOME) has no La Belle Lucie, Fan, Trefoil, Clover Leaf or Alexandra. Its `games/meson.build` and the repository tree list no such file (92 `.scm` entries). I checked only the GitHub mirror `GNOME/aisleriot` master. [S11] The brief's assumption is wrong on this point.
- Microsoft Solitaire Collection (official store listing) lists Klondike, TriPeaks, Pyramid, Spider and FreeCell, and no fan games. [S12]
- A separate Windows app, "La Belle Lucie" by ALGOTECH SOFTWARE, is on the Microsoft Store. Its listing says 5 variations, namely La Belle Lucie, The Fan, Three Shuffles and a Draw, Super Flower Garden and Trefoil; 18 fans (17 of three, one single card); Trefoil has 16 fans; "Only top card from a fan can be played". [S13]
- Redeal limits across implementations: PySolFC 2 redeals (3 rounds) [S7], versus Cadogan "twice" [S1] and Cavendish "three deals" only in the no-king-move variant [S3].
- Not verified: Solitaire Bliss, Pretty Good Solitaire, Hoyle titles. A search surfaced Tom's Pretty Good Solitaire v1.1 and Sierra Hoyle's Book of Games Vol 2 on archive.org, but I did not open them. [UNVERIFIED]
- A Chrome Web Store extension named "La Belle Lucie" exists, but I did not read its page. [UNVERIFIED]
- catsatcards.com blocked automated access (mod_security), so I did not use it.

## (d) Art, music and cultural references

- Nothing verified. The searches for "Lucie" turned up only name-etymology and unrelated pages. I found no source tying the game's name to a person, painting, song or story. [UNVERIFIED]
- The word "Lucie" is French. PySolFC lists the alias "Beautiful Lutecia", which I can only report as listed, with no explanation. [S6][S7]
- The Wikipedia pointer says the game was "first published in the English language by Lady Adelaide Cadogan in 1870". I could not confirm that date in a fetched primary source. The earliest dated copy I have is 1887 (archive.org scan), with a Gutenberg revised edition from 1914. [UNVERIFIED] [S1][S2]

## Open questions

1. What is the earliest dated printing of La Belle Lucie, and in which language? The Cadogan first edition (1870 or 1874) is not yet read.
2. Does Dick's 1884 edition contain a La Belle Lucie entry? The 1898 OCR contents list names it, but the body text I fetched does not.
3. Is there a French source such as a Larousse or a late 19th-century "réussites" book that names "La Belle Lucie"?
4. Where did "Fan" as the family name come from? Cavendish uses it, but Cadogan does not for this game.
5. Do the 1887 and 1914 Cadogan texts differ for La Belle Lucie? The two OCR/text copies read the same in the parts I compared. [S1][S2]
6. Confirm Aisleriot's absence against GNOME GitLab (the live upstream), not just the GitHub mirror.

## Sources

Saved copies are under `/home/andrewbartnof/la_belle_lucie/research/sources/04/`.

- S1: Lady Adelaide Cadogan, *Lady Cadogan's Illustrated Games of Solitaire or Patience* (new revised edition, David McKay, Philadelphia, 1914; Project Gutenberg #21642). https://www.gutenberg.org/ebooks/21642. Sections: contents, explanation of terms, "La Belle Lucie", "Napoleon at St. Helena". Local: `cadogan_pg21642.txt`.
- S2: Cadogan, *Illustrated Games of Patience* (Gilbert and Rivington, London; archive.org scan listed as 1887), id `illustratedgames00cadoiala`, pp. 1-2 (La Belle Lucie, OCR). Local: `illustratedgames00cadoiala.txt`. [OCR]
- S3: "Cavendish", *Patience Games with Examples Played Through* (London, 1890), archive.org id `patiencegameswit0000cave`; "The Fan" (Diagram XXXVI), "The Three-Card Fan" (Diagram XXVII), "Remarks on Fan Patiences". Page numbers not captured. Local: `patiencegameswit0000cave.txt`. [OCR]
- S4: William B. Dick (ed.), *Dick's Games of Patience* (Dick & Fitzgerald, copyright 1898; Google scan), archive.org id `dicksgamespatie00unkngoog`; contents list line "LA BELLE LUCIE One Pack 59", "THE FAN" (two packs). Local: `dicksgamespatie00unkngoog.txt`. [OCR]
- S5: Mary Whitmore Jones, *Games of Patience for One or More Players, Second Series* (1898), archive.org id `gamesofpatiencef00joneiala`; cover list of Series I ("Fair Lucy"). Local: `gamesofpatiencef00joneiala.txt`. [OCR]
- S6: PySolFC rule pages, `html-src/rules/{labellelucie,fan,trefoil,cloverleaf,alexanderthegreat,shamrocks,shamrocksii,intelligence,threeshufflesandadraw}.html`, https://github.com/shlomif/PySolFC. Local: `pysolfc_rules/`.
- S7: PySolFC `pysollib/games/fan.py` (master), https://raw.githubusercontent.com/shlomif/PySolFC/master/pysollib/games/fan.py; classes Fan, LaBelleLucie, Trefoil, Intelligence, CloverLeaf; `registerGame` entries near lines 1138-1177. Local: `fan.py`.
- S8: Cadogan 1914 figure `images/001.jpg` (La Belle Lucie), via https://www.gutenberg.org/cache/epub/21642/pg21642-images.html. Local: `cadogan_fig_belle_lucie.jpg`, `cadogan_images.html`.
- S9: PySolFC `html-src/assist_options.html`. Local: `pysolfc_assist_options.html`.
- S10: PySolFC `html-src/howtoplay.html`. Local: `pysolfc_howtoplay.html`.
- S11: GNOME Aisleriot, `games/meson.build` and git tree (GitHub mirror, master). Local: `aisleriot_meson.build`, `aisleriot_tree.json`.
- S12: Microsoft Store, "Microsoft Solitaire Collection", https://apps.microsoft.com/detail/9wzdncrfhwd2. Local: `msstore_msc.html`.
- S13: Microsoft Store, "La Belle Lucie" (ALGOTECH SOFTWARE), https://apps.microsoft.com/detail/9n7qv2t46g5w. Local: `msstore_9n7q.html`.
