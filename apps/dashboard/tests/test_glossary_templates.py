"""Every glossary term a template refers to exists (spec 006 FR-010, SC-005)."""

from __future__ import annotations

import re
from pathlib import Path

from pathfinder_dashboard.glossary import Glossary, load_glossary

TEMPLATES = Path(__file__).resolve().parents[1] / "src" / "pathfinder_dashboard" / "templates"
REPO_DOCS = Path(__file__).resolve().parents[3] / "docs"

# m.term("id", ...), m.intro("id"), and the macro's own calls without the `m.` prefix.
CALL = re.compile(r"""\b(?:m\.)?(term|intro)\(\s*["']([^"']+)["']""")
# Values of the docs-section → term map in macros.html.
SECTION_MAP = re.compile(r"DOC_SECTION_TERMS\s*=\s*\{(.*?)\}", re.S)
PAIR = re.compile(r"""["'][a-z_]+["']\s*:\s*["']([^"']+)["']""")


def referenced_ids() -> list[tuple[str, str]]:
    """(template, term id) for every reference."""
    out = []
    for path in sorted(TEMPLATES.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        rel = str(path.relative_to(TEMPLATES))
        out += [(rel, term_id) for _, term_id in CALL.findall(text)]
        for block in SECTION_MAP.findall(text):
            out += [(rel, term_id) for term_id in PAIR.findall(block)]
    return out


def test_every_referenced_term_exists() -> None:
    g = load_glossary(REPO_DOCS)
    assert isinstance(g, Glossary), g
    refs = referenced_ids()
    assert refs, "no glossary references found in templates"
    missing = [f"{tpl}: {term_id}" for tpl, term_id in refs if g.get(term_id) is None]
    assert not missing, "unknown glossary terms:\n" + "\n".join(missing)


def test_scanner_catches_an_unknown_term(tmp_path: Path) -> None:
    sample = '<th>{{ m.term("not-a-term", "X") }}</th> {{ m.intro("run") }}'
    found = [term_id for _, term_id in CALL.findall(sample)]
    assert found == ["not-a-term", "run"]


def test_intro_terms_are_intro_placement() -> None:
    g = load_glossary(REPO_DOCS)
    assert isinstance(g, Glossary)
    for tpl, term_id in referenced_ids():
        text = (TEMPLATES / tpl).read_text(encoding="utf-8")
        if re.search(rf"""intro\(\s*["']{re.escape(term_id)}["']""", text):
            assert g.get(term_id).placement == "intro", f"{tpl}: {term_id}"


def test_actions_target_column_renamed() -> None:
    actions = (TEMPLATES / "partials" / "actions.html").read_text(encoding="utf-8")
    assert ">Target<" not in actions
    assert "Links to" in actions
