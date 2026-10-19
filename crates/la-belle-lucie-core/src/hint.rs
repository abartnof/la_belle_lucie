//! The hint: a depth-first search of the current deal for the line that gets
//! the most cards home, then the first move of that line, named truthfully by
//! the rule it follows (docs/PROTOCOL.md).

use crate::cards::Card;
use crate::command::{Command, Dest};
use crate::game::Game;
use crate::table::{Step, Table};
use std::collections::HashSet;
use std::hash::{BuildHasherDefault, Hasher};

/// The most positions a search looks at; past it the best line so far stands.
pub const NODE_CAP: usize = 60_000;

/// Why a move is advised. `id` is the protocol's name for it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rule {
    Home,
    Dig,
    Uncover,
    Build,
    Redeal,
    Draw,
    King,
    LeastBad,
}

impl Rule {
    pub fn id(self) -> &'static str {
        match self {
            Rule::Home => "home",
            Rule::Dig => "dig",
            Rule::Uncover => "uncover",
            Rule::Build => "build",
            Rule::Redeal => "redeal",
            Rule::Draw => "draw",
            Rule::King => "king",
            Rule::LeastBad => "least_bad",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Hint {
    pub rule: Rule,
    pub command: Command,
    /// The card that moves (none for a redeal).
    pub card: Option<Card>,
    /// The top card it lands on, for a build.
    pub onto: Option<Card>,
    /// The card it leaves showing, for a move from a fan with more cards.
    pub uncovers: Option<Card>,
    /// How many plays (a redeal aside) are open after the hint's move.
    pub open: usize,
    /// For a build: the other build that keeps the most plays open.
    pub alt: Option<Alt>,
}

/// A rival to a hinted build, in the same terms as the hint.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Alt {
    pub command: Command,
    pub card: Card,
    pub onto: Card,
    pub uncovers: Option<Card>,
    pub open: usize,
}

/// Whether landing `card` on fan `to` would bury a lower card of its suit.
fn buries_lower(table: &Table, card: Card, to: Dest) -> bool {
    match to {
        Dest::Home => false,
        Dest::Fan(t) => table.fans[t]
            .iter()
            .any(|x| x.suit() == card.suit() && x.rank() < card.rank()),
    }
}

/// Names a legal command by the rule it follows, in this order: home; dig (it
/// uncovers the card its foundation needs next); king (a king fills an empty
/// fan); uncover (it uncovers a card and buries no lower card of that suit);
/// build (the same, uncovering nothing); redeal; draw; and otherwise
/// least_bad.
pub fn classify(table: &Table, command: Command) -> Hint {
    let mut hint = Hint {
        rule: Rule::LeastBad,
        command,
        card: None,
        onto: None,
        uncovers: None,
        open: 0,
        alt: None,
    };
    match command {
        Command::Redeal => hint.rule = Rule::Redeal,
        Command::Draw { fan, pos, to } => {
            hint.card = table.fans[fan].get(pos).copied();
            if let Dest::Fan(t) = to {
                hint.onto = table.top(t);
            }
            hint.rule = if to == Dest::Home {
                Rule::Home
            } else {
                Rule::Draw
            };
        }
        Command::Move { from, to } => {
            let card = table.top(from).expect("a move takes a top card");
            let cards = &table.fans[from];
            hint.card = Some(card);
            hint.uncovers = cards.len().checked_sub(2).map(|i| cards[i]);
            if let Dest::Fan(t) = to {
                hint.onto = table.top(t);
            }
            let buries = buries_lower(table, card, to);
            hint.rule = if to == Dest::Home {
                Rule::Home
            } else if hint.uncovers.is_some_and(|u| table.needs(u)) {
                Rule::Dig
            } else if hint.onto.is_none() {
                Rule::King
            } else if buries {
                Rule::LeastBad
            } else if hint.uncovers.is_some() {
                Rule::Uncover
            } else {
                Rule::Build
            };
        }
    }
    hint
}

/// How much a move is liked, to try the likelier ones first: a build that
/// buries nothing, then one that uncovers what is needed, empties a fan, or
/// buries nothing lower; draws last.
fn priority(table: &Table, command: Command) -> i32 {
    let Command::Move { from, to } = command else {
        return -1000;
    };
    let card = table.top(from).expect("a move takes a top card");
    let mut score = if buries_lower(table, card, to) {
        0
    } else {
        100
    };
    let fan = &table.fans[from];
    match fan.len().checked_sub(2).map(|i| fan[i]) {
        None => score += 20,
        Some(under) if table.needs(under) => score += 50,
        Some(under) if under.suit() == card.suit() && under.rank() < card.rank() => score -= 30,
        Some(_) => {}
    }
    score
}

/// Splitmix64's finishing mix, to spread a fan's hash before fans are summed.
fn mix(mut x: u64) -> u64 {
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}

/// A hash of a position that does not depend on the order of the fans (their
/// numbers do not matter to what can be reached).
fn hash(table: &Table, draw_open: bool) -> u64 {
    let mut total = u64::from(draw_open);
    for fan in &table.fans {
        let mut h = 0xcbf2_9ce4_8422_2325u64;
        for card in fan {
            h = (h ^ (card.index() as u64 + 1)).wrapping_mul(0x0100_0000_01b3);
        }
        total = total.wrapping_add(mix(h));
    }
    total
}

/// The positions' hashes are already well mixed, so the set uses them as they are.
#[derive(Default)]
struct Identity(u64);

impl Hasher for Identity {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, _: &[u8]) {
        unreachable!("only u64 keys");
    }

    fn write_u64(&mut self, n: u64) {
        self.0 = n;
    }
}

struct Search {
    table: Table,
    king_fills: bool,
    journal: Vec<Step>,
    seen: HashSet<u64, BuildHasherDefault<Identity>>,
    nodes: usize,
    path: Vec<Command>,
    /// The best line so far: cards home at its end, and the line.
    best: Option<(usize, Vec<Command>)>,
    done: bool,
}

impl Search {
    fn dfs(&mut self, draw_open: bool) {
        self.nodes += 1;
        let home = self.table.home_total();
        // More cards home wins; on a tie the shorter line, which is the one
        // found first.
        if !self.path.is_empty() && self.best.as_ref().is_none_or(|(b, _)| home > *b) {
            self.best = Some((home, self.path.clone()));
        }
        if home == Card::COUNT {
            self.done = true;
        }
        if self.done || self.nodes >= NODE_CAP || !self.seen.insert(hash(&self.table, draw_open)) {
            return;
        }
        let mut moves: Vec<(i32, Command)> = self
            .candidates(draw_open)
            .into_iter()
            .map(|m| (-priority(&self.table, m), m))
            .collect();
        moves.sort_by_key(|&(score, _)| score);
        for (_, command) in moves {
            let mark = self.journal.len();
            self.journal.push(self.table.play(command));
            self.table.send_home(&mut self.journal);
            self.path.push(command);
            self.dfs(draw_open && !matches!(command, Command::Draw { .. }));
            self.path.pop();
            while self.journal.len() > mark {
                let step = self.journal.pop().expect("above the mark");
                self.table.undo(step);
            }
            if self.done || self.nodes >= NODE_CAP {
                return;
            }
        }
    }

    /// The moves worth trying: all of them, but a king goes only to the first
    /// of the empty fans, which are all alike.
    fn candidates(&self, draw_open: bool) -> Vec<Command> {
        let first_empty = self.table.fans.iter().position(Vec::is_empty);
        let mut moves = self.table.moves(self.king_fills, draw_open);
        moves.retain(|command| match command {
            Command::Move {
                to: Dest::Fan(t), ..
            }
            | Command::Draw {
                to: Dest::Fan(t), ..
            } => self.table.fans[*t].last().is_some() || Some(*t) == first_empty,
            _ => true,
        });
        moves
    }
}

impl Game {
    /// The plays open once `command` is made (a redeal never counts).
    fn open_after(&self, command: Command) -> usize {
        let mut table = self.table.clone();
        table.play(command);
        let draw = self.draw_open() && !matches!(command, Command::Draw { .. });
        table.moves(self.rules.king_fills, draw).len()
    }

    /// Fills in what a hint says of the plays it leaves open and, for a build,
    /// of the other build that leaves the most open (ties: the one that frees a
    /// card, then the lowest fan).
    fn annotate(&self, mut hint: Hint) -> Hint {
        if hint.command == Command::Redeal {
            return hint;
        }
        hint.open = self.open_after(hint.command);
        let Command::Move {
            to: Dest::Fan(_), ..
        } = hint.command
        else {
            return hint;
        };
        if hint.onto.is_none() {
            return hint;
        }
        let mut best: Option<(usize, bool, Alt)> = None;
        for command in self.legal() {
            let Command::Move {
                from,
                to: Dest::Fan(to),
            } = command
            else {
                continue;
            };
            if command == hint.command {
                continue;
            }
            let (Some(card), Some(onto)) = (self.table.top(from), self.table.top(to)) else {
                continue;
            };
            let cards = &self.table.fans[from];
            let uncovers = cards.len().checked_sub(2).map(|i| cards[i]);
            let open = self.open_after(command);
            let key = (open, uncovers.is_some());
            if best.is_none_or(|(o, f, _)| key > (o, f)) {
                best = Some((
                    open,
                    uncovers.is_some(),
                    Alt {
                        command,
                        card,
                        onto,
                        uncovers,
                        open,
                    },
                ));
            }
        }
        hint.alt = best.map(|(_, _, alt)| alt);
        hint
    }

    /// The best first move: a move home if there is one (always right), else
    /// the first move of the line of the current deal that ends with the most
    /// cards home (a win outranks all); with no move, a redeal.
    pub fn hint(&self) -> Option<Hint> {
        let legal = self.legal();
        if let Some(&home) = legal
            .iter()
            .find(|c| matches!(c, Command::Move { to: Dest::Home, .. }))
        {
            return Some(self.annotate(classify(&self.table, home)));
        }
        let mut plan = self.plan.borrow_mut();
        if !plan.first().is_some_and(|c| legal.contains(c)) {
            *plan = self.best_line();
        }
        let command = match plan.first() {
            Some(&first) => first,
            None if legal.contains(&Command::Redeal) => Command::Redeal,
            None => return None,
        };
        Some(self.annotate(classify(&self.table, command)))
    }

    /// The best line of moves through the current deal, up to the node cap.
    /// Empty when nothing can be played but a redeal.
    fn best_line(&self) -> Vec<Command> {
        let mut search = Search {
            table: self.table.clone(),
            king_fills: self.rules.king_fills,
            journal: Vec::new(),
            seen: HashSet::default(),
            nodes: 0,
            path: Vec::new(),
            best: None,
            done: false,
        };
        search.dfs(self.draw_open());
        search.best.map(|(_, line)| line).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{card, game, mv};
    use crate::Dest::{Fan, Home};

    fn rule_of(layout: &str, code: u32, home: [u8; 4], command: Command) -> Hint {
        let g = game(code, layout, home);
        assert!(
            g.legal().contains(&command),
            "{command:?} is legal in {layout}"
        );
        classify(&g.table, command)
    }

    #[test]
    fn a_move_home_is_home() {
        let h = rule_of("9C 5H / 2S AS", 4, [0; 4], mv(1, Home));
        assert_eq!(
            (h.rule, h.card, h.onto, h.uncovers),
            (Rule::Home, Some(card("AS")), None, Some(card("2S")))
        );
    }

    #[test]
    fn digging_out_the_card_a_foundation_needs_is_dig() {
        // Moving 3H uncovers 2S, which the spades foundation (ace home) takes next.
        let h = rule_of("2S 3H / 9C 4H", 4, [1, 0, 0, 0], mv(0, Fan(1)));
        assert_eq!(h.rule, Rule::Dig);
        assert_eq!(
            (h.card, h.onto, h.uncovers),
            (Some(card("3H")), Some(card("4H")), Some(card("2S")))
        );
    }

    #[test]
    fn uncovering_without_burying_a_lower_card_is_uncover() {
        let h = rule_of("8C 3H / 9C 4H", 4, [0; 4], mv(0, Fan(1)));
        assert_eq!(h.rule, Rule::Uncover);
        assert_eq!(h.uncovers, Some(card("8C")));
    }

    #[test]
    fn a_build_that_uncovers_nothing_and_buries_nothing_is_build() {
        let h = rule_of("3H / 9C 4H", 4, [0; 4], mv(0, Fan(1)));
        assert_eq!((h.rule, h.uncovers), (Rule::Build, None));
    }

    #[test]
    fn a_king_into_an_empty_fan_is_king() {
        let h = rule_of("- / 5S KH", 16, [0; 4], mv(1, Fan(0)));
        assert_eq!(
            (h.rule, h.onto, h.uncovers),
            (Rule::King, None, Some(card("5S")))
        );
    }

    #[test]
    fn a_build_that_buries_a_lower_card_of_its_suit_is_least_bad() {
        // 3H would lie over 2H.
        let h = rule_of("8C 3H / 2H 4H", 4, [0; 4], mv(0, Fan(1)));
        assert_eq!(h.rule, Rule::LeastBad);
        // Even a lone card: 3H onto 4H over 2H.
        let h = rule_of("3H / 2H 4H", 4, [0; 4], mv(0, Fan(1)));
        assert_eq!(h.rule, Rule::LeastBad);
    }

    #[test]
    fn a_redeal_and_a_draw_have_their_own_names() {
        let h = rule_of("6H 9C / 7H 8D", 4, [0; 4], Command::Redeal);
        assert_eq!(
            (h.rule, h.card, h.onto, h.uncovers),
            (Rule::Redeal, None, None, None)
        );
        let draw = Command::Draw {
            fan: 0,
            pos: 0,
            to: Fan(1),
        };
        let h = rule_of("6H 9C / 8D 7H", 8, [0; 4], draw);
        assert_eq!(
            (h.rule, h.card, h.onto),
            (Rule::Draw, Some(card("6H")), Some(card("7H")))
        );
        let home = Command::Draw {
            fan: 0,
            pos: 0,
            to: Home,
        };
        let h = rule_of("AH 9C / 8D 7H", 8, [0; 4], home);
        assert_eq!(h.rule, Rule::Home);
    }

    #[test]
    fn the_hint_is_a_home_move_when_one_exists() {
        let g = game(4, "9C 5H / 2S AS / 6S 7H", [0; 4]);
        let h = g.hint().unwrap();
        assert_eq!((h.rule, h.command), (Rule::Home, mv(1, Home)));
    }

    #[test]
    fn the_hint_avoids_the_move_that_buries_the_ace() {
        // 3H onto 4H would bury AH; 4H onto 5H frees it, and the rest follows.
        let g = game(4, "2H 3H / AH 4H / 9C 5H", [0; 4]);
        let h = g.hint().unwrap();
        assert_eq!(h.command, mv(1, Fan(2)));
        assert_eq!(h.rule, Rule::Dig);
        assert_eq!(h.uncovers, Some(card("AH")));
    }

    #[test]
    fn following_the_hint_plays_a_suit_out_to_the_end() {
        // 4S onto 5S frees the ace; the 3S must then go onto the 4S before
        // the 2S can go home.
        let mut g = game(0, "2S 3S / AS 4S / 9C 5S", [0; 4]);
        let mut steps = 0;
        while let Some(h) = g.hint() {
            g.apply(h.command).unwrap();
            steps += 1;
            assert!(steps < 50);
        }
        assert_eq!(g.home()[0], 5, "{:?}", g.fans());
    }

    #[test]
    fn with_only_a_redeal_the_hint_is_the_redeal() {
        let g = game(4, "6H 9C / 7H 8D", [0; 4]);
        assert_eq!(g.hint().unwrap().command, Command::Redeal);
        assert_eq!(g.hint().unwrap().rule, Rule::Redeal);
    }

    #[test]
    fn with_only_a_draw_the_hint_is_the_draw() {
        let g = game(8, "6H 9C / 8D 7H", [0; 4]);
        let h = g.hint().unwrap();
        assert_eq!(
            h.command,
            Command::Draw {
                fan: 0,
                pos: 0,
                to: Fan(1)
            }
        );
        assert_eq!(h.rule, Rule::Draw);
    }

    #[test]
    fn the_hint_draws_the_buried_card_that_helps_most() {
        // Drawing 6S onto 7S frees nothing; drawing AH sends two cards home.
        let g = game(8, "9C AH 2H / 6S 8D / 4C 7S", [0; 4]);
        assert_eq!(g.legal().len(), 2);
        let h = g.hint().unwrap();
        assert_eq!(
            h.command,
            Command::Draw {
                fan: 0,
                pos: 1,
                to: Home
            }
        );
        assert_eq!(h.rule, Rule::Home);
    }

    #[test]
    fn no_hint_when_won_or_lost() {
        let g = game(0, "6H 9C / 7H 8D", [0; 4]);
        assert!(g.lost());
        assert_eq!(g.hint(), None);
        let g = game(0, "-", [13; 4]);
        assert!(g.won());
        assert_eq!(g.hint(), None);
    }

    #[test]
    fn the_search_stops_at_its_cap() {
        // A fresh deal under the classic rules finishes and gives a legal hint.
        for seed in 0..5 {
            let g = Game::new(seed, crate::Rules::from_code(4));
            let h = g.hint().unwrap();
            assert!(g.legal().contains(&h.command));
        }
    }

    /// The moves open after a command: what `legal` would list, redeal aside.
    fn open_after(g: &Game, command: Command) -> usize {
        let mut after = g.clone();
        after.apply(command).unwrap();
        after
            .legal()
            .iter()
            .filter(|c| **c != Command::Redeal)
            .count()
    }

    #[test]
    fn a_hint_counts_the_moves_it_leaves_open() {
        let g = game(4, "KS 3H / 9C 4H / 8D 2C / 7S 3C / QD", [0; 4]);
        let h = g.hint().unwrap();
        assert_eq!(h.open, open_after(&g, h.command));
    }

    #[test]
    fn a_build_names_its_best_rival() {
        // Two builds: 3H onto 4H (frees KS) and 2C onto 3C (frees 8D).
        let g = game(4, "KS 3H / 9C 4H / 8D 2C / 7S 3C / QD", [0; 4]);
        let h = g.hint().unwrap();
        let alt = h.alt.expect("another build exists");
        assert_ne!(alt.command, h.command);
        assert!(g.legal().contains(&alt.command));
        assert_eq!(alt.open, open_after(&g, alt.command));
        // Of the other builds, none keeps more moves open.
        for c in g.legal() {
            if let Command::Move { to: Fan(t), .. } = c {
                if c != h.command && g.table.top(t).is_some() {
                    assert!(open_after(&g, c) <= alt.open);
                }
            }
        }
    }

    #[test]
    fn no_rival_when_there_is_no_other_build() {
        let g = game(4, "KS 3H / 9C 4H / 8D", [0; 4]);
        let h = g.hint().unwrap();
        assert_eq!(h.alt, None);
        let g = game(4, "9C 5H / 2S AS", [0; 4]);
        assert_eq!(g.hint().unwrap().alt, None, "a move home has no rival");
    }
}
