//! The seeded generator: xoshiro256\*\*, seeded by SplitMix64.
//!
//! Everything random in a game's engine (the shuffle, the cut, the opponent's
//! choices) draws from this, so a seed fixes a game exactly, natively and in
//! WebAssembly alike. A game draws each kind of randomness from a stream of
//! its own ([`Rng::stream`]), so how much an agent thinks never changes the
//! cards. The stream numbers ("purposes") belong to the game, not to this
//! crate: keep them in the game's own `purpose` module.
//!
//! Extracted from bezique `crates/bezique-core/src/rng.rs` @ 1b2179e, the file
//! cassino and strohmandeln copied. Their generator code is byte-identical to
//! this; only the `purpose` module was dropped. The generator is the authors'
//! design, checked against their own C code: `tools/prng-reference/` holds it,
//! and the tests below pin its outputs. Do not change the arithmetic: every
//! game's golden hashes depend on it.

/// SplitMix64: used only to seed xoshiro256\*\* and to derive streams.
#[derive(Clone, Debug)]
pub(crate) struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    pub(crate) fn new(seed: u64) -> SplitMix64 {
        SplitMix64 { state: seed }
    }

    pub(crate) fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }
}

/// xoshiro256\*\*, by David Blackman and Sebastiano Vigna.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rng {
    s: [u64; 4],
}

impl Rng {
    /// The generator for a seed: its state is four outputs of SplitMix64
    /// started from the seed, as the authors recommend.
    pub fn seeded(seed: u64) -> Rng {
        let mut seeder = SplitMix64::new(seed);
        Rng {
            s: std::array::from_fn(|_| seeder.next_u64()),
        }
    }

    /// A generator for one purpose within a game (the deal, an agent),
    /// independent of the others drawn from the same seed.
    pub fn stream(seed: u64, purpose: u64) -> Rng {
        Rng::seeded(seed ^ SplitMix64::new(purpose).next_u64())
    }

    pub fn next_u64(&mut self) -> u64 {
        let s = &mut self.s;
        let result = s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = s[1] << 17;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = s[3].rotate_left(45);
        result
    }

    /// A uniform integer in `0..bound`, without bias (Lemire's method:
    /// multiply, and reject the few products that would favour some values).
    pub fn below(&mut self, bound: u64) -> u64 {
        assert!(bound > 0, "below(0) has no answer");
        let mut product = u128::from(self.next_u64()) * u128::from(bound);
        if (product as u64) < bound {
            // 2^64 mod bound: the products whose low word falls below this
            // are the surplus that would make some results likelier.
            let surplus = bound.wrapping_neg() % bound;
            while (product as u64) < surplus {
                product = u128::from(self.next_u64()) * u128::from(bound);
            }
        }
        (product >> 64) as u64
    }

    /// Puts `items` in a uniformly random order (Fisher–Yates).
    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for last in (1..items.len()).rev() {
            let pick = self.below(last as u64 + 1) as usize;
            items.swap(last, pick);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // From tools/prng-reference/vectors.txt: the authors' C code.
    const SPLITMIX: [(u64, [u64; 4]); 3] = [
        (
            0,
            [
                0xe220a8397b1dcdaf,
                0x6e789e6aa1b965f4,
                0x06c45d188009454f,
                0xf88bb8a8724c81ec,
            ],
        ),
        (
            42,
            [
                0xbdd732262feb6e95,
                0x28efe333b266f103,
                0x47526757130f9f52,
                0x581ce1ff0e4ae394,
            ],
        ),
        (
            20261001,
            [
                0x1d07592c816766cd,
                0x3871b325a8089306,
                0xdfca9d342fd341cd,
                0xa0c879d5313560d8,
            ],
        ),
    ];
    const XOSHIRO: [(u64, [u64; 6]); 3] = [
        (
            0,
            [
                0x99ec5f36cb75f2b4,
                0xbf6e1f784956452a,
                0x1a5f849d4933e6e0,
                0x6aa594f1262d2d2c,
                0xbba5ad4a1f842e59,
                0xffef8375d9ebcaca,
            ],
        ),
        (
            42,
            [
                0x15780b2e0c2ec716,
                0x6104d9866d113a7e,
                0xae17533239e499a1,
                0xecb8ad4703b360a1,
                0xfde6dc7fe2ec5e64,
                0xc50da53101795238,
            ],
        ),
        (
            20261001,
            [
                0xfe3ecf44c0ec0775,
                0x907add1795d28b02,
                0x23ec71374388d9c4,
                0x50542b6b3fcb92c6,
                0xb28e089b8fda9c32,
                0x31f8d54d7bb4c321,
            ],
        ),
    ];

    #[test]
    fn splitmix64_matches_the_reference_c() {
        for (seed, expected) in SPLITMIX {
            let mut g = SplitMix64::new(seed);
            let got: Vec<u64> = (0..4).map(|_| g.next_u64()).collect();
            assert_eq!(got, expected, "seed {seed}");
        }
    }

    #[test]
    fn xoshiro256starstar_matches_the_reference_c() {
        for (seed, expected) in XOSHIRO {
            let mut g = Rng::seeded(seed);
            let got: Vec<u64> = (0..6).map(|_| g.next_u64()).collect();
            assert_eq!(got, expected, "seed {seed}");
        }
    }

    #[test]
    fn below_stays_in_range_at_the_extremes() {
        let mut g = Rng::seeded(1);
        for _ in 0..1000 {
            assert_eq!(g.below(1), 0);
            assert!(g.below(2) < 2);
            assert!(g.below(64) < 64);
            assert!(g.below(u64::MAX) < u64::MAX);
            assert!(g.below((1 << 63) + 1) <= 1 << 63);
        }
    }

    /// The chi-square value that six cells (five degrees of freedom) exceed
    /// by chance once in 100,000 trials.
    const CRITICAL: f64 = 30.86;

    /// Chi-square of six cell counts expected at 10,000 each.
    fn chi_square(counts: &[u32; 6]) -> f64 {
        counts
            .iter()
            .map(|&c| (f64::from(c) - 10_000.0).powi(2) / 10_000.0)
            .sum()
    }

    /// Chi-square over six faces, 60,000 throws.
    #[test]
    fn below_is_uniform_on_a_die() {
        let mut g = Rng::seeded(7);
        let mut counts = [0u32; 6];
        for _ in 0..60_000 {
            counts[g.below(6) as usize] += 1;
        }
        let chi2 = chi_square(&counts);
        assert!(chi2 < CRITICAL, "{counts:?}, chi-square {chi2:.1}");
    }

    /// Each of the six orders of three items, 60,000 shuffles.
    #[test]
    fn shuffle_makes_every_order_equally_likely() {
        let mut g = Rng::seeded(11);
        let counts = orders_of_three(|items| g.shuffle(items));
        let chi2 = chi_square(&counts);
        assert!(chi2 < CRITICAL, "{counts:?}, chi-square {chi2:.1}");
    }

    /// How often each of the six orders of three items comes out of
    /// `shuffle`, over 60,000 shuffles.
    fn orders_of_three(mut shuffle: impl FnMut(&mut [u8; 3])) -> [u32; 6] {
        let orders = [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0],
        ];
        let mut counts = [0u32; 6];
        for _ in 0..60_000 {
            let mut items = [0, 1, 2];
            shuffle(&mut items);
            counts[orders.iter().position(|o| *o == items).unwrap()] += 1;
        }
        counts
    }

    /// The uniformity test has the power to catch the classic wrong shuffles:
    /// the textbook naive one (swap each place with any place) and Sattolo's
    /// (which makes only cycles).
    #[test]
    fn the_uniformity_test_rejects_the_classic_wrong_shuffles() {
        let mut g = Rng::seeded(12);
        let naive = orders_of_three(|items| {
            for i in 0..3 {
                let j = g.below(3) as usize;
                items.swap(i, j);
            }
        });
        assert!(chi_square(&naive) > CRITICAL, "naive: {naive:?}");
        let mut g = Rng::seeded(13);
        let sattolo = orders_of_three(|items| {
            for last in (1..3).rev() {
                let j = g.below(last as u64) as usize;
                items.swap(last, j);
            }
        });
        assert!(chi_square(&sattolo) > CRITICAL, "Sattolo: {sattolo:?}");
        let mut g = Rng::seeded(14);
        let ours = orders_of_three(|items| g.shuffle(items));
        assert!(chi_square(&ours) < CRITICAL, "ours: {ours:?}");
    }

    #[test]
    fn shuffling_keeps_every_item() {
        let mut g = Rng::seeded(3);
        let mut items: Vec<u8> = (0..64).collect();
        g.shuffle(&mut items);
        let mut sorted = items.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..64).collect::<Vec<u8>>());
        assert_ne!(items, sorted, "64 cards left in order: not a shuffle");
        let mut empty: [u8; 0] = [];
        g.shuffle(&mut empty);
    }

    #[test]
    fn a_seed_fixes_the_sequence() {
        let a: Vec<u64> = {
            let mut g = Rng::seeded(99);
            (0..5).map(|_| g.next_u64()).collect()
        };
        let b: Vec<u64> = {
            let mut g = Rng::seeded(99);
            (0..5).map(|_| g.next_u64()).collect()
        };
        assert_eq!(a, b);
    }

    #[test]
    fn streams_for_different_purposes_differ_and_repeat() {
        let deal = Rng::stream(5, 0).next_u64();
        let agent = Rng::stream(5, 1).next_u64();
        assert_ne!(deal, agent);
        assert_eq!(Rng::stream(5, 1).next_u64(), agent);
        assert_ne!(Rng::stream(6, 0).next_u64(), deal);
        assert_ne!(
            Rng::stream(5, 0),
            Rng::seeded(5),
            "a stream is not the bare seed"
        );
    }

    /// Every card is equally likely in every position of a 64-card
    /// shuffle: the three-card test cannot see a fault that shows only at
    /// larger sizes.
    #[test]
    fn shuffle_puts_every_card_in_every_position_equally() {
        let mut g = Rng::seeded(99);
        let n = 128_000u64;
        let mut counts = vec![[0u64; 64]; 64];
        for _ in 0..n {
            let mut p: Vec<u8> = (0..64).collect();
            g.shuffle(&mut p);
            for (pos, &c) in p.iter().enumerate() {
                counts[c as usize][pos] += 1;
            }
        }
        let e = n as f64 / 64.0;
        let chi: f64 = counts
            .iter()
            .flat_map(|r| r.iter())
            .map(|&c| (c as f64 - e).powi(2) / e)
            .sum();
        // 63 × 63 degrees of freedom; five standard deviations above.
        let df = 63.0 * 63.0;
        assert!(chi < df + 5.0 * (2.0f64 * df).sqrt(), "{chi}");
    }
}
