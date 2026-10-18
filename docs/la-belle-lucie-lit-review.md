# La Belle Lucie: A Literature Review for Game Development

*Prepared 18 October 2026. Scope: the game's name and earliest appearance, its rules and variants, strategy and odds, related games, the physical layout, and digital precedents. Deliberately short: La Belle Lucie is a one-player patience, so there is no opponent, table talk, session scoring or social history to study. Written for a single offline web game.*

## How to read this document

- **Citation rule.** Every factual sentence carries a citation `[NN-S#]`: source S# of research note NN in `research/` (`01-wikipedia-and-name`, `02-rules`, `03-strategy-and-odds`, `04-family-cards-digital`). Each note lists its sources in full (author, edition, URL, page, local copy under `research/sources/`). `[NN §x]` points to a section of a note.
- **Quotations** are verbatim, with an English translation after non-English ones. `[OCR]` marks text read from machine OCR.
- **Flags.** `[UNVERIFIED]` means the claim could not be confirmed in a fetched source. Wikipedia is a pointer, never a source.
- **ORIGINAL COMPUTATION** is our own simulation (`research/sim/`), not literature.
- Where the notes disagreed, section 8 says how it was resolved.

## Method

Four parallel agents, each under one brief (`research/_BRIEF.md`): (01) the English and Russian Wikipedia articles with every citation followed back, plus the name; (02) period rulebooks transcribed into a clause-by-clause table; (03) strategy advice, published odds, and a solver; (04) related games, layout and vocabulary, digital versions. Libraries reached: archive.org, Project Gutenberg, GitHub, the Microsoft Store. Not reached: Bergholt, Dalton, Parlett and Morehead's 1971 edition (lending-only), Google Books (quota), and any German, Italian or Russian period text [01 §B][02 §1][03 §A]. Two agents found no French article, only French rulebooks [01 §A][02 §1]. The review pass here was a read-through of the four notes with spot-greps of the sources (section 8); it was not a full re-verification of every quote.

## Executive summary

- **What it is.** One 52-card pack is dealt face up in packets of three, 17 of them plus a last single card; only the top card of a packet is available [01 §A][02 §2].
- **Goal.** The four aces start four foundations, built up in suit to the king [01 §A][02 §2].
- **Tableau.** A top card may move onto another packet's top card when it is the same suit and one rank lower [02 §4 rule 3].
- **Redeals.** When no move remains, the tableau may be gathered, shuffled and re-dealt in threes, "if necessary twice" [01 §A][02 §2].
- **The sources agree on the core and disagree on four points:** empty packets, redeal by shuffling or in order, the final "draw", and one pack versus two (section 3).
- **Hard to win.** ORIGINAL COMPUTATION on 10,000 deals under the shuffle rule: a simple greedy player wins 5.7%, and a search solver proves at least 19.1% winnable [03 §B].
- **The shuffle is what makes it hard.** If redeals gathered the cards in order instead, the same solver wins about 87-91% [03 §B].
- **Nobody has published a sourced win rate.** Every published figure (about 8%, about 40%, about 60% with a draw) is unsourced or second-hand [03 §A].
- **Origin is unknown.** No source explains the name or shows French origin, and the Wikipedia date of 1870 could not be confirmed (section 1).

## 1. Name and first appearance

- The earliest dated copy anyone read is Lady Adelaide Cadogan, *Illustrated Games of Patience* (London: Sampson Low), title page 1874, where La Belle Lucie is the first game [01-S4]. A sixth edition is dated 1887 [01-S5]. The English Wikipedia article says "1870"; the article's own bibliography says the facsimile reproduces a London original of 1875, and no 1870 copy was found. The 1870 date is unsupported [01 §A claim table]. [UNVERIFIED]
- Cadogan's book kept its French titles in English: its contents also list Le Cadran, La Quinzaine, La Loi Salique, Les Quatre Coins and Le Moulin [01-S4]. That is circumstantial. "Originated in France" has no citation in the English article, and no French source earlier than Cadogan was found [01 §A]. [UNVERIFIED]
- The name appears as "La Belle Lucie" in Cadogan (1874, 1887, and the 1914 American revised edition) [01-S4][01-S5][01-S8] and in Dick's *Games of Patience* (1884) [01-S6]. A French book of 1876 spells it "Belle-Lucie" [02-S6].
- Cavendish (1890) never uses the name; he calls the same one-pack game "The Fan" [01 §B][02-S4].
- "Fair Lucy" appears in the contents of M. Whitmore Jones's *Games of Patience, Second Series* (1898); whether it is the same game was not checked [01-S9]. [UNVERIFIED]
- "Schöne Lucie", "Clover Leaf", "Alexandra", "Trefoil", "Alexander the Great", "Midnight Oil", "Good Measure", "Three Shuffles and a Draw" and "La Belle Benedikte" appear in no primary source read [01 §B][02 §3]. PySolFC lists several as aliases or games of its own (section 5) [04-S6][04-S7].
- Nothing found explains who "Lucie" is, and no art, music or literary tie to the name was found [01 §B][04 §d]. We should not invent one.
- Wikipedia coverage: only the English and Russian articles exist (Wikidata sitelinks). The Russian article's book citations were not obtainable [01 §A].

## 2. The rules, by source

The sources read, in date order: Cadogan 1874/1887 [01-S4][01-S5], the French *Livre des patiences* 1876 [02-S6], Dick 1884 [01-S6], Cavendish 1890 "The Fan" [02-S4], Hoffmann 1892 "The Trefoil" [02-S5], Hachette's *Nouveau dictionnaire de la vie pratique* 1923 [02-S7], and Morehead & Mott-Smith 1949 [02-S9]. The full clause-by-clause table is in [02 §2]; the points that matter:

- **Layout.** "Deal out the entire pack in packets of three cards dealt together and placed as in tableau. The last packet, however, will contain but one card." [02-S1] [OCR] Cavendish says "seventeen depôts" with one card over that "gets a depot to itself" [04-S3]. Morehead agrees [02 §4].
- **What moves.** "The uppermost card of each packet is alone available, until by its removal it releases the one beneath." [02-S1] Morehead: one card at a time [02 §2].
- **Foundations.** "The four aces form the foundation cards, and are to ascend in sequence to kings", and "The foundations must follow suit." [01-S4]
- **Building in suit.** Cadogan's La Belle Lucie entry says only "forming marriages in a descending line on the tableau" [02-S1], but her glossary defines it: "_Marriage._ The placing a card _of the same suit_ on the next one above or below it in value." [04-S1] Dick adds "Marriages must be formed in suit" as a rule [02-S3].
- **Redeals.** Cadogan: "the entire tableau may be taken up, shuffled and re-dealt (if necessary twice)" [03-S1]; Dick the same [01-S6]; Morehead agrees [02 §2]. Cadogan's glossary adds that re-deals "are always in addition to the original deal" [04-S1].
- **Redeal in order.** Dick records the other practice: "Some players do not shuffle the cards, but collect the packets in regular order as they remain in the tableau." [01-S6] [OCR] Hoffmann's Trefoil gathers the triplets without shuffling and allows two redeals [02 §3].
- **The draw.** Dick: "In the last deal it is permitted to draw one card if it should happen to be covered with another card that would otherwise defeat the Patience." [02-S3] Morehead: "After the last redeal, any one buried card may be drawn out of any one fan" [02-S9]. Cadogan has no draw [01 §A].
- **Empty packets.** Morehead says they are never refilled [02-S9]; Cavendish lets a king fill one but then allows only one deal [04-S3]; Cadogan and Dick are silent [02 §2].
- **Cavendish's variation.** "Some players do not permit kings to be moved to spaces. In that case, three deals are allowed. After each deal, the untaken cards are shuffled and redealt in packets of three." [03-S2]
- **Cavendish on difficulty.** Of the king-to-space version: "This patience, with careful play, is slightly against the player." [03-S2]

## 3. Where the sources disagree

| Question | Sources | Evidence |
|---|---|---|
| One pack or two | One: Cadogan, Dick, Cavendish, Hoffmann, Morehead. Two (104 cards): the French books of 1876 and 1923 | [02 §2][02-S6][02-S7] |
| Redeal reshuffles | Yes: Cadogan, Dick, Morehead, the 1923 French text. In order: Dick's "some players" note, Hoffmann's Trefoil | [02 §2-3][01-S6] |
| Number of deals | 3 total in Cadogan, Dick, Morehead, the 1923 French text; 1 in Cavendish's king rule; 3 in his variation | [02 §2][04-S3] |
| Empty packets | Never refilled (Morehead); king may fill (Cavendish); silent (Cadogan, Dick) | [02 §2] |
| Final draw | Yes in Dick and Morehead; no in Cadogan and Cavendish | [02 §2] |
| Alternating colours | Mentioned only as a thing "certains joueurs" (some players) do, in the 1923 French text | [02-S7] |

French quotes from the two-pack sources, with translation: "l'on ne peut toucher aux premiers rois qui sont sur les paquets des trois cartes primitivement placées" (one cannot touch the kings that sit on the three-card packets as first dealt) [02-S6]; "si, au bout de 3 distributions seulement, vous n'avez pas réussi ... la patience est manquée" (if after only 3 deals you have not succeeded, the patience is lost) [02-S7]. Why the French play with two packs was not found [02 §5 Q9].

## 4. Proposed canonical ruleset

Chosen by tally of the five one-pack English sources, with each rule's support shown [02 §4]. This is the default "Classic" mode.

1. One 52-card pack, dealt face up in 17 packets of three and one single card [01-S4][04-S3][02-S9].
2. Aces go to four foundations, built up in suit to the king [01-S4].
3. A top card may move onto another packet's top card if it is the same suit and one rank lower, one card at a time [01-S6][04-S3][02-S9].
4. Only top cards are playable [01-S4].
5. Empty packets stay empty [02-S9]. This is the weakest point: Cavendish differs, Cadogan and Dick are silent [02 §5 Q4].
6. When stuck, the player may gather every non-foundation card, **shuffle**, and re-deal in threes with the remainder as a short packet; at most two redeals [01-S4][02-S9]. A redeal is allowed "when all available cards have been played" [02-S1].
7. After the last redeal the player may draw one buried card, once [01-S6][02-S9]. Dick limits it to a card covered by one that "would otherwise defeat the Patience"; Morehead allows any buried card [02 §4]. The draw is a variant, not Cadogan's rule [01 §A].
8. Win when all 52 cards are on the foundations [02-S1].

Options, each sourced: Trefoil (aces pre-placed, 16 packets) [02-S5][02-S9]; The Fan (king may fill a space, one deal) [04-S3]; redeal in order, without shuffling [01-S6][02-S5]; the Shamrocks (max three per packet, any suit) [01-S6][02-S9]; two-pack House in the Wood and House on the Hill [01-S4][01-S6]. Alternating-colour building is only a house variation [02-S7].

**Open on the sources, to be decided in the engine's rules document:** whether a built run moves as a unit (no source says so; Morehead says one card at a time) [02 §5 Q2]; whether the draw is once per game or once per deal [02 §5 Q6]; whether a redeal is compulsory when moves remain [02 §5 Q7].

## 5. The family, the layout and digital precedents

**Family.** In PySolFC (a modern implementation, not a period source) the group shares one base class (`Fan`) [04-S7]:

| Game | Difference from La Belle Lucie | Source |
|---|---|---|
| Fan | Kings may fill empty piles; no redeal | [04-S6] |
| Trefoil | Aces start on foundations; 16 piles; 2 redeals | [04-S6][04-S7] |
| Three Shuffles and a Draw | One buried card may be drawn | [04-S6][04-S7] |
| Shamrocks | Up or down regardless of suit; max 3 per pile; no redeal | [04-S6] |
| Clover Leaf | Black aces and red kings start the foundations; 16 piles of three; ace or king fills a space | [04-S6] |
| Alexander the Great | Clover Leaf with twelve piles of four | [04-S6] |

Cavendish explains why variants abound: fan patiences were played "independently of each other, and without any recognised rules" [04-S3].

**Layout.** Cadogan's figure shows the packets as overlapping rows, with four empty card outlines at the bottom for the foundations [04-S1][04-S8]. Her glossary gives the period vocabulary: *available*, *released*, *foundation*, *marriage*, *sequence*, *lane*, *talon*, and "re-deals" [04-S1]. Cavendish says "depôts" and "foundations" [04-S3]. The words "gather" and "shuffle and patch" were not found in any period text [04 §b]. [UNVERIFIED]

**Digital precedents.**
- PySolFC plays La Belle Lucie with three rounds (two redeals), by shuffling the whole tableau and re-dealing in threes [04-S7]. It offers unlimited undo/redo, hints, up to nine bookmarks and a demo mode. A game won after undoing all moves is not scored; there is no numeric score, only win/loss statistics [04-S9][04-S10]. Its own code notes the demo "is not too clever in this game" [04-S7].
- Aisleriot and Microsoft Solitaire Collection do not include the game [04-S11][04-S12]. A separate Windows app of the name lists five variations [04-S13].

## 6. Strategy and odds

- **The one period hint.** Cavendish: "A card should never be moved on another which has a lower card of a suit in the same depot." Cards that can go to a foundation "should be taken at once". [03-S2] Cadogan warns that "great care is requisite, lest in releasing one card another still more necessary to success should be blocked" [03-S1].
- **Published win rates are all unsourced.** About 8% [03-S7], "close to 40% for a careful player" [03-S4], and a second-hand snippet of about 40% without the draw and about 60% with it, which could not be fetched [03 §A]. [UNVERIFIED] No academic or solver study of this game was found [03 §A].
- **ORIGINAL COMPUTATION** (`research/sim/lbl.c`; independently re-checked by `verify.py`, which replayed 274 winning move lists with 0 failures [03 §B]). Rules implemented: the canonical set above, without the draw and with empty packets never refilled; redeal only when stuck; foundation moves made automatically. 10,000 deals, fixed seed.

| Redeal rule | Solver | 0 redeals | 1 redeal | 2 redeals |
|---|---|---|---|---|
| Shuffle (historical rule) | Greedy | 0.45% | 2.17% | 5.72% |
| Shuffle | Search, lower bound | 4.24% | 10.39% | 19.06% |
| Gather in order | Greedy | 0.45% | 3.62% | 10.01% |
| Gather in order | Search | 4.24% | 60.51% | 87.43% |

  (A second reversed-order gather gave 90.95% for search; a second seed reproduced the numbers within about half a point [03 §B].)
- **Reading the numbers.** The 19% is a lower bound, because under the shuffle rule the solver cannot plan the future shuffle [03 §B]. The true rate for perfect play is unknown, though at least 19% of shuffled-redeal deals are winnable. In-order redeal turns the game into a planning puzzle, which is why that rate is so high [03 §B].
- **Limits of this computation.** It is descriptive, from one fixed run size, not a sequential comparison between hypotheses. The brief for the build asks for pre-registered floors, ceilings and stopping boundaries before any comparison (toolkit `CLAUDE.md`), so any later "does feature X change the win rate" test needs a new plan. Cavendish's one-deal king-to-space rule was not simulated [03 §B].

## 7. What this means for the game

These follow from the evidence; they are design proposals, not findings.

- **Default to the historical shuffle rule, label it, and offer the others on the rules screen** (in-order redeal, The Fan, Trefoil, the draw), each with its source [04-S3][02-S5][03 §C].
- **Seed the redeal** from the game seed so that a re-roll by undo gives the same shuffle. Without that, undo across a redeal would let a player re-roll the shuffle [03 §C]. This also matches the toolkit's rule that a seed plus the commands fix a game.
- **Winnable-deal mode.** Since greedy play wins about 6%, a solver check at deal time could offer guaranteed-winnable deals. Under the shuffle rule that needs either a seeded redeal or a single-phase solvability check [03 §C].
- **Hints.** The one reliable hint is Cavendish's: warn before burying a lower same-suit card [03-S2][03 §C]. A full hint needs the solver; 200,000 nodes per deal was enough in nearly all cases in the simulation [03 §C].
- **Undo.** Unlimited undo is cheap since all cards are visible [04-S9]; stop it at the redeal or make the redeal deterministic [03 §C].
- **Language.** Use the period words from Cadogan's glossary (*marriage*, *released*, *foundation*, *re-deal*, *lane*) in rules text [04-S1].

## 8. What the review changed, and how far to trust each note

- **Dates.** Note 03 dates its Gutenberg source "Cadogan 1870". Notes 01, 02 and 04 show that text is the undated revised edition (Gutenberg lists the 1914 American revised edition) and that no 1870 copy was found [01-S8][04-S1]. This review does not use the 1870 date.
- **The no-shuffle redeal.** Note 03 says no source supports redeal in order and calls it "a misreading". That is wrong. Dick's 1884 text says some players collect the packets in order [01-S6], re-confirmed here in the saved OCR text (line 2795 of `dicksgamespatie00dickgoog.txt`); Hoffmann's Trefoil gathers unshuffled [02 §3]. Redeal in order is attested as a minority practice, and the shuffle remains the majority rule. The "task" the agent mentioned was our own brief, which stated an unsourced no-shuffle rule from memory; that statement was wrong for the main sources and is not used here.
- **Suit in Cadogan.** Note 02 says Cadogan does not say tableau building is in suit; note 04 cites her glossary. Both are right: the La Belle Lucie entry is silent, but her glossary defines a marriage as same-suit (checked in the saved Gutenberg text, lines 127-129) [04-S1].
- **Two scans of Dick.** Note 02 and 01 read the 1884 scan, which contains the La Belle Lucie entry; notes 03 and 04 read an 1898 scan whose contents list the game but whose body text did not include it. These are different scans, not a contradiction [01-S6][04-S4].
- **Diagram numbers** for Cavendish's Fan differ between notes (XXVI vs XXXVI) and are not used here.
- **Trust.** Highest: the rule quotations from Cadogan, Dick, Cavendish and Morehead (OCR, cross-read by two or more agents). Medium: the PySolFC descriptions (read from source files and rule pages). Lowest: the simulation, which one agent wrote and verified itself; its win-rate figures were not independently rerun here.

## 9. Open questions

1. A first edition of Cadogan, and any French or German source earlier than 1874 [01 §Open 1-3].
2. What Morehead, Dalton, Bergholt and Parlett say about the redeal, the draw and the odds [03 §Open 1][02 §5 Q10].
3. The true win rate under the shuffle rule with optimal play, and the rate for Cavendish's one-deal king rule [03 §Open 3-4].
4. Why the French books use two packs [02 §5 Q9].
5. Whether "Fair Lucy" is the same game [01 §Open 5].

## Appendix: research notes

`research/01-wikipedia-and-name.md`, `02-rules.md`, `03-strategy-and-odds.md`, `04-family-cards-digital.md`; simulator and results in `research/sim/`; saved sources in `research/sources/`.
