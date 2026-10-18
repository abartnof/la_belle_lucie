#!/usr/bin/env python3
"""The overlay (src/ui.js) in a real browser, offline.

    python3 kit/build.py
    ~/piquet/.venv/bin/python web3d/test/ui.browser.py [--page file.html]

Same setup as browser.py (Playwright, system Chromium, file:// page, no network, no
console error). Checks: the tutorial's first pages appear before the first move and can
be skipped; Settings changes persist across a reload; the New game menu (presets with
their sources, rules code in state and URL hash, the confirm); the Hint bubble (exactly
two sentences, gone after a move); Undo and Redeal enable and disable; Help reopens a
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


def fresh(browser, url, problems, requests, tag, seen=SEEN_ALL, hash_="#seed=7&rules=4", reduced=False, clear=True):
    ctx = browser.new_context(viewport={"width": 1280, "height": 720}, reduced_motion="reduce" if reduced else "no-preference")
    if clear:
        ctx.add_init_script(f'if (!sessionStorage.getItem("t")) {{ sessionStorage.setItem("t","1"); localStorage.setItem("{KEY}", JSON.stringify({{v: 1, seen: {seen}}})); }}')
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and problems.append(f"{tag}: console error: {m.text}"))
    page.on("pageerror", lambda e: problems.append(f"{tag}: page error: {e}"))
    page.on("request", lambda r: requests.append(r.url))
    page.goto(url + hash_)
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
        settle(page)
        if page.get_by_role("button", name="Hint").is_visible():
            bad("settings: hints off should persist across reload")
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
