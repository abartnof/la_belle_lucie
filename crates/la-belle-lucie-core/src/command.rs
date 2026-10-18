//! What a player may do, and its text form (docs/PROTOCOL.md).

/// Where a card goes: onto the top of a fan (or into an empty one), or home.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Dest {
    Fan(usize),
    Home,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Command {
    /// The top card of a fan.
    Move {
        from: usize,
        to: Dest,
    },
    /// The card at `pos` (0 = bottom) of a fan, played at once.
    Draw {
        fan: usize,
        pos: usize,
        to: Dest,
    },
    Redeal,
}

impl Dest {
    fn text(self) -> String {
        match self {
            Dest::Fan(f) => format!("f{f}"),
            Dest::Home => "h".to_string(),
        }
    }

    fn parse(text: &str) -> Option<Dest> {
        if text == "h" {
            return Some(Dest::Home);
        }
        Some(Dest::Fan(fan(text)?))
    }
}

fn fan(text: &str) -> Option<usize> {
    let digits = text.strip_prefix('f')?;
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}

impl Command {
    /// The form `legal` lists: "f3>h", "f3>f5", "draw f2:1>f5", "redeal".
    pub fn text(self) -> String {
        match self {
            Command::Move { from, to } => format!("f{from}>{}", to.text()),
            Command::Draw { fan, pos, to } => format!("draw f{fan}:{pos}>{}", to.text()),
            Command::Redeal => "redeal".to_string(),
        }
    }

    /// Reads either form of a move, with or without the "move " prefix.
    pub fn parse(text: &str) -> Option<Command> {
        let text = text.trim();
        if text == "redeal" {
            return Some(Command::Redeal);
        }
        if let Some(rest) = text.strip_prefix("draw ") {
            let (source, to) = rest.trim().split_once('>')?;
            let (from, pos) = source.split_once(':')?;
            if pos.is_empty() || !pos.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            return Some(Command::Draw {
                fan: fan(from)?,
                pos: pos.parse().ok()?,
                to: Dest::parse(to)?,
            });
        }
        let rest = text.strip_prefix("move ").unwrap_or(text).trim();
        let (from, to) = rest.split_once('>')?;
        Some(Command::Move {
            from: fan(from)?,
            to: Dest::parse(to)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_form_round_trips() {
        for command in [
            Command::Move {
                from: 3,
                to: Dest::Fan(5),
            },
            Command::Move {
                from: 12,
                to: Dest::Home,
            },
            Command::Draw {
                fan: 2,
                pos: 1,
                to: Dest::Fan(5),
            },
            Command::Draw {
                fan: 2,
                pos: 0,
                to: Dest::Home,
            },
            Command::Redeal,
        ] {
            assert_eq!(Command::parse(&command.text()), Some(command));
        }
    }

    #[test]
    fn the_move_prefix_is_optional() {
        assert_eq!(Command::parse("move f3>f5"), Command::parse("f3>f5"));
        assert!(Command::parse("move f3>f5").is_some());
    }

    #[test]
    fn nonsense_is_refused() {
        for bad in [
            "",
            "fly",
            "f3",
            "f3>",
            "f>h",
            "f3>x",
            "draw f2>h",
            "draw f2:>h",
            "move",
            "f3>f5>h",
            "undo",
        ] {
            assert_eq!(Command::parse(bad), None, "{bad:?}");
        }
    }
}
