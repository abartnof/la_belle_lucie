//! La Belle Lucie in a terminal: `la-belle-lucie [--seed N]`, then one command a line
//! (`draw`), `quit` to leave. A client like the page: it holds no rules.

use la_belle_lucie_core::{Command, Game};
use std::io::{self, BufRead, Write};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let seed = args
        .windows(2)
        .find(|w| w[0] == "--seed")
        .and_then(|w| w[1].parse().ok())
        .unwrap_or(1);
    let mut game = Game::new(seed);
    let stdin = io::stdin();
    let mut out = io::stdout();
    loop {
        let hand: Vec<String> = game.hand().iter().map(|c| c.code()).collect();
        let _ = write!(out, "stock {}  hand [{}]\n> ", game.stock(), hand.join(" "));
        let _ = out.flush();
        let mut line = String::new();
        if stdin.lock().read_line(&mut line).unwrap_or(0) == 0 || line.trim() == "quit" {
            break;
        }
        match Command::parse(&line).map(|c| game.apply(c)) {
            Some(Ok(())) => {}
            Some(Err(why)) => println!("refused: {why}"),
            None => println!("commands: draw, quit"),
        }
    }
}
