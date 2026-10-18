//! The cards on the table and the plays that move them. No options live here
//! except whether a king may fill an empty fan and whether a draw is open:
//! those come in as arguments, so the hint search can use the same code.

use crate::cards::Card;
use crate::command::{Command, Dest};

/// One card moved, with what is needed to put it back.
#[derive(Clone, Copy, Debug)]
pub struct Step {
    card: Card,
    fan: usize,
    pos: usize,
    to: Dest,
}

#[derive(Clone, Debug)]
pub struct Table {
    /// Each fan bottom to top; an empty fan is an empty slot.
    pub fans: Vec<Vec<Card>>,
    /// Cards home per suit (S, H, D, C): the highest rank home.
    pub home: [u8; 4],
}

impl Table {
    pub fn top(&self, fan: usize) -> Option<Card> {
        self.fans.get(fan)?.last().copied()
    }

    /// Whether the card is the next one its foundation takes.
    pub fn needs(&self, card: Card) -> bool {
        self.home[card.suit() as usize] + 1 == card.rank()
    }

    pub fn home_total(&self) -> usize {
        self.home.iter().map(|&n| n as usize).sum()
    }

    /// Where `card` (taken from fan `from`; `lone` if it is all that fan holds) may go: home, onto a fan's
    /// top card of its suit and one rank up, and, for a king that is not
    /// alone in its fan, into an empty fan.
    fn targets(&self, card: Card, from: usize, lone: bool, king_fills: bool, out: &mut Vec<Dest>) {
        if self.needs(card) {
            out.push(Dest::Home);
        }
        for (to, fan) in self.fans.iter().enumerate() {
            if to == from {
                continue;
            }
            match fan.last() {
                Some(&top) => {
                    if top.suit() == card.suit() && top.rank() == card.rank() + 1 {
                        out.push(Dest::Fan(to));
                    }
                }
                None => {
                    if king_fills && card.rank() == 13 && !lone {
                        out.push(Dest::Fan(to));
                    }
                }
            }
        }
    }

    /// Every play but a redeal: home moves first (top cards, left to right),
    /// then the other moves, then the draws if one is open.
    pub fn moves(&self, king_fills: bool, draw: bool) -> Vec<Command> {
        let mut found = Vec::new();
        let mut targets = Vec::new();
        for (from, fan) in self.fans.iter().enumerate() {
            let Some(&card) = fan.last() else { continue };
            targets.clear();
            self.targets(card, from, fan.len() == 1, king_fills, &mut targets);
            for &to in &targets {
                found.push(Command::Move { from, to });
            }
        }
        // Home moves lead, whatever fan they come from.
        found.sort_by_key(|c| !matches!(c, Command::Move { to: Dest::Home, .. }));
        if draw {
            for (fan, cards) in self.fans.iter().enumerate() {
                let buried = cards.len().saturating_sub(1);
                for (pos, &card) in cards[..buried].iter().enumerate() {
                    targets.clear();
                    self.targets(card, fan, false, king_fills, &mut targets);
                    for &to in &targets {
                        found.push(Command::Draw { fan, pos, to });
                    }
                }
            }
        }
        found
    }

    /// Carries out a move or a draw without checking it.
    pub fn play(&mut self, command: Command) -> Step {
        let (fan, pos, to) = match command {
            Command::Move { from, to } => (from, self.fans[from].len() - 1, to),
            Command::Draw { fan, pos, to } => (fan, pos, to),
            Command::Redeal => unreachable!("a redeal is not a step"),
        };
        let card = self.fans[fan].remove(pos);
        match to {
            Dest::Home => self.home[card.suit() as usize] += 1,
            Dest::Fan(t) => self.fans[t].push(card),
        }
        Step { card, fan, pos, to }
    }

    pub fn undo(&mut self, step: Step) {
        match step.to {
            Dest::Home => self.home[step.card.suit() as usize] -= 1,
            Dest::Fan(t) => {
                self.fans[t].pop();
            }
        }
        self.fans[step.fan].insert(step.pos, step.card);
    }

    /// Plays every top card the foundations take, until none is left; the
    /// steps are appended to `journal`.
    pub fn send_home(&mut self, journal: &mut Vec<Step>) {
        loop {
            let next = (0..self.fans.len()).find(|&f| self.top(f).is_some_and(|c| self.needs(c)));
            match next {
                Some(from) => journal.push(self.play(Command::Move {
                    from,
                    to: Dest::Home,
                })),
                None => break,
            }
        }
    }
}
