"""Glossary loading and validation (spec 006, data-model.md) on a fixture tree and the real docs."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import pytest
import yaml

from pathfinder_dashboard.glossary import (
    Glossary,
    GlossaryError,
    dashboard_href,
    load_glossary,
    markdown_html,
    render_readme,
)

FIXTURE = Path(__file__).parent / "fixtures" / "glossary" / "docs"


@pytest.fixture
def docs(tmp_path: Path) -> Path:
    target = tmp_path / "docs"
    shutil.copytree(FIXTURE, target)
    return target


def load_ok(docs_dir: Path) -> Glossary:
    g = load_glossary(docs_dir)
    assert isinstance(g, Glossary), g
    return g


def edit_yaml(docs_dir: Path, change: Any) -> None:
    path = docs_dir / "glossary" / "glossary.yaml"
    data = yaml.safe_load(path.read_text())
    change(data)
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))


def edit_entry(docs_dir: Path, entry_id: str, **fields: Any) -> None:
    def change(data: dict[str, Any]) -> None:
        entry = next(e for e in data["entries"] if e["id"] == entry_id)
        for k, v in fields.items():
            if v is None:
                entry.pop(k, None)
            else:
                entry[k] = v

    edit_yaml(docs_dir, change)


def problems(docs_dir: Path) -> str:
    g = load_glossary(docs_dir)
    assert isinstance(g, GlossaryError), "expected the glossary to be rejected"
    return "\n".join(g.problems)


def edit_wiki(docs_dir: Path, change: Any) -> None:
    path = docs_dir / "wiki" / "beta-concept.md"
    text = path.read_text()
    _, front, body = text.split("---\n", 2)
    data = yaml.safe_load(front)
    change(data)
    path.write_text("---\n" + yaml.safe_dump(data, sort_keys=False) + "---\n" + body)


# ---- fixture: valid -----------------------------------------------------------------------------


def test_fixture_loads(docs: Path) -> None:
    g = load_ok(docs)
    assert [e.id for e in g.sorted_entries()] == ["alpha", "gamma", "beta"]
    assert g.get("alpha").placement == "intro"
    assert g.get("beta").placement == "tooltip"
    assert g.page_title("alpha-long") == "Alpha in depth"
    assert g.wiki["beta-concept"].front.citations[0].edition == "v1 (2020)"
    assert [(c, grp) for c, grp, _ in g.groups()] == [
        ("pathfinder", "Crawling"),
        ("ba", "Statements"),
    ]


def test_missing_file_is_an_error_not_an_exception(tmp_path: Path) -> None:
    g = load_glossary(tmp_path / "nowhere")
    assert isinstance(g, GlossaryError)
    assert "cannot read" in str(g)


def test_broken_yaml(docs: Path) -> None:
    (docs / "glossary" / "glossary.yaml").write_text("entries: [unclosed\n")
    assert "invalid YAML" in problems(docs)


# ---- fixture: each data-model rule --------------------------------------------------------------


def test_duplicate_id(docs: Path) -> None:
    edit_yaml(docs, lambda d: d["entries"].append(dict(d["entries"][2])))
    assert "gamma: id: duplicate" in problems(docs)


def test_id_not_kebab(docs: Path) -> None:
    edit_entry(docs, "gamma", id="Gamma_1")
    assert "Gamma_1: id: Value error, must be kebab-case" in problems(docs)


@pytest.mark.parametrize(
    "field",
    ["term", "category", "group", "short", "explanation", "changed_in", "changed_on"],
)
def test_missing_required_field(docs: Path, field: str) -> None:
    edit_entry(docs, "gamma", **{field: None})
    assert f"gamma: {field}: Field required" in problems(docs)


def test_category_enum(docs: Path) -> None:
    edit_entry(docs, "gamma", category="qa")
    assert "gamma: category:" in problems(docs)


def test_placement_enum(docs: Path) -> None:
    edit_entry(docs, "gamma", placement="footer")
    assert "gamma: placement:" in problems(docs)


def test_short_too_long(docs: Path) -> None:
    edit_entry(docs, "gamma", short="A " + "very " * 50 + "long sentence.")
    assert "gamma: short: Value error, must be at most 200 characters" in problems(docs)


def test_short_two_sentences(docs: Path) -> None:
    edit_entry(docs, "gamma", short="One sentence. Another sentence.")
    assert "gamma: short: Value error, must be exactly one sentence" in problems(docs)


def test_short_abbreviation_is_one_sentence(docs: Path) -> None:
    edit_entry(docs, "gamma", short="A term, e.g. a rule or i.e. a fact.")
    load_ok(docs)


def test_changed_in_is_roadmap_id(docs: Path) -> None:
    edit_entry(docs, "gamma", changed_in="r22")
    assert "gamma: changed_in:" in problems(docs)


def test_related_unknown(docs: Path) -> None:
    edit_entry(docs, "alpha", related=["delta"])
    assert "alpha: related: unknown id 'delta'" in problems(docs)


def test_replaced_by_unknown(docs: Path) -> None:
    edit_entry(
        docs, "gamma", retired={"since": "2026-10-03", "replaced_by": "delta", "note": "Gone."}
    )
    assert "gamma: retired.replaced_by: unknown id" in problems(docs)


def test_page_missing(docs: Path) -> None:
    edit_entry(docs, "alpha", page="nope")
    assert "alpha: page: no file glossary/pages/nope.md" in problems(docs)


def test_wiki_missing(docs: Path) -> None:
    edit_entry(docs, "gamma", wiki="nope")
    assert "gamma: wiki: no file wiki/nope.md" in problems(docs)


@pytest.mark.parametrize("field", ["title", "glossary", "changed_in", "changed_on"])
def test_wiki_front_matter_required(docs: Path, field: str) -> None:
    edit_wiki(docs, lambda d: d.pop(field))
    assert f"wiki/beta-concept.md: beta-concept: {field}: Field required" in problems(docs)


def test_wiki_without_front_matter(docs: Path) -> None:
    (docs / "wiki" / "beta-concept.md").write_text("# Beta\n\nNo front matter.\n")
    assert "wiki/beta-concept.md: missing YAML front matter" in problems(docs)


def test_wiki_zero_citations(docs: Path) -> None:
    edit_wiki(docs, lambda d: d.update(citations=[]))
    assert "citations: Value error, needs at least one citation" in problems(docs)


@pytest.mark.parametrize("field", ["source", "edition", "url", "checked_on"])
def test_citation_required(docs: Path, field: str) -> None:
    edit_wiki(docs, lambda d: d["citations"][0].pop(field))
    assert f"citations.0.{field}: Field required" in problems(docs)


def test_citation_url_https(docs: Path) -> None:
    edit_wiki(docs, lambda d: d["citations"][0].update(url="http://example.org/beta"))
    assert "citations.0.url: Value error, must be an https URL" in problems(docs)


def test_quote_at_most_two_sentences(docs: Path) -> None:
    edit_wiki(docs, lambda d: d["citations"][0].update(quote="One. Two. Three."))
    assert "citations.0.quote: Value error, must be at most 2 sentences" in problems(docs)


def test_entry_wiki_must_be_listed_by_page(docs: Path) -> None:
    edit_wiki(docs, lambda d: d.update(glossary=["alpha"]))
    out = problems(docs)
    assert "wiki/beta-concept.md: beta-concept: glossary: does not list 'beta'" in out
    assert "alpha: wiki: should be 'beta-concept'" in out


def test_page_lists_unknown_entry(docs: Path) -> None:
    edit_wiki(docs, lambda d: d.update(glossary=["beta", "delta"]))
    assert "glossary: unknown id 'delta'" in problems(docs)


# ---- rendering ----------------------------------------------------------------------------------


def test_markdown_has_no_raw_html_and_rewrites_links(docs: Path) -> None:
    g = load_ok(docs)
    html = str(markdown_html(g.pages["alpha-long"], base="pages"))
    assert "<b>" not in html
    assert "&lt;b&gt;" in html
    assert 'href="/glossary#alpha"' in html
    assert 'href="/glossary/wiki/beta-concept"' in html


@pytest.mark.parametrize(
    ("href", "base", "expected"),
    [
        ("pages/frontier.md", "glossary", "/glossary/pages/frontier"),
        ("../wiki/use-case.md", "glossary", "/glossary/wiki/use-case"),
        ("traceability.md", "wiki", "/glossary/wiki/traceability"),
        ("README.md", "wiki", "/glossary/wiki"),
        ("../glossary/README.md#frontier", "wiki", "/glossary#frontier"),
        ("evidence.md#kinds", "pages", "/glossary/pages/evidence#kinds"),
        ("https://www.iiba.org/", "wiki", "https://www.iiba.org/"),
        ("#local", "pages", "#local"),
    ],
)
def test_dashboard_href(href: str, base: Any, expected: str) -> None:
    assert dashboard_href(href, base) == expected


def test_readme_is_deterministic_and_complete(docs: Path) -> None:
    g = load_ok(docs)
    first, second = render_readme(g), render_readme(load_ok(docs))
    assert first == second
    assert first.endswith("\n") and "\r" not in first
    for entry in g.entries:
        assert f'<a id="{entry.id}"></a>' in first
        assert entry.short in first
    assert "[Alpha in depth](pages/alpha-long.md)" in first
    assert "[BA wiki: Beta concept](../wiki/beta-concept.md)" in first
    assert "Gamma (retired)" in first
    assert first.index("## Pathfinder terms") < first.index("## Business-analysis terms")


# ---- the real glossary (docs/) ------------------------------------------------------------------

REPO_DOCS = Path(__file__).resolve().parents[3] / "docs"

# The 59 terms rated Must or Nice in specs/006-glossary-ba-wiki/term-review.md (FR-003).
EXPECTED_IDS = {
    # Pathfinder (39)
    "run", "mode", "environment", "persona", "state", "fingerprint", "cluster", "settled",
    "transition", "accessible-name", "role", "safety-class", "decision", "top-locator", "target",
    "frontier", "priority-depth", "budget", "portal-scope", "network-call-shape",
    "crawler-open-question", "rule-candidate", "evidence", "trace-process", "process-step",
    "submit-boundary", "tool-call", "run-less-call", "percentiles", "follow-up-task", "layers",
    "analysis-session", "analysis-pass", "gaps", "record-key", "revision", "record-status",
    "status-codes", "reference-portal",
    # BA (20)
    "confidence", "documentation-record", "evidence-link", "relations", "traceability", "review",
    "capability", "screen", "process-record", "use-case", "requirement", "nfr",
    "acceptance-criteria", "business-rule", "decision-table", "data-item", "glossary-term",
    "assumption", "srs", "as-is-documentation",
}  # fmt: skip


def test_real_glossary_is_valid_and_complete() -> None:
    g = load_ok(REPO_DOCS)
    assert {e.id for e in g.entries} == EXPECTED_IDS
    assert len(EXPECTED_IDS) == 59
    assert sum(e.category == "ba" for e in g.entries) == 20


def test_real_glossary_placement_and_pages() -> None:
    g = load_ok(REPO_DOCS)
    intro = {e.id for e in g.entries if e.placement == "intro"}
    assert intro == {"run", "state", "analysis-session", "gaps"}
    assert g.get("frontier").page == "frontier"
    assert g.get("evidence").page == "evidence"


def test_real_glossary_scope_note() -> None:
    g = load_ok(REPO_DOCS)
    assert "not the portal glossary" in g.scope
    assert "GL records" in g.scope


def test_committed_readme_is_up_to_date() -> None:
    g = load_ok(REPO_DOCS)
    committed = (REPO_DOCS / "glossary" / "README.md").read_text(encoding="utf-8")
    assert committed == render_readme(g), "run `uv run pathfinder-glossary --write`"


# The 14 BA wiki pages of research R8 (FR-015).
WIKI_SLUGS = {
    "requirement", "non-functional-requirement", "acceptance-criteria", "business-rule",
    "decision-table", "use-case", "data-dictionary", "glossary", "assumption",
    "business-capability", "process-modelling-as-is", "traceability", "requirements-validation",
    "software-requirements-specification",
}  # fmt: skip


def test_real_wiki_pages_and_links() -> None:
    g = load_ok(REPO_DOCS)
    assert set(g.wiki) == WIKI_SLUGS
    linked = {e.wiki for e in g.entries if e.wiki}
    assert linked == WIKI_SLUGS, "every wiki page is reachable from a glossary entry"
    for page in g.wiki.values():
        assert page.front.citations
        for c in page.front.citations:
            assert c.url.startswith("https://") and c.checked_on and c.edition
        body = page.body
        assert "## What it is" in body and "## How Pathfinder uses it" in body, page.slug


def test_load_is_cached_until_a_file_changes(docs: Path) -> None:
    first = load_ok(docs)
    assert load_glossary(docs) is first
    edit_entry(docs, "gamma", short="A changed test term.")
    second = load_ok(docs)
    assert second is not first
    assert second.get("gamma").short == "A changed test term."
