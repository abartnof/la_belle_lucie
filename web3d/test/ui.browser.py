#!/usr/bin/env python3
"""The overlay (src/ui.js) in a real browser, offline.

    python3 kit/build.py
    ~/piquet/.venv/bin/python web3d/test/ui.browser.py [--page file.html]

Same setup as browser.py (Playwright, system Chromium, file:// page, no network, no
console error). Checks: the tutorial's first pages appear before the first move and can
be skipped; Settings changes persist across a reload; the New game menu (presets with
their sources, rules code in state and URL hash, the confirm); the Hint bubble (exactly
two sentences, gone after a move) and its animated arrow (present, never in the way of a click, gone on dismiss or a move); Undo and Redeal enable and disable; Help reopens a
page; focus stays in a dialog and Escape closes it; play works under
prefers-reduced-motion. The software WebGL is slow: the waits are long on purpose.
Not part of bin/gate.
"""

import argparse
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ("file:", "data:", "blob:")
WAIT = 90_000
SEEN_ALL = '["table","foundations","building","redeal","draw","king"]'
KEY = "la-belle-lucie.prefs"
OPEN = "dialog[open]"


def settle(page):
    page.wait_for_function("window.lbl && window.lbl.state() && !window.lbl.table.busy()", timeout=WAIT)


def fresh(browser, url, problems, requests, tag, seen=SEEN_ALL, hash_="#seed=7&rules=4", reduced=False, clear=True, deal=True):
    ctx = browser.new_context(viewport={"width": 1280, "height": 720}, reduced_motion="reduce" if reduced else "no-preference")
    if clear:
        ctx.add_init_script(f'if (!sessionStorage.getItem("t")) {{ sessionStorage.setItem("t","1"); localStorage.setItem("{KEY}", JSON.stringify({{v: 1, seen: {seen}}})); }}')
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and "injected fault" not in m.text and problems.append(f"{tag}: console error: {m.text}"))
    page.on("pageerror", lambda e: problems.append(f"{tag}: page error: {e}"))
    page.on("request", lambda r: requests.append(r.url))
    page.goto(url + hash_)
    page.wait_for_selector(OPEN + " #lbl-seed", timeout=WAIT)
    if deal:
        page.get_by_role("button", name="Deal", exact=True).click()
        settle(page)
    return ctx, page


def state(page):
    return page.evaluate("window.lbl.state()")


def a_move(st):
    """A legal fan-to-fan or fan-to-home command."""
    return next((m for m in st["legal"] if m.startswith("f") and ">" in m), None)


def play(page, cmd):
    n = state(page)["moves"]
    page.evaluate("(c) => window.lbl.send(c)", cmd)
    page.wait_for_function("(n) => window.lbl.state().moves > n", arg=n, timeout=WAIT)
    settle(page)


def dialog_title(page):
    return page.locator(OPEN + " h2").first.inner_text() if page.locator(OPEN).count() else None


FOLLOW_HINTS = """(stop) => {
  for (let i = 0; i < 400; i++) {
    const st = window.lbl.state();
    if (st.prompt !== "play" || stop(st)) return true;
    window.lbl.send("hint");
    const h = window.lbl.state().hint;
    if (!h) return false;
    window.lbl.send(h.move.startsWith("draw") || h.move === "redeal" ? h.move : "move " + h.move);
  }
  return false;
}"""


def follow_until_stuck(page):
    """Follow the engine's hints until only a redeal is left ."""
    page.evaluate("(" + FOLLOW_HINTS + ")((st) => st.legal.includes('redeal'))")


def table_say(page, want=""):
    """What the live region says: announce() speaks a tick later, and the software WebGL is slow, so wait for `want`."""
    try:
        page.wait_for_function("(w) => document.querySelector('#table-live').textContent.includes(w) && document.querySelector('#table-live').textContent !== ''", arg=want or "", timeout=5000)
    except Exception:
        pass
    return page.inner_text("#table-live")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", default=str(ROOT / "web3d" / "la-belle-lucie.html"))
    args = ap.parse_args()
    path = Path(args.page)
    if not path.exists():
        print(f"{path} is missing: run python3 kit/build.py")
        return 1
    url = path.as_uri()
    problems, requests = [], []
    bad = problems.append

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])

        # ---- the menu comes first
        ctx, page = fresh(browser, url, problems, requests, "first", hash_="", deal=False)
        if page.evaluate("window.lbl.state()") is not None:
            bad("first: nothing may be dealt before Deal is clicked")
        if dialog_title(page) != "New game":
            bad(f"first: the menu should open on load, got {dialog_title(page)!r}")
        if page.input_value("#lbl-seed") != "" or not page.locator("#lbl-p-classic").is_checked():
            bad("first: Classic preselected, deal number empty")
        if page.get_by_role("button", name="Cancel").count():
            bad("first: there is nothing to cancel back to")
        if not page.evaluate("document.activeElement?.closest('dialog[open]') !== null"):
            bad("first: the menu should take focus")
        # Chromium honours preventDefault() on `cancel` only once: the menu must come back however often.
        for n in range(3):
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            if not page.locator(OPEN).count():
                bad(f"first: Escape #{n + 1} closed the first menu for good")
            elif not page.evaluate("document.activeElement?.closest('dialog[open]') !== null"):
                bad(f"first: focus left the first menu after Escape #{n + 1}")
        page.mouse.click(3, 3)  # the backdrop
        page.wait_for_timeout(300)
        if not page.locator(OPEN).count():
            bad("first: a click on the backdrop closed the first menu")
        page.wait_for_timeout(800)
        if page.evaluate("window.lbl.state()") is not None:
            bad("first: still nothing dealt after waiting")
        page.get_by_role("button", name="Deal", exact=True).focus()
        page.keyboard.press("Enter")
        settle(page)
        if page.evaluate("window.lbl.state().rules") != 4 or page.locator(OPEN).count():
            bad("first: Enter on Deal should deal Classic and close the menu")
        # Last rules are remembered; the hash prefills seed and rules.
        page.get_by_role("button", name="New game").first.click()
        page.wait_for_selector(OPEN)
        if not page.get_by_role("button", name="Cancel").count():
            bad("menu from the bar: should be cancellable")
        page.locator("#lbl-p-fan").check()
        page.get_by_role("button", name="Deal", exact=True).click()
        settle(page)
        page.goto(url)
        page.wait_for_selector(OPEN + " #lbl-seed", timeout=WAIT)
        if not page.locator("#lbl-p-fan").is_checked():
            bad("first: the last game's rules should be preselected")
        page.goto(url + "#seed=21&rules=37")
        page.reload()
        page.wait_for_selector(OPEN + " #lbl-seed", timeout=WAIT)
        if page.input_value("#lbl-seed") != "21" or not page.locator("#lbl-p-trefoil").is_checked():
            bad("first: the hash should prefill seed 21 and Trefoil")
        if page.evaluate("window.lbl.state()") is not None:
            bad("first: a hash must not auto-deal")
        ctx.close()

        # ---- tutorial starts at the first deal, not behind the menu
        ctx, page = fresh(browser, url, problems, requests, "tutfirst", seen="[]", deal=False)
        if page.locator("dialog[open] .lbl-tutorial, dialog.lbl-tutorial[open]").count():
            bad("tutfirst: the tutorial must not open behind the menu")
        page.get_by_role("button", name="Deal", exact=True).click()
        page.wait_for_function("document.querySelector('dialog[open] h2')?.textContent === 'The table'", timeout=WAIT)
        ctx.close()

        # ---- end screen: New game opens the menu
        ctx, page = fresh(browser, url, problems, requests, "endscreen")
        # A lost game with no redeals (The Fan) is the quick way to an end: play the first legal move until none is left.
        page.get_by_role("button", name="New game").first.click()
        page.wait_for_selector(OPEN)
        page.locator("#lbl-p-fan").check()
        page.get_by_role("button", name="Deal", exact=True).click()
        page.wait_for_function("window.lbl.state().rules === 16", timeout=WAIT)
        page.evaluate("""() => {
          for (let i = 0; i < 300; i++) {
            const st = window.lbl.state();
            if (st.prompt !== "play") break;
            const m = st.legal.find((x) => x.startsWith("f") && x.includes(">"));
            if (!m) break;
            window.lbl.send("move " + m);
          }
        }""")
        settle(page)
        if state(page)["prompt"] == "play":
            bad("endscreen: could not reach an end")
        else:
            page.wait_for_selector(".lbl-end:not([hidden])", timeout=WAIT)
            page.locator(".lbl-end").get_by_role("button", name="New game").click()
            page.wait_for_selector(OPEN + " #lbl-seed")
            if dialog_title(page) != "New game" or not page.get_by_role("button", name="Cancel").count():
                bad("endscreen: New game should open a cancellable menu")
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            if page.locator(OPEN).count():
                bad("endscreen: Escape should cancel the menu")
            seed0 = state(page)["seed"]
            page.locator(".lbl-end").get_by_role("button", name="Same deal again").click()
            page.wait_for_function("window.lbl.state().prompt === 'play'", timeout=WAIT)
            if state(page)["seed"] != seed0 or page.locator(OPEN).count():
                bad("endscreen: Same deal again should redeal at once")
        ctx.close()

        # ---- the tutorial before the first move; skip
        ctx, page = fresh(browser, url, problems, requests, "tutorial", seen="[]")
        page.wait_for_selector(OPEN, timeout=WAIT)
        if state(page)["moves"] != 0:
            bad("tutorial: should appear before the first move")
        if dialog_title(page) != "The table":
            bad(f"tutorial: first page should be 'The table', got {dialog_title(page)!r}")
        page.get_by_role("button", name="Got it").click()
        page.wait_for_function("document.querySelector('dialog[open] h2')?.textContent === 'The foundations'", timeout=WAIT)
        page.get_by_role("button", name="Skip the tutorial").click()
        page.wait_for_timeout(500)
        if page.locator(OPEN).count():
            bad("tutorial: skipping should leave no dialog open")
        stored = page.evaluate(f'JSON.parse(localStorage.getItem("{KEY}")).seen')
        if not {"table", "foundations", "building"} <= set(stored):
            bad(f"tutorial: skip should be remembered, seen={stored!r}")
        ctx.close()

        # ---- settings persist
        ctx, page = fresh(browser, url, problems, requests, "settings")
        hint = page.get_by_role("button", name="Hint")
        if not hint.is_visible():
            bad("settings: Hint button should show by default")
        page.get_by_role("button", name="Settings").click()
        page.wait_for_selector(OPEN)
        page.locator("#lbl-s-hints").uncheck()
        page.locator("#lbl-s-home").check()
        page.locator("#lbl-s-speed").select_option("instant")
        if hint.is_visible():
            bad("settings: hints off should hide the Hint button")
        page.get_by_role("button", name="Done").click()
        page.reload()
        page.wait_for_selector(OPEN + " #lbl-seed", timeout=WAIT)
        if page.locator("#lbl-n-hints").is_checked() or not page.locator("#lbl-n-home").is_checked():
            bad("settings: the New game menu should show the saved aids")
        page.locator("#lbl-n-hints").check()
        page.get_by_role("button", name="Deal", exact=True).click()
        settle(page)
        if not page.get_by_role("button", name="Hint").is_visible():
            bad("settings: hints turned on in the New game menu should show the Hint button")
        page.get_by_role("button", name="Settings").click()
        page.wait_for_selector(OPEN)
        page.locator("#lbl-s-hints").uncheck()
        page.get_by_role("button", name="Done").click()
        saved = page.evaluate(f'JSON.parse(localStorage.getItem("{KEY}"))')
        if saved.get("hints") is not False or saved.get("autoHome") is not True or saved.get("speed") != "instant":
            bad(f"settings: not saved in localStorage: {saved!r}")
        page.get_by_role("button", name="Settings").click()
        page.wait_for_selector(OPEN)
        if page.locator("#lbl-s-hints").is_checked() or not page.locator("#lbl-s-home").is_checked():
            bad("settings: dialog should show the saved values after reload")
        page.keyboard.press("Escape")
        ctx.close()

        # ---- the New game menu
        ctx, page = fresh(browser, url, problems, requests, "newgame")
        page.get_by_role("button", name="New game").first.click()
        page.wait_for_selector(OPEN)
        text = page.locator(OPEN).inner_text()
        for name, src in [("Classic", "Cadogan, 1874"), ("With the draw", "Dick, 1884"), ("The Fan", "Cavendish, 1890"), ("Trefoil", "Hoffmann, 1892")]:
            if name not in text or src not in text:
                bad(f"newgame: preset {name} with source {src} missing")
        if page.locator("input[name=lbl-preset]").count() != 4:
            bad("newgame: should offer exactly four presets")
        # No game in progress yet (0 moves): no confirm.
        page.locator("#lbl-p-fan").check()
        page.fill("#lbl-seed", "11")
        page.get_by_role("button", name="Deal", exact=True).click()
        page.wait_for_function("window.lbl.state().rules === 16 && window.lbl.state().seed === 11", timeout=WAIT)
        settle(page)
        if "rules=16" not in page.evaluate("location.hash"):
            bad(f"newgame: hash should carry rules=16, got {page.evaluate('location.hash')!r}")
        # Play a move, then the confirm must appear.
        cmd = a_move(state(page))
        if cmd:
            play(page, cmd)
            page.get_by_role("button", name="New game").first.click()
            page.wait_for_selector(OPEN)
            page.locator("#lbl-p-trefoil").check()
            page.get_by_role("button", name="Deal", exact=True).click()
            if not page.locator(".lbl-confirm").is_visible():
                bad("newgame: a game in progress should ask for confirmation")
            if state(page)["rules"] != 16:
                bad("newgame: nothing should be dealt before the confirm")
            page.get_by_role("button", name="Yes, deal anew").click()
            page.wait_for_function("window.lbl.state().rules === 37", timeout=WAIT)
            settle(page)
            if "rules=37" not in page.evaluate("location.hash"):
                bad("newgame: hash should carry rules=37")
            # An option: Kings fill on top of Classic gives a custom code.
            page.get_by_role("button", name="New game").first.click()
            page.wait_for_selector(OPEN)
            page.locator("#lbl-p-classic").check()
            page.locator("#lbl-o-king").check()
            page.get_by_role("button", name="Deal", exact=True).click()
            page.wait_for_function("window.lbl.state().rules === 20", timeout=WAIT)
            # Keep playing leaves the game alone.
        else:
            bad("newgame: no legal move to test the confirm with")
        ctx.close()

        # ---- hint, undo, redeal
        ctx, page = fresh(browser, url, problems, requests, "buttons")
        undo, redeal = page.get_by_role("button", name="Undo"), page.get_by_role("button", name=re.compile("^Redeal"))
        if not undo.is_disabled():
            bad("buttons: Undo should be disabled before any move")
        st = state(page)
        if redeal.is_enabled() != ("redeal" in st["legal"]):
            bad("buttons: Redeal should match state.legal")
        if ("lbl-ready" in (redeal.get_attribute("class") or "")) != ("redeal" in st["legal"]):
            bad("buttons: Redeal should light up exactly when no other move is left")
        cam = "JSON.stringify([window.lbl.table.stage.camera.position, window.lbl.table.stage.camera.fov])"
        cam0 = page.evaluate(cam)
        page.get_by_role("button", name="Hint").click()
        page.wait_for_selector(".lbl-hint:not([hidden])", timeout=WAIT)
        settle(page)
        if page.evaluate(cam) != cam0:
            bad("hint: the table must not reframe when a hint shows")
        arrow = "window.lbl.table.arrow()"
        hint_state = state(page)["hint"]
        if not page.evaluate(arrow):
            bad("hint: an animated arrow should show while a move hint shows")
        else:
            # It never blocks clicks: a click where the arrow starts reaches the card under it.
            spot = page.evaluate("(c) => window.lbl.table.screenOf(c)", hint_state["card"])
            page.mouse.click(spot["x"], spot["y"])
            page.wait_for_function("window.lbl.selected() !== null", timeout=WAIT)
            if page.evaluate("window.lbl.selected().card") != hint_state["card"]:
                bad("hint: a click through the arrow should select the card beneath it")
            if not page.evaluate(arrow):
                bad("hint: choosing a card should keep the hint's arrow")
            if page.evaluate(cam) != cam0:
                bad("hint: the arrow must not move the camera")
        page.locator(".lbl-x").click()
        if page.evaluate(arrow):
            bad("hint: dismissing the hint should remove the arrow")
        page.get_by_role("button", name="Hint").click()
        page.wait_for_selector(".lbl-hint:not([hidden])", timeout=WAIT)
        if not page.evaluate(arrow):
            bad("hint: asking again should bring the arrow back")
        hb = page.locator(".lbl-hint").bounding_box()
        hud = page.locator(".lbl-hud").bounding_box()
        if hb["x"] + hb["width"] > hud["x"] and hb["y"] < hud["y"] + hud["height"]:
            bad("hint: the bubble overlaps the status pill")
        do, why = page.inner_text(".lbl-hint-do"), page.inner_text(".lbl-hint-why")
        sentences = [s for s in re.split(r"(?<=[.!?])\s+", f"{do} {why}".strip()) if s]
        if len(sentences) != 2 or not do.strip().endswith(".") or not why.strip().endswith("."):
            bad(f"hint: should be exactly two sentences, got {sentences!r}")
        cmd = a_move(state(page))
        if cmd:
            play(page, cmd)
            if page.locator(".lbl-hint").is_visible():
                bad("hint: the bubble should clear after a move")
            if page.evaluate(arrow):
                bad("hint: the arrow should go after a move")
            if undo.is_disabled():
                bad("buttons: Undo should be enabled after a move")
            undo.click()
            page.wait_for_function("window.lbl.state().moves === 0", timeout=WAIT)
            settle(page)
            if undo.is_enabled():
                bad("buttons: Undo should be disabled again after undoing to the start")
        # Follow the hints until stuck: the Redeal button must then be lit, and not before.
        for _ in range(120):
            st = state(page)
            if st["prompt"] != "play" or "redeal" in st["legal"]:
                break
            page.evaluate("window.lbl.send('hint')")
            hint = state(page)["hint"]
            if not hint:
                break
            page.evaluate("(m) => window.lbl.send(m.startsWith('draw') ? m : 'move ' + m)", hint["move"])
        st = state(page)
        if "redeal" in st["legal"]:
            if "lbl-ready" not in (redeal.get_attribute("class") or ""):
                bad("buttons: Redeal should be lit when no other move is left")
        else:
            bad(f"buttons: following hints never got stuck (prompt {st['prompt']})")
        # The redeal animation (Random by default): the table is busy while it plays, clicks
        # and commands are ignored, it ends with the table as show() lays it out, and undoing a
        # redeal plays no effect. The clock is stepped by hand; the software WebGL is too slow
        # to time it.
        clock = "window.lbl.table.redealClock"
        page.evaluate(f"{clock}.manual(true)")
        st0 = state(page)
        page.evaluate("window.lbl.send('redeal')")
        if not page.evaluate(f"{clock}.active()") or not page.evaluate("window.lbl.table.busy()"):
            bad("redeal: the default animation should be playing and the table busy")
        if not undo.is_disabled() or not redeal.is_disabled() or not page.get_by_role("button", name="Hint").is_disabled():
            bad("redeal: Undo, Hint and Redeal should be disabled while it plays")
        spot = page.evaluate("(c) => window.lbl.table.screenOf(c)", state(page)["fans"][0][-1])
        page.mouse.click(spot["x"], spot["y"])
        page.evaluate("window.lbl.send('hint')")
        if page.evaluate("window.lbl.selected()") is not None or state(page)["hint"] is not None:
            bad("redeal: clicks and hints should be ignored while it plays")
        steps = 0
        while page.evaluate(f"{clock}.step(0.05)") and steps < 400:
            steps += 1
        if not 5 < steps < 120:  # under 3 s of effect (60 steps) with room for the camera
            bad(f"redeal: the effect should end in under 3 s, took {steps * 0.05:.2f} s")
        page.evaluate(f"{clock}.manual(false)")
        settle(page)
        st1 = state(page)
        if st1["redeals_left"] != st0["redeals_left"] - 1 or undo.is_disabled():
            bad("redeal: after the effect Undo should be enabled and a redeal used")
        for fan, cards in enumerate(st1["fans"]):
            for code in cards[-1:]:
                at = page.evaluate("(c) => window.lbl.table.screenOf(c)", code)
                if not at or at["x"] < 0 or at["x"] > 1280 or at["y"] < 0 or at["y"] > 720:
                    bad(f"redeal: {code} is not on screen after the effect")
        undo.click()
        page.wait_for_function("(n) => window.lbl.state().redeals_left === n", arg=st0["redeals_left"], timeout=WAIT)
        if page.evaluate(f"{clock}.active()"):
            bad("redeal: undoing a redeal should play no effect")
        settle(page)
        # A dropped command is said; a fault in the render loop frees the table; the watchdog
        # frees it when frames stop; the table redraws and plays on afterwards.
        page.evaluate(f"{clock}.manual(true)")
        page.evaluate("window.lbl.send('redeal')")
        page.evaluate("window.lbl.send('hint')")
        if "Wait for the cards to settle" not in table_say(page, "Wait for the cards"):
            bad("redeal: a command dropped while the cards move should be announced")
        page.evaluate(f"{clock}.fault()")
        page.wait_for_function(f"!{clock}.active() && !window.lbl.table.busy()", timeout=WAIT)
        if undo.is_disabled():
            bad("fault: after a fault in the frame the table must be usable again (Undo is still disabled)")
        page.evaluate("window.lbl.send('hint')")
        if state(page)["hint"] is None and state(page)["prompt"] == "play":
            bad("fault: commands must work after a fault in the frame")
        page.evaluate(f"{clock}.manual(false)")
        undo.click()
        page.wait_for_function("(n) => window.lbl.state().redeals_left === n", arg=st0["redeals_left"], timeout=WAIT)
        settle(page)
        page.evaluate(f"{clock}.manual(true)")
        page.evaluate("window.lbl.send('redeal')")
        page.wait_for_function(f"!{clock}.active()", timeout=20_000)  # the watchdog: about 6 s of wall time
        if page.evaluate("window.lbl.table.busy()") or undo.is_disabled():
            bad("watchdog: a stalled effect should be snapped and the table freed")
        page.evaluate(f"{clock}.manual(false)")
        undo.click()
        page.wait_for_function("(n) => window.lbl.state().redeals_left === n", arg=st0["redeals_left"], timeout=WAIT)
        settle(page)
        # "Simple" is the plain slide, with no effect, and the setting persists.
        page.get_by_role("button", name="Settings").click()
        page.wait_for_selector(OPEN)
        options = page.eval_on_selector_all("#lbl-s-redeal option", "(o) => o.map((x) => x.textContent)")
        if options[:2] != ["Random", "Tornado"] or options[-1] != "Simple" or len(options) != 9:
            bad(f"redeal: the Settings list should be Random, the seven effects, Simple: {options!r}")
        if page.input_value("#lbl-s-redeal") != "random":
            bad("redeal: the animation should default to Random")
        page.locator("#lbl-s-redeal").select_option("simple")
        page.keyboard.press("Escape")
        saved = page.evaluate(f'JSON.parse(localStorage.getItem("{KEY}")).redealFx')
        if saved != "simple":
            bad(f"redeal: the animation setting should be saved, got {saved!r}")
        page.evaluate("window.lbl.send('redeal')")
        if page.evaluate(f"{clock}.active()"):
            bad("redeal: Simple should play no effect")
        settle(page)
        # Redeal until none is left: the button goes disabled with 0 redeals.
        for _ in range(3):
            st = state(page)
            if "redeal" not in st["legal"]:
                break
            page.evaluate("window.lbl.send('redeal')")
            page.wait_for_function("(n) => window.lbl.state().redeals_left < n", arg=st["redeals_left"], timeout=WAIT)
            settle(page)
        st = state(page)
        if redeal.is_enabled() != ("redeal" in st["legal"]):
            bad(f"buttons: Redeal enabled={redeal.is_enabled()} but legal={'redeal' in st['legal']} (left {st['redeals_left']})")
        ctx.close()

        # ---- help, focus, Escape
        ctx, page = fresh(browser, url, problems, requests, "help")
        helpb = page.get_by_role("button", name="Help")
        helpb.click()
        page.wait_for_selector(OPEN)
        page.get_by_role("button", name="Building").first.click()
        page.wait_for_function("document.querySelector('dialog[open] h2')?.textContent === 'Building'", timeout=WAIT)
        if page.locator(OPEN).get_by_role("button", name="Skip the tutorial").count():
            bad("help: a page opened from Help should not offer skipping")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        if page.locator(OPEN).count():
            bad("help: Escape should close the page")
        for name in ("Settings", "New game"):
            btn = page.get_by_role("button", name=name).first
            btn.click()
            page.wait_for_selector(OPEN)
            inside = "document.activeElement && document.activeElement.closest('dialog[open]') !== null"
            if not page.evaluate(inside):
                bad(f"focus: {name} dialog should take focus")
            # A modal dialog may hand focus to the browser (body), never to the page behind.
            outside = "document.activeElement !== document.body && !document.activeElement.closest('dialog[open]')"
            for _ in range(25):
                page.keyboard.press("Tab")
                if page.evaluate(outside):
                    bad(f"focus: Tab left the {name} dialog")
                    break
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            if page.locator(OPEN).count():
                bad(f"focus: Escape should close the {name} dialog")
            elif page.evaluate("document.activeElement?.textContent") != name:
                bad(f"focus: after Escape focus should return to {name}, is on {page.evaluate('document.activeElement?.textContent')!r}")
        ctx.close()

        # ---- an effect cut short by a new game is not an error
        ctx, page = fresh(browser, url, problems, requests, "cutshort")
        follow_until_stuck(page)
        settle(page)
        page.get_by_role("button", name="Settings").click()
        page.wait_for_selector(OPEN)
        page.locator("#lbl-s-redeal").select_option("tornado")
        page.keyboard.press("Escape")
        page.evaluate("window.lbl.table.redealClock.manual(true)")
        page.evaluate("window.lbl.send('redeal')")
        if not page.evaluate("window.lbl.table.redealClock.active()"):
            bad("cutshort: the effect did not start")
        page.get_by_role("button", name="New game").first.click()
        page.wait_for_selector(OPEN)
        page.get_by_role("button", name="Deal", exact=True).click()
        page.get_by_role("button", name="Yes, deal anew").click()
        page.wait_for_function("window.lbl.state().moves === 0 && !window.lbl.table.redealClock.active()", timeout=WAIT)
        page.wait_for_timeout(300)  # any console.error is caught by the page listener
        page.evaluate("window.lbl.table.redealClock.manual(false)")
        ctx.close()

        # ---- rules and deal numbers from a shared link are normalised and flagged
        ctx, page = fresh(browser, url, problems, requests, "badlink", hash_="#seed=4294967296&rules=63", deal=False)
        if page.input_value("#lbl-seed") != "4294967296" or not page.locator("#lbl-seed-bad").is_visible():
            bad("badlink: an out-of-range deal number from the hash should be shown with a message, not dropped")
        if page.locator(".lbl-count").inner_text() != "2":
            bad(f"badlink: rules=63 deals with 2 redeals, the menu shows {page.locator('.lbl-count').inner_text()!r}")
        page.get_by_role("button", name="Deal", exact=True).click()
        page.wait_for_timeout(500)
        if state(page) is not None or not page.locator(OPEN).count():
            bad("badlink: an invalid deal number must not deal a random game")
        page.fill("#lbl-seed", "abc")
        page.get_by_role("button", name="Deal", exact=True).click()
        page.wait_for_timeout(300)
        if state(page) is not None or not page.locator("#lbl-seed-bad").is_visible():
            bad("badlink: a typed non-number should be refused with a message")
        page.fill("#lbl-seed", "")
        if page.locator("#lbl-seed-bad").is_visible():
            bad("badlink: the message should go once the number is fixed")
        page.get_by_role("button", name="Deal", exact=True).click()
        settle(page)
        if state(page)["rules"] != 61 or "rules=61" not in page.evaluate("location.hash"):
            bad(f"badlink: rules=63 should be dealt, shown and saved as 61, got {state(page)['rules']}")
        if page.evaluate(f'JSON.parse(localStorage.getItem("{KEY}")).rules') != 61:
            bad("badlink: the saved rules should be the normalised code")
        ctx.close()

        # ---- tutorial dialogs: Escape dismisses, focus returns, a page replaced in place
        ctx, page = fresh(browser, url, problems, requests, "tutdlg", seen="[]")
        page.wait_for_selector(OPEN, timeout=WAIT)
        page.keyboard.press("Escape")
        page.wait_for_timeout(700)
        if page.locator(OPEN).count():
            bad("tutdlg: Escape on a tutorial page should dismiss the tutorial, not open the next page")
        if page.evaluate("document.activeElement?.id") != "stage":
            bad(f"tutdlg: focus should return to the table, is on {page.evaluate('document.activeElement?.tagName')}")
        ctx.close()
        ctx, page = fresh(browser, url, problems, requests, "tutswap", seen="[]")
        page.wait_for_selector(OPEN, timeout=WAIT)
        page.evaluate("window.lbl.ui.showPage('building')")
        page.evaluate("window.lbl.ui.showPage('redeal')")
        page.wait_for_timeout(500)
        if page.locator(OPEN).count() != 1 or dialog_title(page) != "Redeal":
            bad(f"tutswap: a page opened over a page should replace it, got {dialog_title(page)!r}")
        page.get_by_role("button", name="Got it").click()
        page.wait_for_timeout(500)
        if dialog_title(page) not in (None, "The table", "The foundations", "Building"):
            bad(f"tutswap: unexpected dialog {dialog_title(page)!r}")
        # Whatever follows, the dialogs close in the end and focus is never lost to <body>.
        for _ in range(4):
            if not page.locator(OPEN).count():
                break
            page.get_by_role("button", name="Got it").click()
            page.wait_for_timeout(400)
        if page.locator(OPEN).count() or page.evaluate("document.activeElement === document.body"):
            bad("tutswap: after the last page focus should be on a control, not <body>")
        ctx.close()

        # ---- the draw from the keyboard
        ctx, page = fresh(browser, url, problems, requests, "drawkeys", hash_="#seed=3&rules=12", reduced=True)
        page.evaluate("(" + FOLLOW_HINTS + ")((st) => st.legal.some((m) => m.startsWith('draw ')))")
        st = state(page)
        cands = sorted({(int(m[6:].split(":")[0]), int(m.split(":")[1].split(">")[0])) for m in st["legal"] if m.startswith("draw ")})
        if st["draw"] != "ready" or not cands:
            bad(f"drawkeys: could not reach a draw-ready state ({st['draw']})")
        else:
            fan = next(f for f, _ in cands if sum(1 for g, _ in cands if g == f) >= 1)
            here = [pos for f, pos in cands if f == fan]
            page.evaluate("(f) => window.lbl.table.focusFan(f)", fan)
            page.focus("#stage")
            page.keyboard.press("d")
            sel = page.evaluate("window.lbl.selected()")
            if not sel or sel["fan"] != fan or sel["pos"] != here[0] or sel["card"] != st["fans"][fan][here[0]]:
                bad(f"drawkeys: D should choose the first buried card of the fan, got {sel!r}")
            said = table_say(page, "buried")
            if "buried" not in said or " can go " not in said:
                bad(f"drawkeys: the live region should name the card and its targets, said {said!r}")
            if len(here) > 1:
                page.keyboard.press("d")
                if page.evaluate("window.lbl.selected().pos") != here[1]:
                    bad("drawkeys: D again should choose the next buried card")
            page.keyboard.press("d")
            page.keyboard.press("d")
            sel = page.evaluate("window.lbl.selected()")
            dest = [m for m in st["legal"] if m.startswith(f"draw f{fan}:{sel['pos']}>")] if sel else []
            if not dest:
                bad("drawkeys: no legal draw for the chosen card")
            else:
                target = dest[0].split(">")[1]
                before = st["moves"]
                if target == "h":
                    page.keyboard.press("h")
                else:
                    page.evaluate("(f) => window.lbl.table.focusFan(f)", int(target[1:]))
                    page.keyboard.press("Enter")
                page.wait_for_function("(n) => window.lbl.state().moves > n", arg=before, timeout=WAIT)
                if page.evaluate("window.lbl.selected()") is not None:
                    bad("drawkeys: the selection should clear after the draw")
        page.focus("#stage")
        page.evaluate("window.lbl.table.focusFan(0)")
        page.keyboard.press("d")
        if state(page)["draw"] != "ready" and "No buried card" not in table_say(page, "No buried card"):
            bad("drawkeys: D in a fan with nothing to draw should say so")
        ctx.close()

        # ---- reduced motion: play still works, tutorial still shows
        ctx, page = fresh(browser, url, problems, requests, "reduced", seen="[]", reduced=True, clear=True)
        page.wait_for_selector(OPEN, timeout=WAIT)
        if not page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"):
            bad("reduced: emulation did not take")
        page.get_by_role("button", name="Skip the tutorial").click()
        page.wait_for_timeout(300)
        saved = page.evaluate(f'JSON.parse(localStorage.getItem("{KEY}"))')
        if saved.get("speed") not in (None, "instant"):
            bad(f"reduced: speed should default to instant, got {saved.get('speed')!r}")
        cmd = a_move(state(page))
        if cmd:
            before = state(page)
            play(page, cmd)
            if state(page)["moves"] != before["moves"] + 1:
                bad("reduced: a move should count once")
            page.get_by_role("button", name="Undo").click()
            page.wait_for_function("window.lbl.state().moves === 0", timeout=WAIT)
            settle(page)
        page.get_by_role("button", name="Hint").click()
        page.wait_for_selector(".lbl-hint:not([hidden])", timeout=WAIT)
        if page.evaluate("window.lbl.stopped()"):
            bad("reduced: the engine stopped")
        ctx.close()
        browser.close()

    problems += [f"network request: {u}" for u in requests if not u.startswith(LOCAL)]
    print("\n".join(problems) if problems else "ui browser: ok (tutorial, settings, new game, hint, undo/redeal, help, focus, reduced motion)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
