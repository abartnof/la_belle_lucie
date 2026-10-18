//! The hint engine plays whole games: it must always end, always name a legal
//! move, and name the rule truthfully. The win rate is printed, not asserted
//! tightly (research/sim/results.txt: a greedy player with shuffled redeals
//! wins about 5.7% of deals, the best search found about 19%).

use la_belle_lucie_core::{preset, Card, Command, Dest, Game, Hint, Rule, Rules};
use std::time::Instant;

/// Games under the classic rules; the other presets get fewer, to keep the test quick.
const GAMES: u64 = 300;
const OTHER_GAMES: u64 = 40;

/// Checks a hint's rule against the position, written out afresh.
fn rule_is_true(game: &Game, hint: &Hint) {
    let home = game.home();
    let needs = |c: Card| home[c.suit() as usize] + 1 == c.rank();
    match (hint.rule, hint.command) {
        (Rule::Redeal, command) => assert_eq!(command, Command::Redeal),
        (Rule::Draw, Command::Draw { to, .. }) => assert_ne!(to, Dest::Home),
        (Rule::Home, Command::Move { to, .. } | Command::Draw { to, .. }) => {
            assert_eq!(to, Dest::Home);
            assert!(needs(hint.card.unwrap()));
        }
        (rule, Command::Move { from, to }) => {
            let card = hint.card.unwrap();
            assert_eq!(game.top(from), Some(card));
            let under = game.fans()[from]
                .len()
                .checked_sub(2)
                .map(|i| game.fans()[from][i]);
            assert_eq!(hint.uncovers, under);
            let buries = match to {
                Dest::Fan(t) => game.fans()[t]
                    .iter()
                    .any(|x| x.suit() == card.suit() && x.rank() < card.rank()),
                Dest::Home => unreachable!("home moves are rule home"),
            };
            match rule {
                Rule::Dig => assert!(under.is_some_and(needs)),
                Rule::King => assert!(card.rank() == 13 && hint.onto.is_none()),
                Rule::Uncover => assert!(under.is_some() && !buries),
                Rule::Build => assert!(under.is_none() && !buries && hint.onto.is_some()),
                Rule::LeastBad => assert!(buries),
                other => panic!("{other:?} on a move"),
            }
        }
        (rule, command) => panic!("{rule:?} does not fit {command:?}"),
    }
}

fn play_out(seed: u64, rules: Rules) -> Game {
    let mut game = Game::new(seed, rules);
    for _ in 0..2_000 {
        let legal = game.legal();
        if legal.is_empty() {
            return game;
        }
        let hint = game.hint().expect("a hint while play remains");
        assert!(
            legal.contains(&hint.command),
            "seed {seed}: {hint:?} is not legal"
        );
        rule_is_true(&game, &hint);
        game.apply(hint.command).unwrap();
    }
    panic!("seed {seed}: the game did not end in 2000 moves");
}

fn win_rate(rules: Rules, games: u64) -> f64 {
    let started = Instant::now();
    let wins = (0..games)
        .filter(|&seed| {
            let game = play_out(seed, rules);
            assert!(game.won() || game.lost());
            game.won()
        })
        .count();
    let rate = 100.0 * wins as f64 / games as f64;
    println!(
        "rules {}: {wins}/{games} won ({rate:.1}%) in {:.1?}",
        rules.code(),
        started.elapsed()
    );
    rate
}

#[test]
fn hint_play_ends_legally_and_wins_often_under_classic() {
    let rate = win_rate(Rules::from_code(preset::CLASSIC), GAMES);
    assert!(
        rate > 2.0,
        "hint play should beat random play by a wide margin: {rate}%"
    );
}

#[test]
fn hint_play_ends_legally_under_the_other_presets() {
    for code in [preset::WITH_THE_DRAW, preset::THE_FAN, preset::TREFOIL] {
        win_rate(Rules::from_code(code), OTHER_GAMES);
    }
}
