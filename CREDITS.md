# Credits

The project's own work is released under the **MIT License** (`LICENSE`). Everything
listed below is someone else's and keeps its own licence. Every third-party asset is
recorded here, in the commit that brings it in.

## Software in the page

The single-file page bundles three.js (MIT); the build keeps its licence comment. The
kit (`kit/`) is the card toolkit's, itself derived from Cassino's table.

## Randomness

`crates/cardkit-rng`: xoshiro256** and SplitMix64, by David Blackman and Sebastiano
Vigna (public domain, CC0), checked against their C reference code.

## Build tools

esbuild 0.28.2 (MIT), used at build time only.

## The soundtrack

`web3d/audio/`: ten traditional French songs in 8-bit style, played one after another
(Music in Settings, and the speaker button at the top). The songs and their melodies are
from J.-B. Weckerlin, *Chansons de France pour les petits Français* (Paris: Plon, 1886),
illustrations by L.-M. Boutet de Monvel; the typeset music is from Project Gutenberg eBook
#48878 (produced by Hans Pieterse and Claudine Corbasson from images made available by
Gallica, BnF). The book is public domain in the USA; the page uses the music only, not
Project Gutenberg's name or marks. The arrangements (bass ostinato, percussion tick,
layering, lo-fi rendering) were made by Claude (Anthropic) at the maintainer's direction;
the audio here is those renders re-encoded to 32 kbps mono AAC to keep the page small.
