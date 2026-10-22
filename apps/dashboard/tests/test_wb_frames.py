"""Workbench frame partials (spec 043 T015, FR-003, FR-012): the frame, Why, feedback, composing,
command cards in every state, the ScanMeter."""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

import pytest
from jinja2 import Environment

from mudpuppy_dashboard import queries_wb_scan
from mudpuppy_dashboard.app import create_app
from mudpuppy_dashboard.settings import Settings
from mudpuppy_dashboard.wb_frames import CommandCard, Feedback, Frame, WhyFacts, clock

from .conftest import make_store
from .paths import REPO_ROOT
from .wb_fixture import RUN, seed_wb_scan

TEMPLATES = REPO_ROOT / "apps/dashboard/src/mudpuppy_dashboard/templates/salvage/workbench"
MARKUP = '<img src=x onerror="alert(1)">'


@pytest.fixture(scope="module")
def env(tmp_path_factory: pytest.TempPathFactory) -> Environment:
    data = tmp_path_factory.mktemp("data")
    return create_app(Settings(data_dir=data)).state.web.templates.env


def render(env: Environment, source: str, **ctx: object) -> str:
    return env.from_string(source).render(**ctx)


FRAME = (
    '{% from "salvage/workbench/frame.html" import genview %}'
    "{% call genview(f) %}<p>body</p>{% endcall %}"
)


def why(**over: object) -> WhyFacts:
    facts: dict[str, object] = {
        "path": "mapping",
        "by_you": False,
        "because": "You asked to map the OC/AC calculator.",
        "asked": "Map the OC/AC calculator",
        "shows": ("Live map of scan 01a110d5",),
        "data": "Events up to 10:55:12Z",
        "other_paths": ("chat",),
    }
    facts.update(over)
    return WhyFacts(**facts)  # type: ignore[arg-type]  # test dict of mixed field types


def test_the_lead_frame_has_why_and_feedback(env: Environment) -> None:
    f = Frame(
        dom_id="t43-map",
        title="Live map",
        source="From events up to 10:55:12Z",
        status="running",
        why=why(),
        feedback=Feedback(url="/workbench/views/v1/feedback"),
    )
    html = render(env, FRAME, f=f)
    assert 'id="t43-map"' in html and 'aria-labelledby="t43-map-h"' in html
    assert 'Live map<span class="sy-sr-only">, generated</span>' in html
    assert '<span class="sy-genmark" aria-hidden="true">generated</span>' in html
    assert 'data-status="running">Running' in html
    assert 'aria-controls="t43-map-why"' in html and 'id="t43-map-why" hidden' in html
    assert "Mapping · picked by the assistant" in html and "Switch to Chat" in html
    assert 'aria-label="Was this the right view?"' in html
    assert "Wrong path" not in html  # reasons only after No
    assert "<p>body</p>" in html


def test_other_frames_carry_only_the_mark_and_the_source(env: Environment) -> None:
    html = render(
        env, FRAME, f=Frame(dom_id="t43-detail", title="/kontakt", source="x", title_mono=True)
    )
    assert "Why this view?" not in html and "Right view?" not in html
    assert "sy-case-normal" in html


def test_model_words_are_escaped_everywhere(env: Environment) -> None:
    f = Frame(
        dom_id="t1-a",
        title="Live map",
        source="x",
        why=why(because=MARKUP, asked=MARKUP),
        feedback=Feedback(url="/f"),
    )
    html = render(env, FRAME, f=f)
    assert "<img" not in html
    assert "&lt;img src=x onerror=&#34;alert(1)&#34;&gt;" in html


def test_no_workbench_template_marks_anything_safe() -> None:
    for path in TEMPLATES.glob("*.html"):
        code = re.sub(r"\{#.*?#\}", "", path.read_text(), flags=re.DOTALL)
        assert not re.search(r"\|\s*safe\b", code), path.name


def test_no_answers_reasons_and_a_stale_frame(env: Environment) -> None:
    f = Frame(
        dom_id="t2-map",
        title="Live map",
        source="x",
        state="stale",
        status="running",
        stale_since="10:57:05Z",
        why=why(),
        feedback=Feedback(url="/f", value="no", reasons=("too_much",)),
    )
    html = render(env, FRAME, f=f)
    assert 'data-gen-state="stale"' in html
    assert 'data-status="unobserved">Not live' in html and "Running" not in html
    assert "Live updates paused at 10:57:05Z" in html
    assert html.count('aria-pressed="true"') == 2  # No, Too much
    assert "Missing something" in html


def test_composing_reserves_the_final_size(env: Environment) -> None:
    html = render(
        env,
        '{% from "salvage/workbench/frame.html" import composing %}'
        '{{ composing("t43-composing", "Live map", [("live map", 220), ("page detail", 140)]) }}',
    )
    assert 'data-gen-state="composing" aria-busy="true"' in html
    assert "live map · page detail" in html
    assert "--sy-skel-h: 220px" in html and "Composing view" in html


CARD = '{% from "salvage/workbench/command.html" import command_card %}{{ command_card(c) }}'


def card(**over: object) -> CommandCard:
    base: dict[str, object] = {
        "dom_id": "cmd1",
        "title": "Resume from last checkpoint",
        "state": "proposed",
        "facts": (("Starts", "a new scan that continues 01a110d5"), ("From", "/porownanie")),
        "reason": "the form's button never appeared.",
        "confirm_url": "/workbench/commands/c1/confirm",
        "cancel_url": "/workbench/commands/c1/cancel",
        "token": "test-token-not-real",
    }
    base.update(over)
    return CommandCard(**base)  # type: ignore[arg-type]  # test dict of mixed field types


def test_a_proposed_card_has_the_one_marker_button(env: Environment) -> None:
    html = render(env, CARD, c=card())
    assert html.count("sy-btn--primary") == 1 and "Confirm" in html
    assert 'data-cmd-state="proposed"' in html and 'data-status="draft">Proposed' in html
    assert 'name="token" value="test-token-not-real"' in html
    assert "Nothing runs until you confirm." in html
    assert "<dt>Starts</dt><dd>a new scan that continues 01a110d5</dd>" in html


@pytest.mark.parametrize(
    ("state", "words"),
    [
        ("running", "Resuming…"),
        ("done", "Resumed as scan 01a110e7"),
        ("failed", "The chat service refused it. Nothing changed."),
        ("cancelled", "Cancelled · nothing changed"),
        ("expired", "No longer applies: 01a110d5 was resumed from Scans"),
        ("undone", "Undone · mark removed"),
    ],
)
def test_every_other_state_has_no_confirm(env: Environment, state: str, words: str) -> None:
    c = card(
        state=state,
        running_word="Resuming…",
        result={
            "done": "Resumed as scan 01a110e7",
            "expired": "01a110d5 was resumed from Scans",
        }.get(state, "Undone · mark removed"),
        error="The chat service refused it.",
    )
    html = render(env, CARD, c=c)
    assert words in html
    assert "Confirm" not in html and "sy-btn--primary" not in html
    if state == "failed":
        assert 'role="alert"' in html


def test_the_meter_of_the_fixture_scan(env: Environment, tmp_path: Path) -> None:
    conn = sqlite3.connect(make_store(tmp_path))
    conn.row_factory = sqlite3.Row
    seed_wb_scan(conn)
    live = queries_wb_scan.scan_live(conn, RUN)
    meter = (
        '{% from "salvage/workbench/scan_meter.html" import scan_meter %}'
        "{{ scan_meter(s, stale=stale) }}"
    )
    html = render(env, meter, s=live, stale=False)
    assert 'id="meter-01a110d5" data-status="stopped"' in html
    assert "Scan 01a110d5 · ended at" in html and "/kontakt" in html
    assert "171 steps · 17 pages · 113 queued" in html
    assert 'aria-valuenow="171"' in html
    assert "data-status" not in render(env, meter, s=live, stale=True)


def test_clock() -> None:
    assert clock("2026-10-06T10:58:44.000Z") == "10:58:44Z"
    assert clock(None) == "—"
