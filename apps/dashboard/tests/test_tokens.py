"""Token fidelity (scorecard): the dashboard's own CSS takes its colours and radius from the Salvage
tokens (static/salvage/css/tokens.css); the design package's CSS is not edited."""

import re
from pathlib import Path

STATIC = Path(__file__).resolve().parents[1] / "src" / "pathfinder_dashboard" / "static"
APP = (STATIC / "css" / "mp.css").read_text()
SALVAGE = (STATIC / "salvage" / "css" / "salvage.css").read_text()
TOKENS = (STATIC / "salvage" / "css" / "tokens.css").read_text()


def without_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def test_no_colour_literals_in_app_css() -> None:
    body = without_comments(APP)
    assert not re.findall(r"#[0-9a-fA-F]{3,8}\b", body)
    assert not re.findall(r"\b(?:rgb|rgba|hsl|hsla)\(", body)


def test_radius_only_from_tokens() -> None:
    for css in (APP, SALVAGE):
        for value in re.findall(r"border-radius\s*:\s*([^;]+);", without_comments(css)):
            assert value.strip() in {"var(--sy-radius)", "0", "50%"}, value


def test_every_var_used_is_defined() -> None:
    defined = set(re.findall(r"(--[a-z0-9-]+)\s*:", TOKENS + SALVAGE + APP))
    used = set(re.findall(r"var\((--[a-z0-9-]+)", without_comments(APP)))
    # --value is set inline per element (the phase bar segment width).
    assert used - {"--value"} <= defined, used - defined


def test_only_sanctioned_animations() -> None:
    keyframes = set(re.findall(r"@keyframes\s+([a-z-]+)", APP + SALVAGE))
    assert keyframes == {"sy-pulse", "sy-caret"}
    assert "prefers-reduced-motion" in SALVAGE


def test_salvage_colour_tokens_present() -> None:
    for token, value in {
        "--sy-steel-900": "#111315",
        "--sy-steel-800": "#181B1E",
        "--sy-chalk": "#E8E4DA",
        "--sy-marker": "#FF8F1F",
        "--sy-manila": "#E9D8A6",
        "--sy-inspected": "#7BC47F",
        "--sy-coolant": "#56C2E6",
        "--sy-blueprint": "#7AA7FF",
        "--sy-failure": "#FF5A5F",
    }.items():
        assert re.search(rf"{token}:\s*{value};", TOKENS), token
