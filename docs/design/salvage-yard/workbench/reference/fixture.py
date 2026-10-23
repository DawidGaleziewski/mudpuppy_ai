"""Fixture data for the reference Workbench (docs/13-v2-fixtures.md + tools/BRIEF-WB.md).

In production these come from the scan engine (events) and the portal model (records).
Here they are constants so the app runs with no database and no crawler.
"""

PORTAL = "reference-insurer"
# Scan ids are full UUIDs (UUIDv7, D-9). The UI shows the 13-character short form (short_id): the first two groups
# are the start time in ms, so they stay unique and sortable. JSON, URLs and the model always get the full id.
SCAN = "01a110d5-2028-7000-8f3e-5c1a9b27d460"           # the scan we replay (6 Oct 10:49:20Z, sandbox, guest)
RESUMED_SCAN = "01a110e7-2068-7d10-8c55-91e2b3f4a6d8"   # demo: the scan that "continues 01a110d5-2028" (11:09:05Z)


def short_id(scan_id):
    """01a110d5-2028-7b2e-… → 01a110d5-2028. (If two scans ever share it, show the next group too.)"""
    return "-".join(scan_id.split("-")[:2]) if scan_id and scan_id.count("-") == 4 else scan_id
LIMIT_STEPS = 400
ERROR_REF = "ERR-01M48DVAT5E1GS5K42CTCTTDTJ"

# Pages in visit order. `state` = same-URL step (step 2 of /kalkulator/kierowca).
# `mini` = bars for the wireframe miniature (b = heading, i = text, l = link, f = field); production uses a screenshot.
PAGES = [
    dict(k=1, route="/", state=None, title="Ubezpieczenia dla Ciebie", at="10:49:31Z", step=12, pages=3, queued=15, side=2,
         what="Start page. 11 menu links and 4 'Na skróty' links found; 15 queued.",
         mini=[("b", 60), ("i", 90), ("i", 70), ("l", 40), ("l", 55), ("i", 80)]),
    dict(k=2, route="/ubezpieczenia/samochod", state=None, title="Samochód", at="10:51:02Z", step=38, pages=6, queued=31, side=2,
         what="Followed 'Samochód' in the menu. Found 'Oblicz składkę' leading to the calculator.",
         mini=[("b", 45), ("i", 85), ("i", 60), ("l", 45), ("i", 75)]),
    dict(k=3, route="/kalkulator/kierowca", state=1, title="Kalkulator OC/AC — dane kierowcy", at="10:53:40Z", step=77, pages=9,
         queued=52, side=2, what="Step 1 of the calculator. Filled the guest test data and pressed Dalej.",
         mini=[("b", 70), ("f", 55), ("f", 55), ("f", 55), ("l", 25)]),
    dict(k=4, route="/kalkulator/kierowca", state=2, title="Kalkulator OC/AC — opcje", at="10:55:12Z", step=102, pages=11,
         queued=66, side=1, what="Same URL, new screen: recorded as step 2. Submitting it is queued.",
         mini=[("b", 55), ("f", 45), ("f", 45), ("l", 30)]),
    dict(k=5, route="/porownanie", state=None, title="Porównanie", at="10:57:05Z", step=140, pages=14, queued=97, side=2,
         what="Back on /, followed 'Porównaj produkty'. 38 links queued here.",
         mini=[("b", 65), ("i", 92), ("i", 92), ("i", 92), ("i", 60)]),
    dict(k=6, route="/kontakt", state=None, title="Kontakt", at="10:58:31Z", step=167, pages=17, queued=113, side=2,
         what="Form found. The next action (press 'Wyślij') failed: its element wasn't there after the page settled. Scan stopped at step 171.",
         mini=[("b", 40), ("f", 60), ("f", 60), ("f", 80), ("l", 25)]),
]

# Narration the scripted assistant writes (words lane). Each line cites the event it is based on.
NARRATION = {
    12: "Opened / · Ubezpieczenia dla Ciebie. 15 links queued.",
    38: "Followed 'Samochód' to /ubezpieczenia/samochod.",
    77: "Calculator step 1: filled guest test data, pressed Dalej.",
    102: "Same URL, new screen: recorded as step 2 (opcje).",
    140: "Back to /, followed 'Porównaj produkty' to /porownanie.",
    167: "Menu 'Kontakt' to /kontakt, a page with a form.",
    171: "The next action on /kontakt failed: its element wasn't there. Stopped.",
}


def page_key(p):
    """Stable key for a page: route plus same-URL step, e.g. '/kalkulator/kierowca:2'."""
    return p["route"] + (f":{p['state']}" if p.get("state") else "")


def page_label(p):
    return p["route"] + (f" · step {p['state']}" if p.get("state") else "")


def find_page(route, state=None):
    for p in PAGES:
        if p["route"] == route and (state is None or p.get("state") == state):
            return p
    return None


def replay_script(scan=SCAN):
    """The events the stub engine publishes for scan 01a110d5-2028: one event per step, (step, type, data)."""
    ev = [(1, "scan.started", dict(at="10:49:20Z", start="/", persona="guest", env="sandbox", limit=LIMIT_STEPS))]
    for p in PAGES:
        ev.append((p["step"], "page.visited", dict(k=p["k"], route=p["route"], state=p["state"], title=p["title"], at=p["at"],
                                                   steps=p["step"], pages=p["pages"], queued=p["queued"], side=p["side"])))
    ev += [
        (168, "action", dict(at="10:58:33Z", route="/kontakt", text="settled · 4 fields, 1 form", steps=168, pages=17, queued=113)),
        (169, "action", dict(at="10:58:34Z", route="/kontakt", text="next action: press 'Wyślij'", steps=169, pages=17, queued=113)),
        (170, "action", dict(at="10:58:44Z", route="/kontakt", text="element not found (waited 10 s)", steps=170, pages=17,
                             queued=113, failed=True)),
        (171, "scan.stopped", dict(k=6, route="/kontakt", at="10:58:44Z", steps=171, pages=17, queued=113, error=ERROR_REF,
                                   waited_s=10, reason="The next action's element wasn't there after the page settled.")),
    ]
    return ev


def resumed_script():
    """Demo continuation 01a110e7-2068: replays to the checkpoint (/porownanie, step 140), then records /kontakt without submitting."""
    return [
        (141, "scan.resumed", dict(at="11:05:40Z", start="/porownanie", persona="guest", env="sandbox", limit=LIMIT_STEPS,
                                   continues=SCAN, checkpoint_step=140, carried_pages=14, carried_queued=97)),
        (172, "page.visited", dict(k=6, route="/kontakt", state=None, title="Kontakt", at="11:06:02Z", steps=172, pages=17,
                                   queued=113, side=2, variation="record_only")),
    ]


# Recovery API: variations for the next attempt (the model never writes these).
FIX_CHOICES = [
    dict(variation="wait_longer", label="Wait longer", help="Wait 20 s instead of 10 s for the element."),
    dict(variation="record_only", label="Record the form, don't submit", help="Keeps the page and its fields; the outcome stays unknown."),
    dict(variation="skip_action", label="Skip this action", help="Marks it skipped; the scan goes on with the queue."),
]
# What each variation does at step 171 (docs/13 §Workbench fixture, as on screen 15): #2 fails, #3 passes.
ATTEMPT_OUTCOME = {
    "wait_longer": ("failed", "Same error: the element isn't there, not a timing problem."),
    "record_only": ("passed", "The form and its 4 fields are recorded; nothing is submitted."),
    "skip_action": ("skipped", "Action skipped; the scan goes on with the queue."),
}
ATTEMPT_AT = {2: "11:02:31Z", 3: "11:04:10Z", 4: "11:05:20Z"}

# Portal-model records used by Chat and Explain (docs/13-v2-fixtures.md).
RECORDS = {
    "PROC-001": dict(id="PROC-001", kind="Process", title="Oblicz składkę OC/AC", status="ok", word="Accepted",
                     facts=[("Explored", "Thorough on 9c21"), ("Screens", "5 (3 steps + 2 outcome screens)"), ("Rules", "BR-021…BR-026")],
                     href="/screens/v2-10-process-detail.html"),
    "PROC-002": dict(id="PROC-002", kind="Process", title="Porównaj produkty", status="ok", word="Accepted",
                     facts=[("Explored", "Partial on 3e1a")], href="/screens/v2-09-processes.html"),
    "PROC-003": dict(id="PROC-003", kind="Process", title="Test process", status="ok", word="Accepted",
                     facts=[("Explored", "Thorough on 3e1a")], href="/screens/v2-09-processes.html"),
    "BR-021": dict(id="BR-021", kind="Rule", title="Driver must be 21 or older", status="needs", word="Changed · needs you",
                   facts=[("Decided at", "dane kierowcy · Dalej")], href="/screens/v2-12-rule-detail.html"),
    "BR-022": dict(id="BR-022", kind="Rule", title="Zakres is required", status="ok", word="Confirmed",
                   facts=[("Decided at", "opcje · Dalej")], href="/screens/v2-11-rules.html"),
    "BR-023": dict(id="BR-023", kind="Rule", title="OC + AC needs the vehicle value", status="ok", word="Tested",
                   facts=[("Decided at", "opcje · Zakres")], href="/screens/v2-11-rules.html"),
    "BR-024": dict(id="BR-024", kind="Rule", title="Price depends on data not visible from the UI", status="inferred", word="Proposed",
                   facts=[("Decided at", "wynik")], href="/screens/v2-11-rules.html"),
    "BR-025": dict(id="BR-025", kind="Rule", title="Premium customers get a discount field", status="inferred", word="Proposed",
                   facts=[("Decided at", "dane kierowcy")], href="/screens/v2-11-rules.html"),
    "BR-026": dict(id="BR-026", kind="Rule", title="Postal code must be NN-NNN", status="failed", word="Broken",
                   facts=[("Decided at", "dane kierowcy · Kod pocztowy")], href="/screens/v2-11-rules.html"),
    # Long ids (four digits) and the other documentation prefixes (REQ, UC, DI, GL, ASM, OQ, FUP, API) are valid record ids.
    "BR-1001": dict(id="BR-1001", kind="Rule", title="Premium is shown per year", status="ok", word="Tested",
                    facts=[("Decided at", "wynik")], href="/screens/v2-11-rules.html"),
    "REQ-004": dict(id="REQ-004", kind="Requirement", title="The calculator shows the premium per year", status="ok", word="Covered",
                    facts=[("Rules", "BR-021, BR-1001"), ("Process", "PROC-001")], href="/screens/v2-10-process-detail.html"),
}

DECISION_TABLES = {
    "BR-021": dict(input="Wiek kierowcy", result="Next screen", note="From 'Data urodzenia', on today's date. Release 9c21.",
                   rows=[("< 21", "Nie możemy Cię ubezpieczyć"), ("≥ 21", "Kalkulator OC/AC — opcje")],
                   tests=[("20", "exit", "pass"), ("21", "opcje", "pass"), ("22", "opcje", "pass")]),
}

FINDINGS = {
    "FND-007": dict(id="FND-007", title="Banner 'Oferta specjalna' on 6 of 11 visits", screen="Kalkulator OC/AC — wynik",
                    explanation="A/B test: cookie ab_calc = B, same release and persona.", status="inferred", word="Proposed",
                    linked=["Same screen? conflict on wynik (r2 vs r3)", "Process suggestion: add variant r3 to Oblicz składkę OC/AC"],
                    href="/screens/v2-05-review-explained.html"),
}

CHANGES = {
    "CHG-019": dict(id="CHG-019", screen="Kalkulator OC/AC — wynik", before="r2", after="r3", release="9c21",
                    before_label="Without banner", after_label="With banner 'Oferta specjalna'",
                    rows=[("Release", "9c21", "9c21", False), ("Cookie ab_calc", "A", "B", True), ("Banner", "—", "Oferta specjalna", True)],
                    href="/screens/v2-03-change-detail.html"),
}

SUGGESTIONS_FOR_PAGE = ["What did you do here?", "Where does it go next?", "Anything missing on this page?"]
SUGGESTIONS_FOR_FAILED = ["Why did it stop here?", "Troubleshoot with me", "Resume the scan"]
SUGGESTIONS_FOR_FAILED_P1 = ["Why did it stop here?", "Resume the scan"]          # phase 1 has no Troubleshoot path
