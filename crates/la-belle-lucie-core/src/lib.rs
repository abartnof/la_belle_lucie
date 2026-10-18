//! The rules of La Belle Lucie.
//!
//! The engine holds the rules; clients (the terminal, the page) hold none.
//! Everything random comes from one seed through [`cardkit_rng::Rng`], so a
//! seed and the commands played fix a game exactly, natively and in
//! WebAssembly alike.
//!
//! This is the template's placeholder game: a shuffled pack you `draw` from.
//! Replace `game.rs` with the real rules; keep the shape (a seed, a command
//! type with a text form, `apply` returning `Result`, `legal` listing what
//! may be played).

pub mod cards;
pub mod game;

pub use cards::{Card, Suit};
pub use game::{Command, Game, Illegal};
