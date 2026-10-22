"""Glossary loader edge cases (spec 012 F-12): one fixture per error message, exact texts, and the
reload cache. Complements test_glossary.py, whose checks are substring-based."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

import pytest
import yaml

from mudpuppy_dashboard.glossary import (
    Glossary,
    GlossaryError,
    _split_front_matter,
    load_glossary,
)

FIXTURE = Path(__file__).parent / "fixtures" / "glossary" / "docs"
REL = "glossary/glossary.yaml"


@pytest.fixture
def docs(tmp_path: Path) -> Path:
    target = tmp_path / "docs"
    shutil.copytree(FIXTURE, target)
    return target


def errors(docs_dir: Path) -> list[str]:
    g = load_glossary(docs_dir)
    assert isinstance(g, GlossaryError), "expected the glossary to be rejected"
    return g.problems


def write_yaml(docs_dir: Path, text: str) -> None:
    (docs_dir / "glossary" / "glossary.yaml").write_text(text, encoding="utf-8")


def edit(docs_dir: Path, change: Any) -> None:
    path = docs_dir / "glossary" / "glossary.yaml"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    change(data)
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")


def touch_later(path: Path, text: str) -> None:
    """Rewrite `path` with a different size and a later mtime, so the cache sees the change."""
    st = path.stat()
    path.write_text(text, encoding="utf-8")
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))


# ---- top-level shape ----------------------------------------------------------------------------


def test_missing_file_names_the_file_and_the_reason(tmp_path: Path) -> None:
    g = load_glossary(tmp_path / "nowhere")
    assert isinstance(g, GlossaryError)
    assert g.problems == [f"{REL}: cannot read: No such file or directory"]


def test_invalid_yaml_names_the_file(docs: Path) -> None:
    write_yaml(docs, "entries: [unclosed\n")
    [problem] = errors(docs)
    assert problem.startswith(f"{REL}: invalid YAML: ")


@pytest.mark.parametrize("text", ["- a\n", "scope: x\nentries: 3\n"])
def test_not_a_mapping_with_an_entries_list(docs: Path, text: str) -> None:
    write_yaml(docs, text)
    assert errors(docs) == [f"{REL}: must be a mapping with `scope` and an `entries` list"]


@pytest.mark.parametrize("scope", [None, "   "])
def test_scope_is_required_text(docs: Path, scope: str | None) -> None:
    edit(docs, lambda d: d.update(scope=scope) if scope is not None else d.pop("scope"))
    assert errors(docs) == [f"{REL}: scope: required text"]


def test_scope_is_stripped(docs: Path) -> None:
    edit(docs, lambda d: d.update(scope="  Test glossary.  "))
    g = load_glossary(docs)
    assert isinstance(g, Glossary)
    assert g.scope == "Test glossary."


# ---- entries ------------------------------------------------------------------------------------


def test_a_non_mapping_entry_is_named_by_position(docs: Path) -> None:
    edit(docs, lambda d: d["entries"].append("just text"))
    n = len(yaml.safe_load((FIXTURE / "glossary" / "glossary.yaml").read_text())["entries"])
    [problem] = errors(docs)
    assert problem.startswith(f"{REL}: entries[{n}]: (root): ")


def test_every_invalid_entry_is_reported(docs: Path) -> None:
    def drop_short(d: dict[str, Any]) -> None:
        for e in d["entries"]:
            e.pop("short", None)

    edit(docs, drop_short)
    probs = errors(docs)
    fixture = yaml.safe_load((FIXTURE / "glossary" / "glossary.yaml").read_text())
    ids = [e["id"] for e in fixture["entries"]]
    assert [p for p in probs if p.endswith("short: Field required")] == [
        f"{REL}: {i}: short: Field required" for i in ids
    ]


def test_error_str_joins_problems_with_semicolons() -> None:
    assert str(GlossaryError(["a", "b"])) == "a; b"


# ---- wiki pages ---------------------------------------------------------------------------------


def test_wiki_readme_is_not_a_page(docs: Path) -> None:
    (docs / "wiki" / "README.md").write_text("# Wiki\n\nNo front matter here.\n", encoding="utf-8")
    g = load_glossary(docs)
    assert isinstance(g, Glossary), g
    assert set(g.wiki) == {"beta-concept"}
    page = g.wiki["beta-concept"]
    assert page.slug == "beta-concept"
    assert page.body.strip() != ""


def test_every_bad_wiki_page_is_reported(docs: Path) -> None:
    (docs / "wiki" / "x1.md").write_text("---\n: [\n---\nbody\n", encoding="utf-8")
    (docs / "wiki" / "x2.md").write_text("---\n: [\n---\nbody\n", encoding="utf-8")
    (docs / "wiki" / "y1.md").write_text("no front matter\n", encoding="utf-8")
    (docs / "wiki" / "y2.md").write_text("no front matter\n", encoding="utf-8")
    probs = errors(docs)
    assert [p.split(":")[0] for p in probs if "invalid front matter" in p] == [
        "wiki/x1.md",
        "wiki/x2.md",
    ]
    assert [p for p in probs if "missing YAML front matter" in p] == [
        "wiki/y1.md: missing YAML front matter",
        "wiki/y2.md: missing YAML front matter",
    ]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("---\ntitle: x\n---\nbody\n---\nmore", ({"title": "x"}, "body\n---\nmore")),
        ("---\ntitle: x\n", (None, "---\ntitle: x\n")),
        ("---\n- a\n---\nbody", (None, "body")),
        ("no front matter", (None, "no front matter")),
    ],
)
def test_split_front_matter(text: str, expected: tuple[Any, str]) -> None:
    assert _split_front_matter(text) == expected


# ---- pages and the reload cache ----------------------------------------------------------------


def test_page_title_skips_leading_blank_lines_and_hashes_only(docs: Path) -> None:
    (docs / "glossary" / "pages" / "alpha-long.md").write_text(
        "\n\n# Xenon in depth\n\nBody.\n", encoding="utf-8"
    )
    g = load_glossary(docs)
    assert isinstance(g, Glossary), g
    assert g.page_title("alpha-long") == "Xenon in depth"


def test_a_changed_page_or_wiki_file_is_reloaded(docs: Path) -> None:
    first = load_glossary(docs)
    assert isinstance(first, Glossary)
    page = docs / "glossary" / "pages" / "alpha-long.md"
    touch_later(page, "# Alpha renamed\n\nLonger body than before, to change the size.\n")
    second = load_glossary(docs)
    assert isinstance(second, Glossary)
    assert second.page_title("alpha-long") == "Alpha renamed"

    wiki = docs / "wiki" / "beta-concept.md"
    touch_later(wiki, wiki.read_text(encoding="utf-8") + "\nOne more line.\n")
    third = load_glossary(docs)
    assert isinstance(third, Glossary)
    assert third.wiki["beta-concept"].body.endswith("One more line.\n")
