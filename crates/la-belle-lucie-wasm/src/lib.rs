//! La Belle Lucie as a protocol (docs/PROTOCOL.md): a command in as one line of
//! text, the whole state out as JSON. No wasm-bindgen and no serde: the
//! module has four exports and the JSON is written by hand, which keeps it
//! small. The page holds no rules; it draws `state` and sends commands.
//!
//! [`Session`] is the protocol with no WebAssembly in it, so it is tested
//! natively; [`ffi`] wraps one in the exports the page calls.

use la_belle_lucie_core::{parse_layout, Card, Command, Game, Hint, Rules};

/// Bump when the state's shape changes in a way a client must notice.
pub const PROTOCOL: u32 = 2;

#[derive(Clone)]
pub struct Session {
    game: Game,
    /// Set by `hint`, cleared by any other accepted command.
    hint: Option<Hint>,
}

/// A card as a JSON string, or null.
fn card_json(card: Option<Card>) -> String {
    card.map_or_else(|| "null".to_string(), |c| format!("\"{}\"", c.code()))
}

fn hint_json(hint: &Hint) -> String {
    let alt = hint.alt.map_or_else(
        || "null".to_string(),
        |a| {
            format!(
                "{{\"move\":\"{}\",\"card\":\"{}\",\"onto\":\"{}\",\"uncovers\":{},\"open\":{}}}",
                a.command.text(),
                a.card.code(),
                a.onto.code(),
                card_json(a.uncovers),
                a.open,
            )
        },
    );
    format!(
        "{{\"rule\":\"{}\",\"move\":\"{}\",\"card\":{},\"onto\":{},\"uncovers\":{},\"open\":{},\"alt\":{}}}",
        hint.rule.id(),
        hint.command.text(),
        card_json(hint.card),
        card_json(hint.onto),
        card_json(hint.uncovers),
        hint.open,
        alt,
    )
}

impl Session {
    pub fn new(seed: u32, rules: u32) -> Session {
        Session {
            game: Game::new(u64::from(seed), Rules::from_code(rules)),
            hint: None,
        }
    }

    /// Replaces the table with the layout game of `text` (docs/PROTOCOL.md);
    /// false, and nothing changes, if the layout is refused.
    pub fn lesson(&mut self, text: &str, rules: u32) -> bool {
        let Ok((fans, home)) = parse_layout(text) else {
            return false;
        };
        self.game = Game::from_layout(Rules::from_code(rules), fans, home);
        self.hint = None;
        true
    }

    /// Carries out one command line; true if it was accepted.
    pub fn send(&mut self, line: &str) -> bool {
        match line.trim() {
            "hint" => {
                self.hint = self.game.hint();
                return true;
            }
            "undo" => {
                let undone = self.game.undo().is_ok();
                if undone {
                    self.hint = None;
                }
                return undone;
            }
            _ => {}
        }
        let accepted = Command::parse(line).is_some_and(|c| self.game.apply(c).is_ok());
        if accepted {
            self.hint = None;
        }
        accepted
    }

    /// The state as JSON: the table, what may be played, and the hint if one
    /// was asked for.
    pub fn state(&self) -> String {
        let game = &self.game;
        let rules = game.rules();
        let fans: Vec<String> = game
            .fans()
            .iter()
            .map(|fan| {
                let cards: Vec<String> = fan.iter().map(|c| format!("\"{}\"", c.code())).collect();
                format!("[{}]", cards.join(","))
            })
            .collect();
        let home: Vec<String> = game.home().iter().map(u8::to_string).collect();
        let legal: Vec<String> = game
            .legal()
            .iter()
            .map(|c| format!("\"{}\"", c.text()))
            .collect();
        let prompt = if game.won() {
            "won"
        } else if game.lost() {
            "lost"
        } else {
            "play"
        };
        format!(
            "{{\"protocol\":{PROTOCOL},\"prompt\":\"{prompt}\",\"seed\":{},\"rules\":{},\
\"options\":{{\"inorder\":{},\"redeals\":{},\"draw\":{},\"king\":{},\"trefoil\":{}}},\
\"fans\":[{}],\"home\":[{}],\"redeals_left\":{},\"draw\":\"{}\",\"moves\":{},\
\"legal\":[{}],\"undoable\":{},\"hint\":{}}}",
            game.seed(),
            rules.code(),
            rules.in_order,
            rules.redeals,
            rules.draw,
            rules.king_fills,
            rules.trefoil,
            fans.join(","),
            home.join(","),
            game.redeals_left(),
            game.draw_state().code(),
            game.record().len(),
            legal.join(","),
            !game.record().is_empty(),
            self.hint
                .as_ref()
                .map_or_else(|| "null".to_string(), hint_json),
        )
    }
}

/// The exports the page calls, prefixed with the game's name so one page
/// could host more than one module. The ABI is the kit's (`loadWasm` in
/// kit/js/engine.js): `_alloc`, `_out`, `_out_len`; the game adds `_new` and `_send`.
pub mod ffi {
    use super::Session;

    /// The longest command the input buffer holds.
    const MAX_COMMAND: usize = 4096;
    use std::cell::RefCell;

    thread_local! {
        static SESSION: RefCell<Option<Session>> = const { RefCell::new(None) };
        static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
        static IN: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    }

    /// A buffer of `len` bytes for the host to write a command into. Valid
    /// until the next call to this function.
    #[no_mangle]
    pub extern "C" fn la_belle_lucie_alloc(len: usize) -> *mut u8 {
        IN.with(|buffer| {
            let mut buffer = buffer.borrow_mut();
            buffer.clear();
            // A command is a few bytes: a host asking for more than a page is wrong, and an
            // allocation that fails would trap the module.
            buffer.resize(len.min(MAX_COMMAND), 0);
            buffer.as_mut_ptr()
        })
    }

    /// Sits down at a new table, discarding any old one.
    #[no_mangle]
    pub extern "C" fn la_belle_lucie_new(seed: u32, rules: u32) {
        SESSION.with(|s| *s.borrow_mut() = Some(Session::new(seed, rules)));
        render();
    }

    /// Starts a layout game from the text in the `len` bytes just written
    /// (replacing any table); 1 if it parsed, else 0 and the old table stays.
    #[no_mangle]
    pub extern "C" fn la_belle_lucie_lesson(len: usize, rules: u32) -> u32 {
        let text = IN.with(|buffer| {
            let buffer = buffer.borrow();
            String::from_utf8_lossy(&buffer[..len.min(buffer.len())]).into_owned()
        });
        let started = SESSION.with(|s| {
            let mut s = s.borrow_mut();
            let session = s.get_or_insert_with(|| Session::new(0, rules));
            session.lesson(&text, rules)
        });
        render();
        u32::from(started)
    }

    /// Carries out the command in the `len` bytes just written; 1 if accepted.
    #[no_mangle]
    pub extern "C" fn la_belle_lucie_send(len: usize) -> u32 {
        let command = IN.with(|buffer| {
            let buffer = buffer.borrow();
            String::from_utf8_lossy(&buffer[..len.min(buffer.len())]).into_owned()
        });
        let accepted = SESSION.with(|s| {
            s.borrow_mut()
                .as_mut()
                .is_some_and(|session| session.send(&command))
        });
        render();
        u32::from(accepted)
    }

    /// Where the state, as UTF-8 JSON, begins. Valid until the next call.
    #[no_mangle]
    pub extern "C" fn la_belle_lucie_out() -> *const u8 {
        OUT.with(|out| out.borrow().as_ptr())
    }

    #[no_mangle]
    pub extern "C" fn la_belle_lucie_out_len() -> usize {
        OUT.with(|out| out.borrow().len())
    }

    fn render() {
        let json = SESSION.with(|s| {
            s.borrow()
                .as_ref()
                .map_or_else(|| "null".to_string(), Session::state)
        });
        OUT.with(|out| *out.borrow_mut() = json.into_bytes());
    }
}
