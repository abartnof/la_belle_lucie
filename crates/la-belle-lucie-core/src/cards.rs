//! The pack. A plain 52-card pack, rank 1 (ace) to 13 (king), as `Card(u8)`
//! with index `suit * 13 + rank - 1`. A game with another pack (32 cards,
//! twins, trumps) replaces this file: the four sibling games each did.

use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Suit {
    Spades,
    Hearts,
    Diamonds,
    Clubs,
}

impl Suit {
    pub const ALL: [Suit; 4] = [Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs];

    pub fn letter(self) -> char {
        match self {
            Suit::Spades => 'S',
            Suit::Hearts => 'H',
            Suit::Diamonds => 'D',
            Suit::Clubs => 'C',
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Card(u8);

const RANKS: &str = "A23456789TJQK";

impl Card {
    pub const COUNT: usize = 52;

    pub fn new(rank: u8, suit: Suit) -> Card {
        assert!((1..=13).contains(&rank), "rank {rank} out of range");
        Card(suit as u8 * 13 + rank - 1)
    }

    pub fn from_index(index: usize) -> Option<Card> {
        (index < Self::COUNT).then_some(Card(index as u8))
    }

    pub fn index(self) -> usize {
        self.0 as usize
    }

    pub fn rank(self) -> u8 {
        self.0 % 13 + 1
    }

    pub fn suit(self) -> Suit {
        Suit::ALL[(self.0 / 13) as usize]
    }

    /// The card's code, as the art files and the protocol name it: "AS", "TD".
    pub fn code(self) -> String {
        format!(
            "{}{}",
            RANKS.as_bytes()[(self.rank() - 1) as usize] as char,
            self.suit().letter()
        )
    }

    pub fn parse(code: &str) -> Option<Card> {
        let mut chars = code.chars();
        let (rank, suit) = (chars.next()?, chars.next()?);
        if chars.next().is_some() {
            return None;
        }
        let rank = RANKS.find(rank.to_ascii_uppercase())? as u8 + 1;
        let suit = Suit::ALL
            .into_iter()
            .find(|s| s.letter() == suit.to_ascii_uppercase())?;
        Some(Card::new(rank, suit))
    }

    /// The whole pack, in index order.
    pub fn pack() -> Vec<Card> {
        (0..Self::COUNT).map(|i| Card(i as u8)).collect()
    }
}

impl fmt::Display for Card {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.code())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_card_round_trips_through_its_code() {
        for card in Card::pack() {
            assert_eq!(Card::parse(&card.code()), Some(card));
        }
    }

    #[test]
    fn the_pack_has_fifty_two_distinct_cards() {
        let mut pack = Card::pack();
        pack.sort();
        pack.dedup();
        assert_eq!(pack.len(), 52);
    }

    #[test]
    fn bad_codes_are_refused() {
        for bad in ["", "A", "1S", "AX", "ASS", "ZZ"] {
            assert_eq!(Card::parse(bad), None, "{bad:?}");
        }
    }
}
