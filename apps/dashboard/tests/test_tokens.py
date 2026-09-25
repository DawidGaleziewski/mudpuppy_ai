"""Token fidelity (scorecard): every colour and radius in app.css comes from tokens.css."""

import re
from pathlib import Path

CSS = Path(__file__).resolve().parents[1] / "src" / "pathfinder_dashboard" / "static" / "css"
APP = (CSS / "app.css").read_text()
TOKENS = (CSS / "tokens.css").read_text()


def without_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def test_no_colour_literals_in_app_css() -> None:
    body = without_comments(APP)
    assert not re.findall(r"#[0-9a-fA-F]{3,8}\b", body)
    assert not re.findall(r"\b(?:rgb|rgba|hsl|hsla)\(", body)


def test_radius_only_from_tokens() -> None:
    for value in re.findall(r"border-radius\s*:\s*([^;]+);", without_comments(APP)):
        assert value.strip() in {"var(--radius-none)", "var(--radius-full)"}, value


def test_every_var_used_is_defined() -> None:
    defined = set(re.findall(r"(--[a-z0-9-]+)\s*:", TOKENS))
    used = set(re.findall(r"var\((--[a-z0-9-]+)", without_comments(APP)))
    assert used <= defined, used - defined


def test_only_three_sanctioned_animations() -> None:
    keyframes = set(re.findall(r"@keyframes\s+([a-z-]+)", APP))
    assert keyframes == {"pulse", "mark-bounce", "caret"}
    assert "prefers-reduced-motion" in APP


def test_console_colour_tokens_present() -> None:
    for token, value in {
        "--surface-0": "#0a0a08",
        "--surface-100": "#131310",
        "--surface-200": "#1a1a14",
        "--border": "#2b2a20",
        "--ink-100": "#e8d9ae",
        "--ink-500": "#8a7f5c",
        "--brand": "#ffb000",
        "--accent-2": "#33ff66",
        "--accent-3": "#00e5ff",
        "--accent-4": "#ff66c4",
        "--signal-error": "#ff3b30",
    }.items():
        assert re.search(rf"{token}:\s*{value};", TOKENS), token
