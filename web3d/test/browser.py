#!/usr/bin/env python3
"""The page in a real browser, offline.

    python3 kit/build.py
    <python with Playwright> web3d/test/browser.py [screenshot.png]

Needs Playwright's Python package and the system Chromium (`/usr/bin/chromium`).
On the development VM piquet's `.venv` has Playwright:
`~/piquet/.venv/bin/python web3d/test/browser.py`. The page is opened from a file:// URL.

Checks what only a browser can show: that the page makes no network request (it is one
file and must work offline), that nothing is written to the console in error, and that
clicking plays: Draw puts a card in the hand and takes one from the stock.
Not part of bin/gate (the gate opens no browser); run it before committing a change to
the page.
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "web3d" / "la-belle-lucie.html"
SHOT = next((Path(a) for a in sys.argv[1:]), None)
LOCAL = ("file:", "data:", "blob:")


def main() -> int:
    if not PAGE.exists():
        print(f"{PAGE} is missing: run python3 kit/build.py")
        return 1
    problems, requests = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 480, "height": 640})
        page.on("console", lambda m: m.type == "error" and problems.append(f"console error: {m.text}"))
        page.on("pageerror", lambda e: problems.append(f"page error: {e}"))
        page.on("request", lambda r: requests.append(r.url))
        page.goto(PAGE.as_uri())
        page.wait_for_selector("button")
        draw = page.get_by_role("button", name="Draw")
        if "(52 left)" not in draw.inner_text():
            problems.append(f"a new table should show 52 left, got {draw.inner_text()!r}")
        for _ in range(3):
            draw.click()
        cards = page.locator(".card").count()
        if cards != 3:
            problems.append(f"3 draws should leave 3 cards in the hand, got {cards}")
        if "(49 left)" not in draw.inner_text():
            problems.append(f"3 draws should leave 49 left, got {draw.inner_text()!r}")
        page.get_by_role("button", name="New game").click()
        if page.locator(".card").count() != 0:
            problems.append("a new game should start with an empty hand")
        if SHOT:
            draw.click()
            page.screenshot(path=str(SHOT))
        browser.close()
    problems += [f"network request: {u}" for u in requests if not u.startswith(LOCAL)]
    print("\n".join(problems) if problems else "browser: ok (no network, no console errors, draw plays)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
