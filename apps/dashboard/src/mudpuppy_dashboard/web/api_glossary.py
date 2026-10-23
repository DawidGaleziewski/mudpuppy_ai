"""The React console's glossary and BA wiki (R-100, spec 071; spec 006): the terms by group with
their explanations rendered from markdown (no raw HTML, links to the console's glossary pages),
the longer pages, and the wiki with its cited sources. No store needed."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .. import glossary
from .deps import web_of

router = APIRouter(prefix="/api/glossary")


class Ref(BaseModel):
    id: str
    title: str


class Retired(BaseModel):
    since: date
    note: str
    replaced_by: Ref | None


class Term(BaseModel):
    id: str
    term: str
    category: str
    short: str
    #: The explanation as HTML (markdown without raw HTML).
    html: str
    example: str | None
    appears_in: list[str]
    related: list[Ref]
    page: Ref | None
    wiki: Ref | None
    retired: Retired | None
    changed_in: str
    changed_on: date


class Group(BaseModel):
    category: str
    group: str
    terms: list[Term]


class GlossaryPage(BaseModel):
    scope: str
    q: str
    groups: list[Group]
    #: Why the glossary could not be loaded; then there are no groups.
    problems: list[str]


class Article(BaseModel):
    title: str
    html: str


class Citation(BaseModel):
    source: str
    edition: str
    section: str | None
    url: str
    checked_on: date
    quote: str | None


class WikiPage(BaseModel):
    slug: str
    title: str
    html: str
    terms: list[Ref]
    citations: list[Citation]
    changed_in: str
    changed_on: date


class WikiRow(BaseModel):
    slug: str
    title: str
    terms: list[Ref]
    sources: int


def _ref(g: glossary.Glossary, entry_id: str) -> Ref:
    e = g.get(entry_id)
    return Ref(id=entry_id, title=e.term if e else entry_id)


def _term(g: glossary.Glossary, e: glossary.Entry) -> Term:
    wiki = Ref(id=e.wiki, title=g.wiki[e.wiki].front.title) if e.wiki and e.wiki in g.wiki else None
    retired = (
        Retired(
            since=e.retired.since,
            note=e.retired.note,
            replaced_by=_ref(g, e.retired.replaced_by) if e.retired.replaced_by else None,
        )
        if e.retired
        else None
    )
    return Term(
        id=e.id,
        term=e.term,
        category=e.category,
        short=e.short,
        html=str(glossary.markdown_html(e.explanation)),
        example=e.example,
        appears_in=list(e.appears_in),
        related=[_ref(g, r) for r in e.related],
        page=Ref(id=e.page, title=g.page_title(e.page)) if e.page else None,
        wiki=wiki,
        retired=retired,
        changed_in=e.changed_in,
        changed_on=e.changed_on,
    )


def _loaded(request: Request) -> glossary.Glossary:
    g = web_of(request).glossary_or_none()
    if g is None:
        raise HTTPException(
            404, "The glossary could not be loaded: fix docs/glossary/glossary.yaml."
        )
    return g


@router.get("")
def terms(request: Request, q: str = "") -> GlossaryPage:
    """Groups in reading order, keeping the terms whose term, labels or short text contain `q`."""
    g = web_of(request).current_glossary()
    if isinstance(g, glossary.GlossaryError):
        return GlossaryPage(scope="", q=q, groups=[], problems=g.problems[:10])
    needle = q.strip().casefold()
    groups = []
    for category, group, entries in g.groups():
        kept = [
            e
            for e in entries
            if not needle or needle in " ".join((e.term, e.short, *e.labels)).casefold()
        ]
        if kept:
            groups.append(Group(category=category, group=group, terms=[_term(g, e) for e in kept]))
    return GlossaryPage(scope=g.scope, q=q.strip(), groups=groups, problems=[])


@router.get("/pages/{slug}")
def page(request: Request, slug: str) -> Article:
    g = _loaded(request)
    if slug not in g.pages:
        raise HTTPException(404, f"There is no glossary page {slug}.")
    return Article(
        title=g.page_title(slug), html=str(glossary.markdown_html(g.pages[slug], base="pages"))
    )


@router.get("/wiki")
def wiki(request: Request) -> list[WikiRow]:
    g = _loaded(request)
    pages = sorted(g.wiki.values(), key=lambda p: p.front.title.casefold())
    return [
        WikiRow(
            slug=p.slug,
            title=p.front.title,
            terms=[_ref(g, t) for t in p.front.glossary],
            sources=len(p.front.citations),
        )
        for p in pages
    ]


@router.get("/wiki/{slug}")
def wiki_page(request: Request, slug: str) -> WikiPage:
    g = _loaded(request)
    if slug not in g.wiki:
        raise HTTPException(404, f"There is no wiki page {slug}.")
    p = g.wiki[slug]
    return WikiPage(
        slug=slug,
        title=p.front.title,
        html=str(glossary.markdown_html(p.body, base="wiki")),
        terms=[_ref(g, t) for t in p.front.glossary],
        citations=[Citation(**c.model_dump()) for c in p.front.citations],
        changed_in=p.front.changed_in,
        changed_on=p.front.changed_on,
    )
