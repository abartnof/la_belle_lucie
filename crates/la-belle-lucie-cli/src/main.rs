//! La Belle Lucie in a terminal: `la-belle-lucie [--seed N] [--rules CODE]`,
//! then one protocol command a line (`move f3>f5`, `f3>h`, `draw f2:1>h`,
//! `redeal`, `undo`, `hint`), `quit` to leave. A client like the page: it
//! holds no rules, it prints the table and sends what it is told.

use la_belle_lucie_core::{preset, Command, Game, Rules};
use std::io::{self, BufRead, Write};

fn arg(args: &[String], name: &str) -> Option<u32> {
    args.windows(2)
        .find(|w| w[0] == name)
        .and_then(|w| w[1].parse().ok())
}

/// The table as text: the foundations, then each fan bottom to top with its
/// slot number (the top card is the last).
fn show(game: &Game, hint: Option<String>) -> String {
    let mut text = String::new();
    let suits = ["S", "H", "D", "C"];
    let home: Vec<String> = game
        .home()
        .iter()
        .zip(suits)
        .map(|(n, s)| format!("{s}:{n}"))
        .collect();
    text += &format!(
        "home {}   redeals left {}   draw {}   moves {}\n",
        home.join(" "),
        game.redeals_left(),
        game.draw_state().code(),
        game.record().len()
    );
    for (i, fan) in game.fans().iter().enumerate() {
        let cards: Vec<String> = fan.iter().map(|c| c.code()).collect();
        text += &format!("f{i:<2} {}\n", cards.join(" "));
    }
    let legal: Vec<String> = game.legal().iter().map(|c| c.text()).collect();
    text += &format!("legal: {}\n", legal.join("  "));
    if let Some(hint) = hint {
        text += &format!("hint: {hint}\n");
    }
    if game.won() {
        text += "won\n";
    } else if game.lost() {
        text += "lost\n";
    }
    text
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let seed = arg(&args, "--seed").unwrap_or(1);
    let rules = arg(&args, "--rules").unwrap_or(preset::CLASSIC);
    let mut game = Game::new(u64::from(seed), Rules::from_code(rules));
    let stdin = io::stdin();
    let mut out = io::stdout();
    let mut hint = None;
    loop {
        let _ = write!(out, "{}> ", show(&game, hint.take()));
        let _ = out.flush();
        let mut line = String::new();
        if stdin.lock().read_line(&mut line).unwrap_or(0) == 0 || line.trim() == "quit" {
            break;
        }
        match line.trim() {
            "hint" => {
                hint = Some(match game.hint() {
                    Some(h) => format!("{} ({})", h.command.text(), h.rule.id()),
                    None => "none".to_string(),
                });
            }
            "undo" => {
                if let Err(why) = game.undo() {
                    println!("refused: {why}");
                }
            }
            text => match Command::parse(text).map(|c| game.apply(c)) {
                Some(Ok(())) => {}
                Some(Err(why)) => println!("refused: {why}"),
                None => {
                    println!("commands: move f3>f5, f3>h, draw f2:1>h, redeal, undo, hint, quit")
                }
            },
        }
    }
}
