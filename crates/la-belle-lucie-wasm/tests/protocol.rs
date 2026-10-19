//! The protocol, driven natively (no WebAssembly): what a client sees.

use la_belle_lucie_wasm::{Session, PROTOCOL};
use serde_json::{json, Value};

const CLASSIC: u32 = 4;

fn state(session: &Session) -> Value {
    serde_json::from_str(&session.state()).expect("the state is valid JSON")
}

fn legal(s: &Value) -> Vec<String> {
    s["legal"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c.as_str().unwrap().to_string())
        .collect()
}

/// A non-redeal legal move, as the string `send` takes.
fn some_move(s: &Value) -> Option<String> {
    legal(s).into_iter().find(|c| c != "redeal")
}

#[test]
fn a_new_table_shows_the_deal_and_what_may_be_played() {
    let s = state(&Session::new(1, CLASSIC));
    assert_eq!(s["protocol"], PROTOCOL);
    assert_eq!(PROTOCOL, 2);
    assert_eq!(s["prompt"], "play");
    assert_eq!(s["seed"], 1);
    assert_eq!(s["rules"], CLASSIC);
    assert_eq!(
        s["options"],
        json!({"inorder": false, "redeals": 2, "draw": false, "king": false, "trefoil": false})
    );
    let fans = s["fans"].as_array().unwrap();
    assert_eq!(fans.len(), 18);
    assert_eq!(fans[17].as_array().unwrap().len(), 1);
    assert_eq!(s["home"], json!([0, 0, 0, 0]));
    assert_eq!(s["redeals_left"], 2);
    assert_eq!(s["draw"], "off");
    assert_eq!(s["moves"], 0);
    assert_eq!(s["undoable"], false);
    assert!(s["hint"].is_null());
}

#[test]
fn trefoil_and_the_draw_show_in_the_state() {
    let s = state(&Session::new(1, 37));
    assert_eq!(s["fans"].as_array().unwrap().len(), 16);
    assert_eq!(s["home"], json!([1, 1, 1, 1]));
    assert_eq!(s["options"]["trefoil"], true);
    assert_eq!(s["options"]["inorder"], true);
    assert_eq!(state(&Session::new(1, 12))["draw"], "later");
    assert_eq!(state(&Session::new(1, 8))["draw"], "ready");
}

#[test]
fn legal_lists_exactly_what_send_accepts() {
    for seed in 0..4 {
        // King fills and the draw both on, so every kind of command occurs.
        let mut session = Session::new(seed, 8 | 16);
        for _ in 0..60 {
            session.send("hint");
            let s = state(&session);
            let legal = legal(&s);
            let mut candidates: Vec<String> = legal.clone();
            for from in 0..19 {
                for to in (0..19).map(|t| format!("f{t}")).chain(["h".to_string()]) {
                    candidates.push(format!("f{from}>{to}"));
                    candidates.push(format!("draw f{from}:1>{to}"));
                    candidates.push(format!("draw f{from}:0>{to}"));
                }
            }
            candidates.push("redeal".to_string());
            for line in candidates {
                let mut probe = session.clone();
                let expected = legal.contains(&line);
                assert_eq!(probe.send(&line), expected, "{line}");
                if line.starts_with('f') {
                    let mut probe = session.clone();
                    assert_eq!(probe.send(&format!("move {line}")), expected, "move {line}");
                }
            }
            let Some(mv) = s["hint"]["move"].as_str() else {
                break;
            };
            session.send(mv);
        }
    }
}

#[test]
fn a_move_is_accepted_with_or_without_its_prefix() {
    let s = state(&Session::new(2, CLASSIC));
    let mv = some_move(&s).expect("a move on the first deal");
    let (mut a, mut b) = (Session::new(2, CLASSIC), Session::new(2, CLASSIC));
    assert!(a.send(&format!("move {mv}")));
    assert!(b.send(&mv));
    assert_eq!(a.state(), b.state());
    let s = state(&a);
    assert_eq!(s["moves"], 1);
    assert_eq!(s["undoable"], true);
}

#[test]
fn nonsense_and_illegal_commands_are_refused_and_change_nothing() {
    let mut session = Session::new(1, CLASSIC);
    let before = session.state();
    for bad in [
        "fly",
        "",
        "move",
        "move f0>f0",
        "move f99>h",
        "draw f0:0>h",
        "redeal",
        "undo",
    ] {
        assert!(!session.send(bad), "{bad:?}");
    }
    assert_eq!(session.state(), before);
}

#[test]
fn undo_takes_back_the_last_command() {
    let mut session = Session::new(3, CLASSIC);
    let before = session.state();
    let mv = some_move(&state(&session)).unwrap();
    assert!(session.send(&mv));
    assert_ne!(session.state(), before);
    assert!(session.send("undo"));
    assert_eq!(session.state(), before);
    assert!(!session.send("undo"), "refused at the start");
}

#[test]
fn the_same_seed_and_commands_give_the_same_table() {
    let (mut a, mut b) = (Session::new(9, CLASSIC), Session::new(9, CLASSIC));
    for _ in 0..20 {
        let Some(mv) = some_move(&state(&a)) else {
            break;
        };
        assert!(a.send(&mv) && b.send(&mv));
    }
    assert_eq!(a.state(), b.state());
    assert_ne!(
        Session::new(10, CLASSIC).state(),
        Session::new(9, CLASSIC).state()
    );
}

#[test]
fn a_hint_is_asked_for_and_cleared_by_the_next_command() {
    let mut session = Session::new(4, CLASSIC);
    assert!(session.send("hint"));
    let s = state(&session);
    let hint = &s["hint"];
    assert!(hint["rule"].is_string());
    let mv = hint["move"].as_str().unwrap().to_string();
    assert!(legal(&s).contains(&mv), "the hinted move is legal");
    assert!(hint["card"].is_string());
    assert!(hint.get("onto").is_some() && hint.get("uncovers").is_some());
    assert!(hint["open"].is_u64(), "the plays left open after the hint");
    let alt = &hint["alt"];
    if !alt.is_null() {
        assert!(legal(&s).contains(&alt["move"].as_str().unwrap().to_string()));
        assert!(alt["card"].is_string() && alt["onto"].is_string() && alt["open"].is_u64());
        assert!(alt.get("uncovers").is_some());
    }
    assert_eq!(s["moves"], 0, "a hint is recorded nowhere");
    assert_eq!(s["undoable"], false);
    // A refused command leaves it; an accepted one clears it.
    assert!(!session.send("fly"));
    assert!(!state(&session)["hint"].is_null());
    assert!(session.send(&mv));
    assert!(state(&session)["hint"].is_null());
    assert_eq!(state(&session)["moves"], 1);
    session.send("hint");
    session.send("undo");
    assert!(state(&session)["hint"].is_null());
}

#[test]
fn the_hint_names_its_rule_and_cards() {
    // Follow the hints to the end; every hint is legal and has a rule id.
    let rules = [
        "home",
        "dig",
        "uncover",
        "build",
        "redeal",
        "draw",
        "king",
        "least_bad",
    ];
    let mut session = Session::new(5, 12);
    for _ in 0..500 {
        session.send("hint");
        let s = state(&session);
        if s["prompt"] != "play" {
            break;
        }
        let hint = &s["hint"];
        assert!(rules.contains(&hint["rule"].as_str().unwrap()), "{hint}");
        let mv = hint["move"].as_str().unwrap();
        if mv == "redeal" {
            assert!(hint["card"].is_null());
        }
        assert!(session.send(mv), "{mv}");
    }
    assert_ne!(state(&session)["prompt"], "play", "the game ends");
}

#[test]
fn a_won_or_lost_table_says_so() {
    let mut session = Session::new(7, 16);
    for _ in 0..500 {
        session.send("hint");
        let s = state(&session);
        if s["prompt"] != "play" {
            assert!(legal(&s).is_empty());
            assert!(s["hint"].is_null());
            let lost = s["prompt"] == "lost";
            assert!(lost || s["home"] == json!([13, 13, 13, 13]));
            session.send("hint");
            assert!(state(&session)["hint"].is_null(), "no hint at the end");
            return;
        }
        let mv = s["hint"]["move"].as_str().unwrap().to_string();
        session.send(&mv);
    }
    panic!("no end");
}

#[test]
fn the_state_never_names_a_card_not_on_the_table() {
    let s = state(&Session::new(4, CLASSIC));
    let on_table: usize = s["fans"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f.as_array().unwrap().len())
        .sum();
    assert_eq!(on_table, 52);
    assert!(s.get("stock").is_none());
}

#[test]
fn redeal_appears_only_when_nothing_else_does() {
    for seed in 0..40 {
        let mut session = Session::new(seed, CLASSIC);
        for _ in 0..400 {
            session.send("hint");
            let s = state(&session);
            let legal = legal(&s);
            if legal.contains(&"redeal".to_string()) {
                assert_eq!(legal, ["redeal"]);
            }
            let Some(h) = s["hint"]["move"].as_str() else {
                break;
            };
            session.send(h);
        }
    }
}
