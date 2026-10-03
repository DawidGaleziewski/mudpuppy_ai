"""Pathfinder's glossary, long pages and BA wiki (spec 006): load, validate, render.

Authored content under `docs/` (data-model.md). Loading never raises: a broken source yields a
`GlossaryError` listing every problem, and the dashboard renders plain labels without it (FR-011).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Literal

import yaml
from markdown_it import MarkdownIt
from markupsafe import Markup
from pydantic import BaseModel, ConfigDict, ValidationError, field_validator

ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
# A sentence boundary: end mark (optionally closed by a quote or bracket), space, then a capital.
# Typographic quotes come from chr() so the source stays ASCII (ruff RUF001).
_CLOSERS = re.escape("\"')" + chr(0x201D) + chr(0x2019))
_OPENERS = re.escape('"(' + chr(0x201C))
SENTENCE_BREAK = re.compile(rf"[.!?][{_CLOSERS}]?\s+(?=[{_OPENERS}]?[A-Z])")
SHORT_MAX = 200
QUOTE_MAX_SENTENCES = 2
README_TITLE = "Pathfinder glossary"
# Raw HTML off, tables on: content can never inject markup (research R3).
_MD = MarkdownIt("js-default")


def sentences(text: str) -> int:
    return 1 + len(SENTENCE_BREAK.findall(text.strip()))


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Retired(_Model):
    # Not `on`: YAML 1.1 reads that key as the boolean true.
    since: date
    replaced_by: str | None = None
    note: str


class Entry(_Model):
    id: str
    term: str
    category: Literal["pathfinder", "ba"]
    group: str
    short: str
    explanation: str
    changed_in: str
    changed_on: date
    labels: tuple[str, ...] = ()
    example: str | None = None
    appears_in: tuple[str, ...] = ()
    related: tuple[str, ...] = ()
    page: str | None = None
    wiki: str | None = None
    placement: Literal["tooltip", "intro"] = "tooltip"
    retired: Retired | None = None

    @field_validator("id")
    @classmethod
    def _kebab(cls, v: str) -> str:
        if not ID.match(v):
            raise ValueError("must be kebab-case (a-z, 0-9, single dashes)")
        return v

    @field_validator("short")
    @classmethod
    def _one_sentence(cls, v: str) -> str:
        v = v.strip()
        if len(v) > SHORT_MAX:
            raise ValueError(f"must be at most {SHORT_MAX} characters, is {len(v)}")
        if sentences(v) != 1 or not v.endswith((".", "?", "!")):
            raise ValueError("must be exactly one sentence ending with a full stop")
        return v

    @field_validator("changed_in")
    @classmethod
    def _roadmap_id(cls, v: str) -> str:
        if not re.match(r"^R-\d{2,}$", v):
            raise ValueError("must be a roadmap id like R-22")
        return v


class Citation(_Model):
    source: str
    edition: str
    section: str | None = None
    url: str
    checked_on: date
    quote: str | None = None

    @field_validator("url")
    @classmethod
    def _https(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("must be an https URL")
        return v

    @field_validator("quote")
    @classmethod
    def _short_quote(cls, v: str | None) -> str | None:
        if v is not None and sentences(v) > QUOTE_MAX_SENTENCES:
            raise ValueError(f"must be at most {QUOTE_MAX_SENTENCES} sentences (FR-014)")
        return v


class WikiFront(_Model):
    title: str
    glossary: tuple[str, ...]
    citations: tuple[Citation, ...]
    changed_in: str
    changed_on: date

    @field_validator("citations")
    @classmethod
    def _at_least_one(cls, v: tuple[Citation, ...]) -> tuple[Citation, ...]:
        if not v:
            raise ValueError("needs at least one citation")
        return v


@dataclass(frozen=True)
class WikiPage:
    slug: str
    front: WikiFront
    body: str


@dataclass(frozen=True)
class GlossaryError:
    problems: list[str]

    def __str__(self) -> str:
        return "; ".join(self.problems)


@dataclass
class Glossary:
    scope: str
    entries: list[Entry]
    pages: dict[str, str]
    wiki: dict[str, WikiPage]
    _by_id: dict[str, Entry] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        self._by_id = {e.id: e for e in self.entries}

    def get(self, entry_id: str) -> Entry | None:
        return self._by_id.get(entry_id)

    def sorted_entries(self) -> list[Entry]:
        """Pathfinder terms first, then BA; groups and entries in the order the file lists them,
        which is a reading order (runs before crawling before documentation)."""
        category = {"pathfinder": 0, "ba": 1}
        group: dict[str, int] = {}
        for e in self.entries:
            group.setdefault(e.group, len(group))
        position = {e.id: i for i, e in enumerate(self.entries)}
        return sorted(
            self.entries, key=lambda e: (category[e.category], group[e.group], position[e.id])
        )

    def groups(self) -> list[tuple[str, str, list[Entry]]]:
        """(category, group, entries) in display order."""
        out: list[tuple[str, str, list[Entry]]] = []
        for e in self.sorted_entries():
            if not out or out[-1][:2] != (e.category, e.group):
                out.append((e.category, e.group, []))
            out[-1][2].append(e)
        return out

    def page_title(self, slug: str) -> str:
        first = self.pages[slug].lstrip().splitlines()[0]
        return first.lstrip("# ").strip()


# ---- loading ----------------------------------------------------------------------------------


def _fmt(file: str, ident: str | None, err: ValidationError) -> list[str]:
    out = []
    for e in err.errors():
        loc = ".".join(str(p) for p in e["loc"]) or "(root)"
        out.append(f"{file}: {ident or '?'}: {loc}: {e['msg']}")
    return out


def _split_front_matter(text: str) -> tuple[dict[str, Any] | None, str]:
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return None, text
    front = yaml.load(text[4:end], Loader=_YAML_LOADER)
    return (front if isinstance(front, dict) else None), text[end + 5 :]


# The C loader when PyYAML was built with libyaml; the pure-Python one is ~10x slower.
_YAML_LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
# docs_dir → (file signature, result). Dev mode re-checks on every request, so an unchanged
# source must not be parsed again.
_CACHE: dict[Path, tuple[tuple[tuple[str, int, int], ...], Glossary | GlossaryError]] = {}


def _signature(docs_dir: Path) -> tuple[tuple[str, int, int], ...]:
    files = [docs_dir / "glossary" / "glossary.yaml"]
    for sub in (docs_dir / "glossary" / "pages", docs_dir / "wiki"):
        if sub.is_dir():
            files += sorted(sub.glob("*.md"))
    sig = []
    for f in files:
        try:
            st = f.stat()
        except OSError:
            sig.append((str(f), -1, -1))
            continue
        sig.append((str(f), st.st_mtime_ns, st.st_size))
    return tuple(sig)


def load_glossary(docs_dir: Path) -> Glossary | GlossaryError:
    """Load and validate; the result is reused until a source file changes."""
    key = docs_dir.resolve()
    sig = _signature(key)
    cached = _CACHE.get(key)
    if cached and cached[0] == sig:
        return cached[1]
    result = _load(key)
    _CACHE[key] = (sig, result)
    return result


def _load(docs_dir: Path) -> Glossary | GlossaryError:
    gdir = docs_dir / "glossary"
    source = gdir / "glossary.yaml"
    rel = "glossary/glossary.yaml"
    try:
        raw = yaml.load(source.read_text(encoding="utf-8"), Loader=_YAML_LOADER)
    except OSError as e:
        return GlossaryError([f"{rel}: cannot read: {e.strerror or e}"])
    except yaml.YAMLError as e:
        return GlossaryError([f"{rel}: invalid YAML: {e}"])
    if not isinstance(raw, dict) or not isinstance(raw.get("entries"), list):
        return GlossaryError([f"{rel}: must be a mapping with `scope` and an `entries` list"])

    problems: list[str] = []
    scope = raw.get("scope")
    if not isinstance(scope, str) or not scope.strip():
        problems.append(f"{rel}: scope: required text")

    entries: list[Entry] = []
    seen: set[str] = set()
    for i, item in enumerate(raw["entries"]):
        ident = item.get("id") if isinstance(item, dict) else None
        try:
            entry = Entry.model_validate(item)
        except ValidationError as e:
            problems.extend(_fmt(rel, ident or f"entries[{i}]", e))
            continue
        if entry.id in seen:
            problems.append(f"{rel}: {entry.id}: id: duplicate")
        seen.add(entry.id)
        entries.append(entry)

    pages: dict[str, str] = {}
    pdir = gdir / "pages"
    if pdir.is_dir():
        for p in sorted(pdir.glob("*.md")):
            pages[p.stem] = p.read_text(encoding="utf-8")

    wiki: dict[str, WikiPage] = {}
    wdir = docs_dir / "wiki"
    if wdir.is_dir():
        for p in sorted(wdir.glob("*.md")):
            if p.name == "README.md":
                continue
            wrel = f"wiki/{p.name}"
            try:
                front, body = _split_front_matter(p.read_text(encoding="utf-8"))
            except yaml.YAMLError as e:
                problems.append(f"{wrel}: invalid front matter: {e}")
                continue
            if front is None:
                problems.append(f"{wrel}: missing YAML front matter")
                continue
            try:
                wiki[p.stem] = WikiPage(p.stem, WikiFront.model_validate(front), body)
            except ValidationError as e:
                problems.extend(_fmt(wrel, p.stem, e))

    ids = {e.id for e in entries}
    for e in entries:
        for r in e.related:
            if r not in ids:
                problems.append(f"{rel}: {e.id}: related: unknown id {r!r}")
        if e.retired and e.retired.replaced_by and e.retired.replaced_by not in ids:
            problems.append(f"{rel}: {e.id}: retired.replaced_by: unknown id")
        if e.page and e.page not in pages:
            problems.append(f"{rel}: {e.id}: page: no file glossary/pages/{e.page}.md")
        if e.wiki:
            page = wiki.get(e.wiki)
            if page is None:
                if not (wdir / f"{e.wiki}.md").exists():
                    problems.append(f"{rel}: {e.id}: wiki: no file wiki/{e.wiki}.md")
            elif e.id not in page.front.glossary:
                problems.append(f"wiki/{e.wiki}.md: {e.wiki}: glossary: does not list {e.id!r}")
    for slug, page in wiki.items():
        for gid in page.front.glossary:
            entry = next((e for e in entries if e.id == gid), None)
            if entry is None:
                problems.append(f"wiki/{slug}.md: {slug}: glossary: unknown id {gid!r}")
            elif entry.wiki != slug:
                problems.append(f"{rel}: {gid}: wiki: should be {slug!r} (listed by that page)")

    if problems:
        return GlossaryError(problems)
    return Glossary(scope=str(scope).strip(), entries=entries, pages=pages, wiki=wiki)


# ---- HTML (dashboard) -------------------------------------------------------------------------

Base = Literal["glossary", "pages", "wiki"]


def dashboard_href(href: str, base: Base) -> str:
    """Map a repository-relative Markdown link, written from folder `base`, to its route."""
    if "://" in href or href.startswith(("/", "#", "mailto:")):
        return href
    path, _, anchor = href.partition("#")
    if not path.endswith(".md"):
        return href
    parts = [p for p in path.split("/") if p not in ("", ".", "..")]
    name = parts[-1][: -len(".md")]
    folder = parts[-2] if len(parts) > 1 else base
    tail = f"#{anchor}" if anchor else ""
    if folder == "wiki":
        return ("/glossary/wiki" if name == "README" else f"/glossary/wiki/{name}") + tail
    if name == "README":
        return "/glossary" + tail
    return f"/glossary/pages/{name}{tail}"


def markdown_html(text: str, base: Base = "glossary") -> Markup:
    tokens = _MD.parse(text)
    for tok in tokens:
        for child in tok.children or ():
            if child.type == "link_open":
                child.attrSet("href", dashboard_href(str(child.attrGet("href") or ""), base))
    # Safe to mark up: the parser has raw HTML disabled, so only generated tags reach the page.
    return Markup(_MD.renderer.render(tokens, _MD.options, {}))


# ---- README (repository view) -----------------------------------------------------------------

CATEGORY_TITLES = {"pathfinder": "Pathfinder terms", "ba": "Business-analysis terms"}


def render_readme(g: Glossary) -> str:
    """Deterministic Markdown view of the glossary (contracts/glossary-cli.md)."""
    lines = [
        f"# {README_TITLE}",
        "",
        "<!-- Generated from glossary.yaml by `uv run pathfinder-glossary --write` "
        "(apps/dashboard). Do not edit by hand. -->",
        "",
        g.scope,
        "",
    ]
    current_cat = None
    for cat, group, entries in g.groups():
        if cat != current_cat:
            lines += [f"## {CATEGORY_TITLES[cat]}", ""]
            current_cat = cat
        lines += [f"### {group}", ""]
        for e in entries:
            title = e.term + (" (retired)" if e.retired else "")
            lines += [f'<a id="{e.id}"></a>', "", f"#### {title}", "", f"**{e.short}**", ""]
            lines += [e.explanation.strip(), ""]
            if e.example:
                lines += [f"*Example:* {e.example.strip()}", ""]
            if e.appears_in:
                lines += ["*Seen in:* " + "; ".join(e.appears_in), ""]
            if e.labels:
                lines += ["*Labels:* " + ", ".join(f"`{x}`" for x in e.labels), ""]
            if e.related:
                links = []
                for r in e.related:
                    target = g.get(r)
                    links.append(f"[{target.term if target else r}](#{r})")
                lines += ["*Related:* " + ", ".join(links), ""]
            more = []
            if e.page:
                more.append(f"[{g.page_title(e.page)}](pages/{e.page}.md)")
            if e.wiki and e.wiki in g.wiki:
                more.append(f"[BA wiki: {g.wiki[e.wiki].front.title}](../wiki/{e.wiki}.md)")
            if more:
                lines += ["*Read more:* " + ", ".join(more), ""]
            if e.retired:
                repl = (
                    f" Replaced by [{e.retired.replaced_by}](#{e.retired.replaced_by})."
                    if (e.retired.replaced_by)
                    else ""
                )
                lines += [f"*Retired on {e.retired.since}:* {e.retired.note}{repl}", ""]
            lines += [f"<sub>Last changed in {e.changed_in}, {e.changed_on}.</sub>", ""]
    return "\n".join(lines).rstrip("\n") + "\n"
