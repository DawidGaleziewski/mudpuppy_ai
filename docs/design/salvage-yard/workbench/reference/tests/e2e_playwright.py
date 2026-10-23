"""End-to-end check of the reference Workbench in Chromium at 1280×900 (needs `pip install playwright`).

  python3 tests/e2e_playwright.py        # starts its own server, runs the story, saves screenshots/workbench/ref-*.png

The story: phase 1 inline (live card, side sheet, point and ask, dropped stream) → phase 2 split (stop, ErrorCard, keys,
Why, feedback, Troubleshoot, attempt 2 fails, attempt 3 passes, Resume follows 01a110e7-2068) → phase 3 (Explain, fallbacks,
Chat inline, focus mode). Fails on any console error outside the deliberately dropped stream.
"""
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parents[1]
SHOTS = str(HERE.parents[1] / "screenshots" / "workbench") + "/"
os.makedirs(SHOTS, exist_ok=True)
with socket.socket() as _s:
    _s.bind(("127.0.0.1", 0))
    PORT = _s.getsockname()[1]
B = f"http://127.0.0.1:{PORT}"
SERVER = subprocess.Popen([sys.executable, "-m", "uvicorn", "app:app", "--port", str(PORT), "--log-level", "warning"], cwd=HERE,
                          env=dict(os.environ, WB_REPLAY_INTERVAL="0.6", WB_COMMAND_DELAY="0.2"),
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
errs, checks, expected = [], [], []
DROP = {"on": False}   # the simulated drop logs EventSource errors on purpose

def ok(name, cond):
    checks.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)

def overflow(pg):
    return pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")

def send(pg, text):
    pg.fill("#wb-input", text)
    pg.keyboard.press("Enter")

def confirm_last(pg):
    pg.locator(".sy-cmd[data-cmd-state=proposed] .sy-btn--primary:visible").last.click()

with sync_playwright() as p:
    b = p.chromium.launch()
    def page():
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page()
        pg.on("console", lambda m: (expected if DROP["on"] else errs).append(f"{m.type}: {m.text} (after: {checks[-1][0] if checks else 'start'})") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
        return pg

    # ---------- Phase 1 · inline: live card, side sheet, point and ask, stale stream
    pg = page()
    pg.goto(B + "/workbench?phase=1")
    send(pg, "Map the OC/AC calculator")
    pg.wait_for_selector(".sy-cmd[data-cmd-state=proposed]")
    ok("p1: start proposed as a command card, nothing runs before Confirm", pg.locator(".sy-film__item").count() == 0)
    confirm_last(pg)
    pg.wait_for_selector(".sy-cmd[data-cmd-state=done]", timeout=5000)
    pg.wait_for_selector(".sy-film__item[data-order='3']", timeout=10000)
    ok("p1: inline layout with a filmstrip card", pg.locator(".sy-wb--inline .sy-genview--card .sy-film").count() == 1)
    ok("p1: live bar pinned", pg.locator("#wb-livebar").count() == 1)
    pg.click(".sy-film__item[data-order='2']")
    pg.wait_for_function("document.querySelector('#wb-aside .sy-plate__title[id$=detail-title]')?.textContent.includes('/ubezpieczenia/samochod')")
    ok("p1: clicking a page fills the side sheet", True)
    ok("p1: URL carries the selection", "sel=%2Fubezpieczenia%2Fsamochod" in pg.url or "sel=/ubezpieczenia/samochod" in pg.url)
    ok("p1: a sheet the person opened is not marked generated", pg.locator("#wb-aside .sy-genmark").count() == 0)
    pg.click("#wb-aside button:has-text('Ask about this')")
    ok("p1: Ask about this adds a context chip", pg.locator("#wb-ctxbar .sy-ctxchip").count() == 1)
    pg.screenshot(path=SHOTS + "ref-1-inline-live.png")
    pg.locator("#wb-suggest button", has_text="What did you do here?").click()
    pg.wait_for_selector(".sy-msg--user .sy-chip:has-text('/ubezpieczenia/samochod')")
    pg.wait_for_selector(".sy-msg p:has-text('Followed')")
    ok("p1: the chip travelled with the message and the answer is about that page", True)
    # stale stream: drop it for 5 s while the scan runs
    DROP["on"] = True
    pg.click("button:has-text('Drop the stream 5 s')")
    pg.wait_for_selector(".sy-genview[data-gen-state=stale] [data-stale-notice]", timeout=6000)
    ok("p1: dropped stream marks live views stale, data stays", pg.locator(".sy-film__item").count() >= 3)
    pg.wait_for_function("!document.querySelector('[data-stale-notice]')", timeout=20000)
    ok("p1: reconnects and clears the notice", True)
    DROP["on"] = False
    pg.wait_for_selector(".sy-film__item[data-order='5'] >> visible=true", timeout=15000)
    ok("p1: no horizontal overflow", overflow(pg) <= 0)
    pg.context.close()

    # ---------- Phase 2 · split: stop, ErrorCard, select + A key, troubleshoot, attempts, resume
    pg = page()
    pg.goto(B + "/workbench?phase=2")
    send(pg, "Map the OC/AC calculator")
    pg.wait_for_selector(".sy-cmd[data-cmd-state=proposed]")
    confirm_last(pg)
    pg.wait_for_selector(".sy-wb--split [data-type=LiveMap] .sy-node[data-order='4']", timeout=12000)
    ok("p2: live map graph on the stage", pg.locator("#wb-stage [data-type=LiveMap] .sy-graph").count() == 1)
    pg.wait_for_selector(".sy-genview--failure[data-type=ErrorCard]", timeout=20000)
    ok("p2: the stop recomposes: ErrorCard (red reason) appears", True)
    ok("p2: stopped scan status is ash 'Stopped', not red",
       pg.locator("[data-type=LiveMap] [id$=-status] .sy-status").first.get_attribute("data-status") == "stopped")
    ok("p2: the failed page node is red", pg.locator(".sy-node[data-state=failed]").count() == 1)
    ok("p2: older live card folded with Expand", pg.locator("button[data-fold][aria-expanded=false]").count() >= 1)
    ok("p2: Why this view? once per view (lead frame only)", pg.locator(".sy-genview__why:visible").count() == 1)
    pg.click(".sy-node[data-order='4']")
    pg.wait_for_function("document.querySelector('[id$=detail-title]')?.textContent.includes('step 2')")
    ok("p2: focus stays on the clicked node after the swap", pg.evaluate("document.activeElement?.dataset?.order") == "4")
    pg.keyboard.press("ArrowRight")
    ok("p2: arrow keys move along the visit order", pg.evaluate("document.activeElement?.dataset?.order") == "5")
    pg.keyboard.press("a")
    ok("p2: A asks about the focused page", pg.locator("#wb-ctxbar .sy-ctxchip").count() == 1)
    pg.locator(".sy-genview__why:visible").first.click()
    ok("p2: Why this view? opens", pg.locator(".sy-genwhy:not([hidden])").count() == 1)
    pg.keyboard.press("Escape")
    ok("p2: Esc closes it", pg.locator(".sy-genwhy:not([hidden])").count() == 0)
    pg.locator(".sy-genfeedback__btn:visible", has_text="No").first.click()
    pg.wait_for_selector(".sy-genfeedback__why")
    ok("p2: feedback No asks why", True)
    pg.screenshot(path=SHOTS + "ref-2-split-stopped.png")
    ok("p2: no horizontal overflow", overflow(pg) <= 0)
    # troubleshoot
    pg.click("button:has-text('Troubleshoot with me')")
    pg.wait_for_selector("#wb-stage [data-type=FixChoices]")
    ok("p2: path switch to Troubleshoot (your choice)", pg.locator(".sy-pathswitch__why[data-source=you]").count() == 1)
    ok("p2: URL has path=troubleshoot", "path=troubleshoot" in pg.url)
    pg.click("button:has-text('Run attempt 2')")
    pg.wait_for_selector(".sy-cmd[data-cmd-state=proposed]:has-text('Wait longer')")
    confirm_last(pg)
    pg.wait_for_selector("[data-type=AttemptList] li:has-text('#2')", timeout=8000)
    ok("p2: attempt 2 (wait longer) failed, listed", "failed" in pg.locator("[data-type=AttemptList] li").nth(1).inner_text().lower())
    pg.check("input[value=record_only]", force=True)
    pg.click("button:has-text('Run attempt 3')")
    pg.wait_for_selector(".sy-cmd[data-cmd-state=proposed]:has-text('Record the form')")
    confirm_last(pg)
    pg.wait_for_selector("[data-type=AttemptList] li:has-text('#3')", timeout=8000)
    pg.wait_for_selector(".sy-cmd[data-cmd-state=proposed]:has-text('Resume from last checkpoint')", timeout=8000)
    ok("p2: attempt 3 passed and the assistant proposes Resume", "passed" in pg.locator("[data-type=AttemptList] li").nth(2).inner_text().lower())
    pg.evaluate("window.scrollTo(0, 0)")
    pg.screenshot(path=SHOTS + "ref-3-troubleshoot.png", full_page=True)
    ok("p2: no horizontal overflow (troubleshoot)", overflow(pg) <= 0)
    confirm_last(pg)
    pg.wait_for_selector(".sy-pathswitch__why:has-text('Following scan 01a110e7-2068')", timeout=10000)
    pg.wait_for_selector("[data-type=LiveMap] .sy-node[data-order='6']:not([data-state=failed])", timeout=12000)
    ok("p2: resume follows the continued scan 01a110e7-2068", "01a110e7-2068" in pg.inner_text("#wb-stage"))
    pg.context.close()

    # ---------- Phase 3 · focus mode + Explain + fallbacks
    pg = page()
    pg.goto(B + "/workbench?phase=3")
    send(pg, "Explain the banner on wynik")
    pg.wait_for_selector("#wb-stage [data-type=FindingCard]")
    ok("p3: Explain path composes FindingCard + Compare", pg.locator("#wb-stage [data-type=Compare]").count() == 1)
    send(pg, "demo: invalid view")
    pg.wait_for_selector(".sy-msg:has-text('No view this time')")
    ok("p3: invalid spec falls back to words, view kept", pg.locator("#wb-stage [data-type=FindingCard]").count() == 1)
    send(pg, "demo: assistant down")
    pg.wait_for_selector(".sy-msg:has-text('Assistant unavailable')")
    ok("p3: model down says so, nothing breaks", True)
    send(pg, "How many processes are accepted?")
    pg.wait_for_selector(".sy-wb--inline [data-type=RecordList]")
    ok("p3: Chat path renders inline even in phase 3", True)
    pg.goto(B + "/workbench?focus=1")
    send(pg, "Map the OC/AC calculator")
    # still on the Chat path (inline): the card is in the conversation; the map then opens in focus mode
    pg.wait_for_selector(".sy-cmd[data-cmd-state=proposed] >> visible=true")
    confirm_last(pg)
    pg.wait_for_selector(".sy-wb--focus #wb-stage [data-type=LiveMap] .sy-node[data-order='4'][data-state=here]", timeout=15000)
    ok("p3: focus mode: stage + command bar + side column", pg.locator(".sy-wb--focus .sy-cmdbar").count() == 1 and
       pg.locator("#wb-aside [data-type=Narration]").count() == 1)
    pg.evaluate("window.scrollTo(0, 0)")
    pg.screenshot(path=SHOTS + "ref-4-focus.png", full_page=True)
    ok("p3: no horizontal overflow (focus)", overflow(pg) <= 0)
    pg.context.close()
    b.close()

SERVER.terminate()
ok("no console errors outside the simulated drop", not errs)
print("\nconsole errors/warnings:", errs or "none")
print("expected during the simulated drop:", len(expected))
print(f"{sum(c for _, c in checks)}/{len(checks)} checks passed")
sys.exit(0 if all(c for _, c in checks) else 1)
