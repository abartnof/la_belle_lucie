#!/usr/bin/env python3
"""The page in a real browser, offline.

    python3 kit/build.py
    <python with Playwright> web3d/test/browser.py [--page file.html] [--shots dir]

Needs Playwright's Python package and the system Chromium (`/usr/bin/chromium`).
On the development VM piquet's `.venv` has Playwright:
`~/piquet/.venv/bin/python web3d/test/browser.py`. The page is opened from a file:// URL.

Checks what only a browser can show, at a desktop size (1280x720) and a phone's (390x844,
touch): that the page makes no network request (it is one file and must work offline),
that nothing is written to the console in error, that the table renders (a canvas that is
not blank; a screenshot of each size is kept in --shots), that the music is on by default and the speaker button toggles it, that clicking plays (a legal
move from the state, made by clicking its card and then its target, changes the state),
and that the keyboard reaches the table (arrow keys speak into the live region).
The software-rendered WebGL of the VM is slow: the waits are long on purpose.
The overlay has its own test: `~/piquet/.venv/bin/python web3d/test/ui.browser.py`.
Not part of bin/gate (the gate opens no browser); run it before committing a change to
the page.
"""

import argparse
import io
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ("file:", "data:", "blob:")
SIZES = [("desktop", 1280, 720, False), ("phone", 390, 844, True)]
SEEN = '["table","foundations","building","check","redeal","draw","king"]'
WAIT = 90_000


def blank(png: bytes) -> bool:
    """True if the picture is nearly one colour (a canvas that drew nothing)."""
    image = Image.open(io.BytesIO(png)).convert("RGB").resize((96, 96))
    return len(image.getcolors(maxcolors=96 * 96) or []) < 40


def settle(page):
    page.wait_for_function("window.lbl && !window.lbl.table.busy()", timeout=WAIT)


def first_play(state):
    """A legal move that is not the redeal, as (from fan, destination)."""
    for m in state["legal"]:
        if m.startswith("f") and ">" in m:
            src, dest = m[1:].split(">")
            return int(src), dest
    return None


def run_size(browser, page_url, name, w, h, touch, shots, problems, requests):
    context = browser.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch, device_scale_factor=1)
    context.add_init_script(f'localStorage.setItem("la-belle-lucie.prefs", JSON.stringify({{v: 1, seen: {SEEN}}}))')
    page = context.new_page()
    page.on("console", lambda m: m.type == "error" and problems.append(f"{name}: console error: {m.text}"))
    page.on("pageerror", lambda e: problems.append(f"{name}: page error: {e}"))
    page.on("request", lambda r: requests.append(r.url))
    page.goto(page_url + "#seed=7&rules=4")
    # The menu comes first: nothing is dealt until Deal is clicked, and the hash prefills it.
    page.wait_for_selector("dialog[open] #lbl-seed", timeout=WAIT)
    if page.evaluate("window.lbl.state()") is not None:
        problems.append(f"{name}: a game was dealt before Deal was clicked")
    if page.input_value("#lbl-seed") != "7" or not page.locator("#lbl-p-classic").is_checked():
        problems.append(f"{name}: the hash should prefill the menu with seed 7 and Classic")
    page.get_by_role("button", name="Deal", exact=True).click()
    page.wait_for_function("window.lbl && window.lbl.state()", timeout=WAIT)
    settle(page)
    state = page.evaluate("window.lbl.state()")
    if len(state["fans"]) < 2 or sum(len(f) for f in state["fans"]) != 52:
        problems.append(f"{name}: a new deal should show 52 cards in fans, got {state['fans']!r}")
    page.wait_for_timeout(500)
    if not page.evaluate("window.lbl.music.isOn()") or page.get_attribute(".lbl-iconbtn", "aria-pressed") != "true":
        problems.append(f"{name}: the music should be on by default")
    page.click(".lbl-iconbtn")
    if page.evaluate("window.lbl.music.isOn()") or page.get_attribute(".lbl-iconbtn", "aria-pressed") != "false":
        problems.append(f"{name}: the speaker button should turn the music off")
    page.click(".lbl-iconbtn")
    png = page.screenshot(path=str(shots / f"table-{name}-{w}x{h}.png")) if shots else page.screenshot()
    if blank(png):
        problems.append(f"{name}: the table rendered blank")
    if page.evaluate("window.lbl.stopped()"):
        problems.append(f"{name}: the engine stopped")

    # Clicking plays: the card, then its target.
    move = first_play(state)
    tap = (lambda x, y: page.touchscreen.tap(x, y)) if touch else (lambda x, y: page.mouse.click(x, y))
    if move is None:
        page.get_by_role("button", name="Redeal").click()
        settle(page)
        after = page.evaluate("window.lbl.state()")
        if after["fans"] == state["fans"]:
            problems.append(f"{name}: redeal changed nothing")
    else:
        src, dest = move
        top = state["fans"][src][-1]
        p = page.evaluate("(c) => window.lbl.table.screenOf(c)", top)
        tap(p["x"], p["y"])
        page.wait_for_timeout(300)
        chosen = page.evaluate("window.lbl.selected()")
        if not chosen or chosen["card"] != top:
            problems.append(f"{name}: clicking the {top} should choose it, got {chosen!r}")
        target = {"home": True, "suit": top[1]} if dest == "h" else {"fan": int(dest[1:])}
        p = page.evaluate("(t) => window.lbl.table.screenOf(t)", target)
        page.wait_for_timeout(300)
        if shots:
            page.screenshot(path=str(shots / f"chosen-{name}-{w}x{h}.png"))
        tap(p["x"], p["y"])
        page.wait_for_function("(n) => window.lbl.state().moves > n", arg=state["moves"], timeout=WAIT)
        settle(page)
        after = page.evaluate("window.lbl.state()")
        if after["fans"] == state["fans"] and after["home"] == state["home"]:
            problems.append(f"{name}: the move {move} changed nothing")
        if after["moves"] != state["moves"] + 1:
            problems.append(f"{name}: the move should count once, {state['moves']} -> {after['moves']}")
        if shots:
            page.screenshot(path=str(shots / f"after-{name}-{w}x{h}.png"))
        # Undo takes it back.
        page.get_by_role("button", name="Undo").click()
        page.wait_for_function("(n) => window.lbl.state().moves === n", arg=state["moves"], timeout=WAIT)
        if page.evaluate("window.lbl.state().fans") != state["fans"]:
            problems.append(f"{name}: undo should restore the deal")

    # The keyboard: the table takes focus, arrows speak.
    if not touch:
        page.focus("canvas")
        page.keyboard.press("ArrowRight")
        spoken = "document.getElementById('table-live').textContent"
        try:
            page.wait_for_function(f"{spoken}.includes('Fan 1')", timeout=WAIT)
        except Exception:
            problems.append(f"{name}: arrow keys should say which fan, got {page.evaluate(spoken)!r}")
        page.keyboard.press("Enter")
        try:
            page.wait_for_function(f"{spoken}.includes('Selected') || {spoken}.includes('cannot move')", timeout=WAIT)
        except Exception:
            problems.append(f"{name}: Enter on a fan should say what happened, got {page.evaluate(spoken)!r}")
        page.keyboard.press("Escape")
    context.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", default=str(ROOT / "web3d" / "la-belle-lucie.html"))
    ap.add_argument("--shots", default=None, help="a directory for screenshots")
    args = ap.parse_args()
    page = Path(args.page)
    if not page.exists():
        print(f"{page} is missing: run python3 kit/build.py")
        return 1
    shots = Path(args.shots) if args.shots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
    problems, requests = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for name, w, h, touch in SIZES:
            run_size(browser, page.as_uri(), name, w, h, touch, shots, problems, requests)
        browser.close()
    problems += [f"network request: {u}" for u in requests if not u.startswith(LOCAL)]
    print("\n".join(problems) if problems else "browser: ok (no network, no console errors, the table renders, clicking plays)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
