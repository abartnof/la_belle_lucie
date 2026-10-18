//! La Belle Lucie as a protocol (docs/PROTOCOL.md): a command in as one line of
//! text, the whole state out as JSON. No wasm-bindgen and no serde: the
//! module has four exports and the JSON is written by hand, which keeps it
//! small. The page holds no rules; it draws `state` and sends commands.
//!
//! [`Session`] is the protocol with no WebAssembly in it, so it is tested
//! natively; [`ffi`] wraps one in the exports the page calls.

use la_belle_lucie_core::{Command, Game};

/// Bump when the state's shape changes in a way a client must notice.
pub const PROTOCOL: u32 = 1;

pub struct Session {
    game: Game,
}

impl Session {
    pub fn new(seed: u32) -> Session {
        Session {
            game: Game::new(u64::from(seed)),
        }
    }

    /// Carries out one command line; true if it was accepted.
    pub fn send(&mut self, line: &str) -> bool {
        match Command::parse(line) {
            Some(command) => self.game.apply(command).is_ok(),
            None => false,
        }
    }

    /// The state as JSON: what a client needs to draw the table and nothing
    /// it could use to cheat (here the stock is a count, not its cards).
    pub fn state(&self) -> String {
        let hand: Vec<String> = self
            .game
            .hand()
            .iter()
            .map(|c| format!("\"{}\"", c.code()))
            .collect();
        let legal: Vec<&str> = self.game.legal().iter().map(|_| "draw").collect();
        let legal: Vec<String> = legal.iter().map(|c| format!("\"{c}\"")).collect();
        format!(
            "{{\"protocol\":{PROTOCOL},\"prompt\":\"play\",\"seed\":{},\"stock\":{},\"hand\":[{}],\"legal\":[{}]}}",
            self.game.seed(),
            self.game.stock(),
            hand.join(","),
            legal.join(","),
        )
    }
}

/// The exports the page calls, prefixed with the game's name so one page
/// could host more than one module. The ABI is the kit's (`loadWasm` in
/// kit/js/engine.js): `_alloc`, `_out`, `_out_len`; the game adds `_new` and `_send`.
pub mod ffi {
    use super::Session;
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
            buffer.resize(len, 0);
            buffer.as_mut_ptr()
        })
    }

    /// Sits down at a new table, discarding any old one.
    #[no_mangle]
    pub extern "C" fn la_belle_lucie_new(seed: u32) {
        SESSION.with(|s| *s.borrow_mut() = Some(Session::new(seed)));
        render();
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
