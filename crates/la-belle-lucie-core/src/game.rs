//! The game: the deal, the plays, the record. The rules are in docs/RULES.md.

use crate::cards::Card;
use crate::command::Command;
use crate::rules::Rules;
use crate::table::Table;
use cardkit_rng::Rng;
use std::cell::RefCell;
use std::fmt;

/// What each stream drawn from the game's seed is for. Each purpose has a
/// stream of its own, so drawing for one never moves another: how much an
/// agent thinks never changes the cards. These numbers are the game's, not
/// the toolkit's; never renumber them once a seed has been published.
pub mod purpose {
    /// The shuffle of the pack. Redeal k (1-based) shuffles with stream k.
    pub const DEALS: u64 = 0;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Illegal {
    /// The command is not among `legal()`.
    NotLegal,
    /// Undo at the start of a game.
    NothingToUndo,
}

impl Illegal {
    /// A stable code the client turns into words; the engine speaks no prose.
    pub fn code(self) -> &'static str {
        match self {
            Illegal::NotLegal => "not_legal",
            Illegal::NothingToUndo => "nothing_to_undo",
        }
    }
}

impl fmt::Display for Illegal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.code())
    }
}

/// Where the draw stands, as the protocol names it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DrawState {
    Off,
    Later,
    Ready,
    Used,
}

impl DrawState {
    pub fn code(self) -> &'static str {
        match self {
            DrawState::Off => "off",
            DrawState::Later => "later",
            DrawState::Ready => "ready",
            DrawState::Used => "used",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Game {
    pub(crate) seed: u64,
    pub(crate) rules: Rules,
    pub(crate) table: Table,
    pub(crate) redeals_left: u8,
    pub(crate) draw_used: bool,
    /// Every command applied, in order: with the seed and rules, the whole game.
    record: Vec<Command>,
    /// The rest of the line the hint search found for this deal, so that
    /// following the hints does not search again; any other play drops it.
    pub(crate) plan: RefCell<Vec<Command>>,
}

/// Fans of three from the cards in order, the first of each three at the
/// bottom; the remainder (1 or 2) makes a short last fan.
fn deal(cards: &[Card]) -> Vec<Vec<Card>> {
    cards.chunks(3).map(<[Card]>::to_vec).collect()
}

impl Game {
    pub fn new(seed: u64, rules: Rules) -> Game {
        let mut pack = Card::pack();
        Rng::stream(seed, purpose::DEALS).shuffle(&mut pack);
        let mut home = [0; 4];
        if rules.trefoil {
            pack.retain(|c| c.rank() != 1);
            home = [1; 4];
        }
        Game {
            seed,
            rules,
            table: Table {
                fans: deal(&pack),
                home,
            },
            redeals_left: rules.redeals,
            draw_used: false,
            record: Vec::new(),
            plan: RefCell::default(),
        }
    }

    /// A game from an explicit layout, for tests. Its record cannot be replayed.
    #[cfg(test)]
    pub(crate) fn from_layout(rules: Rules, fans: Vec<Vec<Card>>, home: [u8; 4]) -> Game {
        Game {
            seed: 0,
            rules,
            table: Table { fans, home },
            redeals_left: rules.redeals,
            draw_used: false,
            record: Vec::new(),
            plan: RefCell::default(),
        }
    }

    pub fn seed(&self) -> u64 {
        self.seed
    }

    pub fn rules(&self) -> Rules {
        self.rules
    }

    pub fn fans(&self) -> &[Vec<Card>] {
        &self.table.fans
    }

    /// Cards home per suit, in suit order S, H, D, C.
    pub fn home(&self) -> [u8; 4] {
        self.table.home
    }

    pub fn redeals_left(&self) -> u8 {
        self.redeals_left
    }

    pub fn record(&self) -> &[Command] {
        &self.record
    }

    /// Whether a draw may be made now (the option, the last deal, not yet used).
    pub(crate) fn draw_open(&self) -> bool {
        self.rules.draw && self.redeals_left == 0 && !self.draw_used
    }

    pub fn draw_state(&self) -> DrawState {
        if !self.rules.draw {
            DrawState::Off
        } else if self.draw_used {
            DrawState::Used
        } else if self.redeals_left == 0 {
            DrawState::Ready
        } else {
            DrawState::Later
        }
    }

    pub fn won(&self) -> bool {
        self.table.home_total() == Card::COUNT
    }

    pub fn lost(&self) -> bool {
        !self.won() && self.legal().is_empty()
    }

    /// What may be played now: the moves and draws, and the redeal only when
    /// there is nothing else.
    pub fn legal(&self) -> Vec<Command> {
        if self.won() {
            return Vec::new();
        }
        let mut moves = self.table.moves(self.rules.king_fills, self.draw_open());
        if moves.is_empty() && self.redeals_left > 0 {
            moves.push(Command::Redeal);
        }
        moves
    }

    pub fn apply(&mut self, command: Command) -> Result<(), Illegal> {
        if !self.legal().contains(&command) {
            return Err(Illegal::NotLegal);
        }
        self.advance_plan(command);
        match command {
            Command::Redeal => self.redeal(),
            Command::Draw { .. } => {
                self.draw_used = true;
                self.table.play(command);
            }
            Command::Move { .. } => {
                self.table.play(command);
            }
        }
        self.record.push(command);
        Ok(())
    }

    /// Keeps the plan if the command is its next move or a move home (which
    /// the search plays at once and leaves out of the line); else drops it.
    fn advance_plan(&mut self, command: Command) {
        let plan = self.plan.get_mut();
        if plan.first() == Some(&command) {
            plan.remove(0);
        } else if !matches!(
            command,
            Command::Move {
                to: crate::Dest::Home,
                ..
            }
        ) {
            plan.clear();
        }
    }

    /// Gathers every card not home (fans left to right, each bottom to top),
    /// shuffles them unless the rules say in order, and deals again. Empty
    /// fans vanish and the fans are renumbered.
    fn redeal(&mut self) {
        let mut cards: Vec<Card> = self.table.fans.iter().flatten().copied().collect();
        if !self.rules.in_order {
            let k = u64::from(self.rules.redeals - self.redeals_left) + 1;
            Rng::stream(self.seed, k).shuffle(&mut cards);
        }
        self.table.fans = deal(&cards);
        self.redeals_left -= 1;
    }

    /// Takes back the last command by replaying the record without it.
    pub fn undo(&mut self) -> Result<(), Illegal> {
        let (_, rest) = self.record.split_last().ok_or(Illegal::NothingToUndo)?;
        *self = Game::replay(self.seed, self.rules, rest)?;
        Ok(())
    }

    /// The game again from its seed, rules and a record: how undo and saved
    /// games work.
    pub fn replay(seed: u64, rules: Rules, record: &[Command]) -> Result<Game, Illegal> {
        let mut game = Game::new(seed, rules);
        for &command in record {
            game.apply(command)?;
        }
        Ok(game)
    }

    /// The top card of a fan, if it has one.
    pub fn top(&self, fan: usize) -> Option<Card> {
        self.table.top(fan)
    }

    /// The card a command moves.
    pub fn card_of(&self, command: Command) -> Option<Card> {
        match command {
            Command::Move { from, .. } => self.top(from),
            Command::Draw { fan, pos, .. } => self.table.fans.get(fan)?.get(pos).copied(),
            Command::Redeal => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::preset;
    use crate::testing::{card, fans, game, mv};
    use crate::Dest::{Fan, Home};

    fn all_cards(game: &Game) -> Vec<Card> {
        let mut cards: Vec<Card> = game.fans().iter().flatten().copied().collect();
        for (s, &n) in game.home().iter().enumerate() {
            for rank in 1..=n {
                cards.push(Card::new(rank, crate::Suit::ALL[s]));
            }
        }
        cards.sort();
        cards
    }

    #[test]
    fn the_classic_deal_is_seventeen_fans_of_three_and_a_lone_card() {
        let game = Game::new(1, Rules::from_code(preset::CLASSIC));
        let lens: Vec<usize> = game.fans().iter().map(Vec::len).collect();
        assert_eq!(lens.len(), 18);
        assert!(lens[..17].iter().all(|&n| n == 3));
        assert_eq!(lens[17], 1);
        assert_eq!(all_cards(&game), Card::pack());
        assert_eq!(game.home(), [0; 4]);
    }

    #[test]
    fn trefoil_deals_sixteen_fans_with_the_aces_home() {
        let game = Game::new(1, Rules::from_code(preset::TREFOIL));
        assert_eq!(game.fans().len(), 16);
        assert!(game.fans().iter().all(|f| f.len() == 3));
        assert!(game.fans().iter().flatten().all(|c| c.rank() != 1));
        assert_eq!(game.home(), [1; 4]);
        assert_eq!(all_cards(&game), Card::pack());
    }

    #[test]
    fn a_seed_fixes_the_deal_and_another_stream_does_not_move_it() {
        let rules = Rules::from_code(preset::CLASSIC);
        let before = Game::new(5, rules).fans().to_vec();
        let _ = Rng::stream(5, 99).below(10);
        assert_eq!(Game::new(5, rules).fans(), before);
        assert_ne!(Game::new(6, rules).fans(), before);
    }

    #[test]
    fn only_an_ace_goes_home_first_then_the_next_in_suit() {
        let g = game(4, "AS 5H 2S / 3S AH 2H / 4C 9D AC", [0; 4]);
        // Tops: 2S, 2H, AC. Only the ace of clubs is playable home.
        assert!(g.legal().contains(&mv(2, Home)));
        assert!(
            !g.legal().contains(&mv(0, Home)),
            "the 2S needs the ace first"
        );
        assert!(!g.legal().contains(&mv(1, Home)));
        let g = game(4, "AS 5H 2S / 3S AH 2H", [1, 1, 0, 0]);
        assert!(g.legal().contains(&mv(0, Home)));
        assert!(g.legal().contains(&mv(1, Home)));
    }

    #[test]
    fn a_build_needs_the_same_suit_one_rank_higher() {
        let g = game(
            4,
            "9D 9C 6H / 9S 9H 7H / 9D 9C 7S / 2C 3C 7D / 5C 4C 5D",
            [0; 4],
        );
        let legal = g.legal();
        assert!(legal.contains(&mv(0, Fan(1))), "6H onto 7H");
        assert!(!legal.contains(&mv(0, Fan(2))), "6H onto 7S: wrong suit");
        assert!(!legal.contains(&mv(0, Fan(3))), "6H onto 7D: wrong suit");
        assert!(
            !legal.contains(&mv(1, Fan(0))),
            "7H onto 6H: wrong direction"
        );
        assert!(!legal.contains(&mv(4, Fan(3))), "5D onto 7D: two ranks");
    }

    #[test]
    fn a_build_moves_one_card_and_may_empty_a_fan() {
        let mut g = game(4, "6H / 8D 7H", [0; 4]);
        g.apply(mv(0, Fan(1))).unwrap();
        assert_eq!(g.fans()[0], []);
        assert_eq!(g.fans()[1], [card("8D"), card("7H"), card("6H")]);
    }

    #[test]
    fn empty_fans_stay_empty_without_king_fills() {
        let g = game(4, "- / 5S KH 2S / 3S 4S KC", [0; 4]);
        assert!(g
            .legal()
            .iter()
            .all(|c| !matches!(c, Command::Move { to: Fan(0), .. })));
    }

    #[test]
    fn with_king_fills_a_king_may_enter_an_empty_fan_but_nothing_else() {
        let g = game(16, "- / 5S 7S KH / 3S 4S KC / 9D QH", [0; 4]);
        let legal = g.legal();
        assert!(legal.contains(&mv(1, Fan(0))));
        assert!(legal.contains(&mv(2, Fan(0))));
        assert!(!legal.contains(&mv(3, Fan(0))), "a queen may not");
    }

    #[test]
    fn a_lone_card_is_never_moved_to_an_empty_fan() {
        let g = game(16, "- / KH / 5S KC", [0; 4]);
        assert!(
            !g.legal().contains(&mv(1, Fan(0))),
            "a lone king gains nothing"
        );
        assert!(g.legal().contains(&mv(2, Fan(0))));
    }

    #[test]
    fn a_king_may_not_enter_a_fan_that_is_not_empty() {
        let g = game(16, "9D / 5S KC", [0; 4]);
        assert!(!g.legal().contains(&mv(1, Fan(0))));
    }

    #[test]
    fn a_redeal_is_legal_only_when_no_other_move_exists() {
        let g = game(4, "6H / 9D 7H", [0; 4]);
        assert!(
            !g.legal().contains(&Command::Redeal),
            "6H onto 7H is a move"
        );
        let g = game(4, "6H 9C / 7H 8D", [0; 4]);
        assert_eq!(g.legal(), [Command::Redeal]);
        let mut g = game(4, "6H 9C / 7H 8D", [0; 4]);
        assert_eq!(g.apply(mv(0, Fan(1))), Err(Illegal::NotLegal));
    }

    #[test]
    fn with_no_redeals_there_is_no_redeal() {
        let g = game(16, "6H 9C / 7H 8D", [0; 4]);
        assert!(g.legal().is_empty());
        assert!(g.lost());
        let g = game(0, "6H 9C / 7H 8D", [0; 4]);
        assert!(g.lost());
    }

    #[test]
    fn redeal_in_order_gathers_left_to_right_bottom_to_top_and_deals_threes() {
        let mut g = game(5, "AH 2H 3H / 4H 5H 6H / 7H 8H / -/ 9H TH", [0; 4]);
        // Put the unplayable top cards in place: nothing may be playable.
        g.table.fans = fans("9D 2H 3H / 4H 5H 6H / 7H 8H / - / 9H TH");
        g.apply(Command::Redeal).unwrap();
        let expect = fans("9D 2H 3H / 4H 5H 6H / 7H 8H 9H / TH");
        assert_eq!(
            g.fans(),
            expect,
            "in order, a short last fan, empties vanish"
        );
        assert_eq!(g.redeals_left(), 1);
    }

    #[test]
    fn a_short_last_fan_holds_the_remainder() {
        let mut g = game(5, "9D 2H / 4H 5H / 7H", [0; 4]);
        g.apply(Command::Redeal).unwrap();
        assert_eq!(g.fans().len(), 2);
        assert_eq!(
            g.fans()[1].len(),
            2,
            "5 cards: a fan of three and one of two"
        );
    }

    #[test]
    fn a_shuffled_redeal_keeps_the_cards_and_is_reproducible() {
        let layout = "6H 9D 3C / 7H 8D 5C / 5S KD";
        let shuffled = |seed: u64| {
            let mut g = game(4, layout, [0; 4]);
            g.seed = seed;
            g.apply(Command::Redeal).unwrap();
            g
        };
        let (a, b) = (shuffled(3), shuffled(3));
        assert_eq!(a.fans(), b.fans());
        assert_eq!(all_cards(&a), all_cards(&game(4, layout, [0; 4])));
        assert!(
            (4..30).any(|s| shuffled(s).fans() != a.fans()),
            "another seed, another order"
        );
    }

    #[test]
    fn redeals_run_out() {
        let mut g = game(2, "6H 9C / 7H 8D", [0; 4]);
        assert_eq!(g.rules().redeals, 1);
        g.apply(Command::Redeal).unwrap();
        // Make the deal stuck again whatever the shuffle did.
        g.table.fans = fans("6H 9C / 7H 8D");
        assert_eq!(g.redeals_left(), 0);
        assert!(g.legal().is_empty());
        assert!(g.lost());
    }

    #[test]
    fn redeal_k_shuffles_with_stream_k() {
        let rules = Rules::from_code(preset::CLASSIC);
        let mut g = Game::from_layout(rules, fans("6H 9D / 7H 8D 2C"), [0; 4]);
        g.seed = 21;
        let mut cards: Vec<Card> = g.fans().iter().flatten().copied().collect();
        Rng::stream(21, 1).shuffle(&mut cards);
        g.apply(Command::Redeal).unwrap();
        let dealt: Vec<Card> = g.fans().iter().flatten().copied().collect();
        assert_eq!(dealt, cards);
        // The second redeal uses stream 2.
        g.table.fans = fans("6H 9D / 7H 8D 2C");
        let mut cards: Vec<Card> = g.fans().iter().flatten().copied().collect();
        Rng::stream(21, 2).shuffle(&mut cards);
        g.apply(Command::Redeal).unwrap();
        let dealt: Vec<Card> = g.fans().iter().flatten().copied().collect();
        assert_eq!(dealt, cards);
    }

    #[test]
    fn draw_is_off_by_default_and_waits_for_the_last_deal() {
        let layout = "5S AH / 9D 8C";
        let g = game(4, layout, [0; 4]);
        assert_eq!(g.draw_state(), DrawState::Off);
        let g = game(12, layout, [0; 4]);
        assert_eq!(g.draw_state(), DrawState::Later);
        assert!(g.legal().iter().all(|c| !matches!(c, Command::Draw { .. })));
        let g = game(8, layout, [0; 4]);
        assert_eq!(g.draw_state(), DrawState::Ready);
        // AH is the top of fan 0 here, so it is a move, not a draw.
        assert!(!g.legal().contains(&Command::Draw {
            fan: 0,
            pos: 1,
            to: Home
        }));
        let g = game(8, "AH 5S / 9D 8C", [0; 4]);
        assert!(g.legal().contains(&Command::Draw {
            fan: 0,
            pos: 0,
            to: Home
        }));
    }

    #[test]
    fn a_draw_must_be_playable_and_takes_a_buried_card_only() {
        let g = game(8, "AH 5S 9D / 6S 2C 3C / 4C 8D 7S", [0; 4]);
        let draws: Vec<Command> = g
            .legal()
            .into_iter()
            .filter(|c| matches!(c, Command::Draw { .. }))
            .collect();
        // AH (bottom of fan 0) goes home; 6S (bottom of fan 1) onto 7S; 8D onto 9D.
        assert!(draws.contains(&Command::Draw {
            fan: 0,
            pos: 0,
            to: Home
        }));
        assert!(draws.contains(&Command::Draw {
            fan: 1,
            pos: 0,
            to: Fan(2)
        }));
        assert!(draws.contains(&Command::Draw {
            fan: 2,
            pos: 1,
            to: Fan(0)
        }));
        assert_eq!(draws.len(), 3, "nothing unplayable is offered: {draws:?}");
        assert!(
            !draws
                .iter()
                .any(|c| matches!(c, Command::Draw { fan: 0, pos: 2, .. })),
            "tops are moved, not drawn"
        );
    }

    #[test]
    fn the_draw_is_made_once() {
        let mut g = game(8, "AH 5S 9D / 6S 2C 3C / 4C 8D 7S", [0; 4]);
        g.apply(Command::Draw {
            fan: 1,
            pos: 0,
            to: Fan(2),
        })
        .unwrap();
        assert_eq!(g.draw_state(), DrawState::Used);
        assert!(g.legal().iter().all(|c| !matches!(c, Command::Draw { .. })));
        assert_eq!(g.fans()[1], [card("2C"), card("3C")]);
    }

    #[test]
    fn a_drawn_king_may_fill_an_empty_fan() {
        let g = game(8 | 16, "KH 5S / - / 9D 8C", [0; 4]);
        assert!(g.legal().contains(&Command::Draw {
            fan: 0,
            pos: 0,
            to: Fan(1)
        }));
        let g = game(8, "KH 5S / - / 9D 8C", [0; 4]);
        assert!(!g.legal().contains(&Command::Draw {
            fan: 0,
            pos: 0,
            to: Fan(1)
        }));
    }

    #[test]
    fn a_draw_home_can_start_the_run_that_wins() {
        let mut g = game(8, "KC QS / KS JS", [10, 13, 13, 12]);
        assert!(!g.won());
        g.apply(Command::Draw {
            fan: 0,
            pos: 0,
            to: Home,
        })
        .unwrap();
        for from in [1, 0, 1] {
            g.apply(mv(from, Home)).unwrap();
        }
        assert!(g.won());
        assert!(!g.lost());
        assert!(g.legal().is_empty());
    }

    #[test]
    fn lost_means_no_move_redeal_or_draw() {
        let g = game(12, "6H 9C / 7H 8D", [0; 4]);
        assert!(!g.lost(), "redeals remain");
        let g = game(8, "6H 9C / 7H 8D", [0; 4]);
        assert!(g.lost());
        let g = game(8, "6H 9C / 8D 7H", [0; 4]);
        assert!(!g.lost(), "the draw of 6H onto 7H remains");
        assert_eq!(
            g.legal(),
            [Command::Draw {
                fan: 0,
                pos: 0,
                to: Fan(1)
            }]
        );
    }

    #[test]
    fn undo_replays_the_record_and_is_refused_at_the_start() {
        let rules = Rules::from_code(preset::CLASSIC);
        let mut g = Game::new(9, rules);
        assert_eq!(g.undo(), Err(Illegal::NothingToUndo));
        let fresh = g.fans().to_vec();
        let first = g.legal()[0];
        g.apply(first).unwrap();
        g.undo().unwrap();
        assert_eq!(g.fans(), fresh);
        assert!(g.record().is_empty());
    }

    #[test]
    fn undo_across_a_redeal_gives_the_same_shuffle_again() {
        let rules = Rules::from_code(preset::CLASSIC);
        let mut g = Game::new(2, rules);
        // Play on until the first redeal.
        while g.redeals_left() == rules.redeals {
            let c = g.hint().unwrap().command;
            g.apply(c).unwrap();
        }
        let after = g.fans().to_vec();
        g.undo().unwrap();
        assert_eq!(g.redeals_left(), rules.redeals);
        g.apply(Command::Redeal).unwrap();
        assert_eq!(g.fans(), after);
    }

    #[test]
    fn a_record_replays_to_the_same_game() {
        let rules = Rules::from_code(preset::WITH_THE_DRAW);
        let mut g = Game::new(11, rules);
        for _ in 0..40 {
            let Some(c) = g.hint().map(|h| h.command) else {
                break;
            };
            g.apply(c).unwrap();
        }
        let again = Game::replay(11, rules, g.record()).unwrap();
        assert_eq!(again.fans(), g.fans());
        assert_eq!(again.home(), g.home());
    }

    #[test]
    fn a_refused_command_is_not_recorded() {
        let mut g = Game::new(3, Rules::from_code(4));
        assert_eq!(g.apply(Command::Redeal), Err(Illegal::NotLegal));
        assert!(g.record().is_empty());
    }

    /// Random play under every kind of rules: no panic, fifty-two cards always.
    #[test]
    fn random_play_never_loses_a_card_or_panics() {
        for code in [4, 12, 16, 37, 0, 1, 63, 61, 24] {
            for seed in 0..25u64 {
                let mut g = Game::new(seed, Rules::from_code(code));
                let mut rng = Rng::stream(seed, 77);
                for _ in 0..400 {
                    let legal = g.legal();
                    if legal.is_empty() {
                        assert!(g.won() || g.lost());
                        break;
                    }
                    let c = legal[rng.below(legal.len() as u64) as usize];
                    g.apply(c).unwrap();
                    assert_eq!(all_cards(&g), Card::pack(), "rules {code} seed {seed}");
                    if rng.below(20) == 0 && g.undo().is_ok() {
                        assert_eq!(all_cards(&g), Card::pack());
                    }
                }
            }
        }
    }

    #[test]
    fn every_game_from_a_seed_is_reproducible() {
        for seed in 0..10u64 {
            let rules = Rules::from_code(preset::WITH_THE_DRAW);
            let play = || {
                let mut g = Game::new(seed, rules);
                let mut rng = Rng::stream(seed, 5);
                while !g.legal().is_empty() {
                    let legal = g.legal();
                    g.apply(legal[rng.below(legal.len() as u64) as usize])
                        .unwrap();
                }
                g
            };
            let (a, b) = (play(), play());
            assert_eq!(a.record(), b.record());
            assert_eq!(a.fans(), b.fans());
        }
    }
}
