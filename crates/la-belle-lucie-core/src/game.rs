//! The placeholder game: a shuffled pack, and `draw` to take the top card.
//! Replace with the real rules.

use crate::cards::Card;
use cardkit_rng::Rng;
use std::fmt;

/// What each stream drawn from the game's seed is for. Each purpose has a
/// stream of its own, so drawing for one never moves another: how much an
/// agent thinks never changes the cards. These numbers are the game's, not
/// the toolkit's; never renumber them once a seed has been published.
pub mod purpose {
    /// The shuffle of the pack.
    pub const DEALS: u64 = 0;
}

/// What a player may do. The text form is the protocol's (docs/PROTOCOL.md).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Command {
    Draw,
}

impl Command {
    pub fn parse(text: &str) -> Option<Command> {
        match text.trim() {
            "draw" => Some(Command::Draw),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Illegal {
    /// The stock is empty.
    NothingToDraw,
}

impl Illegal {
    /// A stable code the client turns into words; the engine speaks no prose.
    pub fn code(self) -> &'static str {
        match self {
            Illegal::NothingToDraw => "nothing_to_draw",
        }
    }
}

impl fmt::Display for Illegal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.code())
    }
}

#[derive(Clone, Debug)]
pub struct Game {
    seed: u64,
    /// Face down; the next card to draw is the last.
    stock: Vec<Card>,
    hand: Vec<Card>,
    /// Every command applied, in order: with the seed, the whole game.
    record: Vec<Command>,
}

impl Game {
    pub fn new(seed: u64) -> Game {
        let mut stock = Card::pack();
        Rng::stream(seed, purpose::DEALS).shuffle(&mut stock);
        Game {
            seed,
            stock,
            hand: Vec::new(),
            record: Vec::new(),
        }
    }

    pub fn seed(&self) -> u64 {
        self.seed
    }

    pub fn stock(&self) -> usize {
        self.stock.len()
    }

    pub fn hand(&self) -> &[Card] {
        &self.hand
    }

    pub fn record(&self) -> &[Command] {
        &self.record
    }

    /// What may be played now.
    pub fn legal(&self) -> Vec<Command> {
        if self.stock.is_empty() {
            Vec::new()
        } else {
            vec![Command::Draw]
        }
    }

    pub fn apply(&mut self, command: Command) -> Result<(), Illegal> {
        match command {
            Command::Draw => {
                let card = self.stock.pop().ok_or(Illegal::NothingToDraw)?;
                self.hand.push(card);
            }
        }
        self.record.push(command);
        Ok(())
    }

    /// The game again from its seed and a record: how undo and saved games work.
    pub fn replay(seed: u64, record: &[Command]) -> Result<Game, Illegal> {
        let mut game = Game::new(seed);
        for &command in record {
            game.apply(command)?;
        }
        Ok(game)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_seed_fixes_the_deal() {
        let a = Game::new(7);
        let b = Game::new(7);
        assert_eq!(a.stock, b.stock);
        assert_ne!(a.stock, Game::new(8).stock);
    }

    #[test]
    fn the_shuffle_keeps_every_card() {
        let mut stock = Game::new(1).stock;
        stock.sort();
        assert_eq!(stock, Card::pack());
    }

    #[test]
    fn drawing_moves_the_top_card_to_the_hand() {
        let mut game = Game::new(3);
        let top = *game.stock.last().unwrap();
        game.apply(Command::Draw).unwrap();
        assert_eq!(game.hand(), [top]);
        assert_eq!(game.stock(), 51);
    }

    #[test]
    fn an_empty_stock_cannot_be_drawn_from() {
        let mut game = Game::new(3);
        for _ in 0..52 {
            game.apply(Command::Draw).unwrap();
        }
        assert!(game.legal().is_empty());
        assert_eq!(game.apply(Command::Draw), Err(Illegal::NothingToDraw));
        assert_eq!(game.record().len(), 52, "a refused command is not recorded");
    }

    #[test]
    fn a_record_replays_to_the_same_game() {
        let mut game = Game::new(11);
        for _ in 0..5 {
            game.apply(Command::Draw).unwrap();
        }
        let again = Game::replay(11, game.record()).unwrap();
        assert_eq!(again.hand(), game.hand());
    }

    #[test]
    fn another_stream_does_not_move_the_deal() {
        // Drawing from a different purpose's stream must leave the deal alone.
        let before = Game::new(5).stock;
        let _ = Rng::stream(5, 99).below(10);
        assert_eq!(Game::new(5).stock, before);
    }
}
