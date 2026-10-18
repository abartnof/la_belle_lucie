//! The rules code (docs/RULES.md): one `u32`, so a client names a variant with
//! a number and the engine reads the options from its bits.

/// Presets, named for the book they follow.
pub mod preset {
    pub const CLASSIC: u32 = 4;
    pub const WITH_THE_DRAW: u32 = 12;
    pub const THE_FAN: u32 = 16;
    pub const TREFOIL: u32 = 37;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rules {
    /// Redeals are not shuffled: the gathered cards are dealt as they lie.
    pub in_order: bool,
    /// How many redeals the player has, 0 to 2.
    pub redeals: u8,
    /// One buried card may be drawn out and played, on the last deal.
    pub draw: bool,
    /// A king may move into an empty fan.
    pub king_fills: bool,
    /// The aces start at home and the rest are dealt in 16 fans of three.
    pub trefoil: bool,
}

impl Rules {
    /// Reads a code; a redeal count above 2 means 2.
    pub fn from_code(code: u32) -> Rules {
        Rules {
            in_order: code & 1 != 0,
            redeals: ((code >> 1) & 3).min(2) as u8,
            draw: code & 8 != 0,
            king_fills: code & 16 != 0,
            trefoil: code & 32 != 0,
        }
    }

    pub fn code(self) -> u32 {
        u32::from(self.in_order)
            | u32::from(self.redeals) << 1
            | u32::from(self.draw) << 3
            | u32::from(self.king_fills) << 4
            | u32::from(self.trefoil) << 5
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_presets_read_as_the_rules_table_says() {
        let classic = Rules::from_code(preset::CLASSIC);
        assert_eq!(
            (classic.redeals, classic.in_order, classic.draw),
            (2, false, false)
        );
        assert!(!classic.king_fills && !classic.trefoil);
        let draw = Rules::from_code(preset::WITH_THE_DRAW);
        assert!(draw.draw && draw.redeals == 2 && !draw.king_fills);
        let fan = Rules::from_code(preset::THE_FAN);
        assert!(fan.king_fills && fan.redeals == 0 && !fan.draw);
        let trefoil = Rules::from_code(preset::TREFOIL);
        assert!(trefoil.trefoil && trefoil.in_order && trefoil.redeals == 2);
    }

    #[test]
    fn codes_round_trip_and_three_redeals_means_two() {
        for code in 0..64u32 {
            let rules = Rules::from_code(code);
            assert_eq!(Rules::from_code(rules.code()), rules);
        }
        assert_eq!(Rules::from_code(6).redeals, 2);
    }
}
