//! The protocol, driven natively (no WebAssembly): what a client sees.

use la_belle_lucie_wasm::{Session, PROTOCOL};

fn state(session: &Session) -> serde_json::Value {
    serde_json::from_str(&session.state()).expect("the state is valid JSON")
}

#[test]
fn a_new_table_shows_a_full_stock_and_an_empty_hand() {
    let s = state(&Session::new(1));
    assert_eq!(s["protocol"], PROTOCOL);
    assert_eq!(s["stock"], 52);
    assert_eq!(s["hand"].as_array().unwrap().len(), 0);
    assert_eq!(s["legal"], serde_json::json!(["draw"]));
}

#[test]
fn drawing_is_accepted_and_shows_in_the_state() {
    let mut session = Session::new(1);
    assert!(session.send("draw"));
    let s = state(&session);
    assert_eq!(s["stock"], 51);
    assert_eq!(s["hand"].as_array().unwrap().len(), 1);
}

#[test]
fn nonsense_is_refused_and_changes_nothing() {
    let mut session = Session::new(1);
    let before = session.state();
    assert!(!session.send("fly"));
    assert_eq!(session.state(), before);
}

#[test]
fn the_same_seed_gives_the_same_table() {
    let (mut a, mut b) = (Session::new(9), Session::new(9));
    a.send("draw");
    b.send("draw");
    assert_eq!(a.state(), b.state());
}

#[test]
fn the_state_never_names_a_card_still_in_the_stock() {
    let mut session = Session::new(4);
    session.send("draw");
    let s = state(&session);
    assert!(
        s.get("stock_cards").is_none(),
        "the stock is a count, not its cards"
    );
}
