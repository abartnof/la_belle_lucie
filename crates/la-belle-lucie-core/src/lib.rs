//! The rules of La Belle Lucie.
//!
//! The engine holds the rules; clients (the terminal, the page) hold none.
//! Everything random comes from one seed through [`cardkit_rng::Rng`], so a
//! seed, the rules and the commands played fix a game exactly, natively and in
//! WebAssembly alike.

pub mod cards;
pub mod command;
pub mod game;
pub mod hint;
pub mod rules;
pub mod table;

pub use cards::{Card, Suit};
pub use command::{Command, Dest};
pub use game::{DrawState, Game, Illegal};
pub use hint::{classify, Hint, Rule};
pub use rules::{preset, Rules};

/// Hand-built positions for the tests.
#[cfg(test)]
pub(crate) mod testing {
    use super::*;

    /// Fans from text: cards in a fan bottom to top, fans separated by "/",
    /// an empty fan written "-": `"7H 2S KD / - / AS"`.
    pub fn fans(text: &str) -> Vec<Vec<Card>> {
        text.split('/')
            .map(|fan| {
                fan.split_whitespace()
                    .filter(|c| *c != "-")
                    .map(|c| Card::parse(c).expect("a card"))
                    .collect()
            })
            .collect()
    }

    pub fn game(code: u32, layout: &str, home: [u8; 4]) -> Game {
        Game::from_layout(Rules::from_code(code), fans(layout), home)
    }

    pub fn card(code: &str) -> Card {
        Card::parse(code).expect("a card")
    }

    pub fn mv(from: usize, to: Dest) -> Command {
        Command::Move { from, to }
    }
}
