# 01 - Wikipedia audit and name/first appearance of La Belle Lucie

Method: raw wikitext of en and ru articles fetched via the MediaWiki API; every Wikipedia citation checked for accessibility; period texts read from archive.org / Gutenberg djvu OCR (marked [OCR]). Wikipedia is used only as a pointer. Local copies in research/sources/01/.

## A. Wikipedia language editions

- Wikidata sitelinks for the English article list only enwiki and ruwiki; the enwiki langlinks API returns only ru [S1][S2]. My searches of fr, de, it and es Wikipedia for "Belle Lucie" patience/Patience/réussite found no article (fr hits were unrelated: a novel and a TV show) [S3]. [UNVERIFIED: absence was shown by API search only, not by browsing each wiki.]
- English article cites only modern books (Morehead/Hoyle 2001, Arnold 2010/2011, Glenn & Denton 2003, Whiter 2000, Parlett 1987, Rigal, Little Book of Solitaire 2002) plus Cadogan 1968 facsimile. None of those modern books was obtainable here; those claims are [UNVERIFIED] by me, not contradicted.
- Russian article cites Kazmin 2000, Konstantinov (Nauka i Zhizn 1991 no.7 p.91), Sinelchenko 1998, Skvortsov 2000, two PySolFC/durbetsel web pages. None fetched; [UNVERIFIED]. It gives no history or date [S2].

### Claim table (en unless noted)

| Wikipedia claim | Verdict | Evidence |
|---|---|---|
| First published in English by Lady Adelaide Cadogan in 1870 | UNSUPPORTED (date). Cadogan is confirmed as an early English source, but I found no 1870 copy. The en article's own bibliography calls the facsimile of "the original published in London, 1875" [S1], which conflicts with 1870. | Earliest dated copy I read: title page "1874" [S4]. A 6th edition is dated 1887 [S5]. Both contain La Belle Lucie as the first game. |
| "Originated in France" | UNSUPPORTED (no citation in the article). Circumstantial only: the name is French and Cadogan's contents use French titles (Le Cadran, La Quinzaine, La Loi Salique, Les Quatre Coins, Le Moulin) [S4]. | No French source found. |
| 17 fans of 3 plus a single card (18th) | CONFIRMED | Cadogan: "packets of three cards ... The last packet, however, will contain but one card" [S4][S5]. |
| Only top card playable | CONFIRMED | "The uppermost card of each packet is alone available" [S4]. |
| Aces to foundations, built up by suit | CONFIRMED | "The four aces form the foundation cards, and are to ascend in sequence to kings" [S4]; "The foundations must follow suit" [S4]. |
| Tableau building down in suit | CONFIRMED | "forming marriages in a descending line on the tableau" [S4]; Dick: "Marriages must be formed in suit" [S6]. |
| Two reshuffles | CONFIRMED | "shuffled and re-dealt (if necessary twice)" [S4]; Dick same [S6]. |
| Empty fan cannot be refilled | CONSISTENT (rule absent in Cadogan, no refill allowed by omission); the Fan variant adds the king rule. | Cadogan [S4]; Cavendish The Fan [S7]. |
| "The Fan": king may fill an empty fan, no redeal | CONFIRMED for the rule set, under the name "The Fan" in 1890 | Cavendish: "any king on the top of a depot may be moved to the space"; "Only one deal is allowed" [S7][OCR]. Note it is a separately titled game there, not an alias of La Belle Lucie. |
| Three Shuffles and a Draw / "merci" draw on last deal | PARTLY CONFIRMED: the draw is in Dick's La Belle Lucie ("In the last deal it is permitted to draw one card ...") [S6]. The name "Three Shuffles and a Draw" and the word "merci" for it were not found in any source I read. Cadogan has no draw [S4][S5]. | Cavendish uses "merci" for other games [S7]. |
| Shamrocks: max three cards per fan | CONFIRMED (Dick 1884): "No packet is permitted to contain more than three cards"; suit need not match [S6]. Cavendish calls it "The Three-Card Fan" [S7]. | Wikipedia's "Shamrocks" name matches Dick. |
| House in the Woods (two packs) | CONFIRMED as a two-pack form, Cadogan "THE HOUSE IN THE WOOD", and House on the Hill [S4][S6]. ru claims 35 fans of 104 cards: [UNVERIFIED]. |
| Trefoil (aces removed first, 16 fans) | UNVERIFIED: cited to Rigal; name not found in any period source read. |
| Alexander the Great, Clover Leaves, Midnight Oil, Lovely Lucy | UNVERIFIED: cited only to modern books; not found in period sources read. |
| La belle Benedikte (two jokers, 18 fans) | UNVERIFIED, uncited. |
| "Very hard to win", unsolvable setups, 66% king figure | UNVERIFIED / uncited reasoning; not source-checked here. (Strand for simulation, not this one.) |
| ru: 18 fans, three deals total, in-suit descending moves | CONSISTENT with Cadogan [S4]. ru 36-card variant: UNVERIFIED. |

Note on the draw: a web summary says Dick allowed the draw and Cadogan did not; I verified this directly [S4][S6]. The 1884 Dick text notes some players collect the packets in order instead of shuffling ("Some players do not shuffle the cards, but collect the packets in regular order as they remain in the tableau") [S6][OCR].

## B. Name and first appearance in print

Earliest dated source I could read: Lady Adelaide Cadogan, *Illustrated Games of Patience*, London, Sampson Low, 1874 (title page) [S4]. The 1874 imprint is not necessarily the first edition; the 1870 date is plausible but unverified. [UNVERIFIED] A first edition would settle it; neither WorldCat nor a catalogue entry for an 1870/1875 first edition was reached.

Spellings and names found in primary texts:

- "La Belle Lucie" (French title kept in English books): Cadogan 1874, 1887 [S4][S5]; Dick 1884 (contents p.59) [S6]; Cadogan, American "New Revised Edition" (Copyright 1914) [S8].
- The Fan / The Three-Card Fan (different rule sets, same deal): Cavendish 1890 [S7]. Cavendish does not mention "La Belle Lucie" at all (no match for "belle" in the OCR) [S7].
- The Shamrocks, The House in the Wood, The House on the Hill: Dick 1884 as variants "of La Belle Lucie" [S6].
- "Fair Lucy": appears in the contents of M. Whitmore Jones, *Games of Patience*, Second Series (1898) [S9]; the body text was not in the OCR, so whether it is a distinct game or an English rendering is [UNVERIFIED].
- Not found in any primary source read: "Schöne Lucie", "Clover Leaf", "Alexandra", "Trefoil", "Alexander the Great", "Midnight Oil". No German, French or Italian period source was located (Google Books API quota exhausted; search engines returned nothing) [UNVERIFIED].
- Note: Cheney, *Patience: a series of games with cards* (Boston, 1869; 1895 reissue) has no match for Lucie/Fan/Clover [S10], so the game is absent from that early American book.

Origin of the name: no source found explaining "Lucie" (who or what the beautiful Lucy is). Nothing found supports any etymology. Do not assert one.

## Open questions
1. Is there a genuine 1870 first edition of Cadogan, and does it contain La Belle Lucie? (Check WorldCat/BL/HathiTrust catalogue records.)
2. Any French source earlier than Cadogan (Gallica: "La belle Lucie" in a réussites or Cartes à jouer manual)? Not found.
3. German "Schöne Lucie" and Italian/Spanish names: no source located.
4. Who first used "Trefoil", "Clover Leaf", "Alexandra", "Three Shuffles and a Draw"? Check Morehead, Parlett 1979/1987, Arnold in print.
5. Body text of "Fair Lucy" in Jones 1898 (archive.org gamesofpatiencef00joneiala page images).
6. Facsimile Cadogan 1968 pp. v and vii (archive.org illustratedgames00cado, lending-only; text download returned 401).

## Sources
- S1 English Wikipedia "La Belle Lucie", raw wikitext, fetched 2026-10-18 via index.php?action=raw; langlinks via api.php. Local: sources/01/en.wiki.txt
- S2 Russian Wikipedia "Прекрасная Лючия (пасьянс)", API revision text; Wikidata sitelinks (enwiki, ruwiki only). Local: sources/01/ru.wiki.txt, ru.json
- S3 fr/de/it/es Wikipedia API search results (no article found); not saved.
- S4 Lady Adelaide Cadogan, Illustrated Games of Patience, London: Sampson Low, 1874. https://archive.org/details/illustratedgame00cadogoog ; pp.1-2, contents. [OCR] Local: sources/01/illustratedgame00cadogoog.txt
- S5 Cadogan, Illustrated Games of Patience, 6th ed., London, 1887. https://archive.org/details/illustratedgames00cadoiala ; La Belle Lucie pp.1-2. [OCR] Local: illustratedgames00cadoiala.txt
- S6 William B. Dick (ed.), Dick's Games of Patience, New York: Dick & Fitzgerald, copyright 1883/1884. https://archive.org/details/dicksgamespatie00dickgoog ; pp.59-60. [OCR] Local: dicksgamespatie00dickgoog.txt (and dicksgamespatie00unkngoog.txt)
- S7 "Cavendish" (Henry Jones), Patience Games, London, 1890. https://archive.org/details/patiencegameswit0000cave ; The Fan, Three-Card Fan, Remarks on Fan Patiences (Diagrams XXVI-XXVII). [OCR] Local: patiencegameswit0000cave.txt
- S8 Lady Cadogan's Illustrated Games of Solitaire or Patience, New Revised Edition including American games, Philadelphia: David McKay, copyright 1914. https://www.gutenberg.org/ebooks/21642 . Local: gutenberg21642.txt
- S9 Mary Whitmore Jones, Games of Patience for One or More Players, Second Series, London: Lupcott Gill, 1898. https://archive.org/details/gamesofpatiencef00joneiala ; contents list only. [OCR] Local: gamesofpatiencef00joneiala.txt
- S10 Ednah D. Cheney, Patience: a series of games with cards, Boston, 1869. https://archive.org/details/patienceseriesof00chen ; full-text search for Lucie/fan/clover returned nothing. Local: patienceseriesof00chen.txt
