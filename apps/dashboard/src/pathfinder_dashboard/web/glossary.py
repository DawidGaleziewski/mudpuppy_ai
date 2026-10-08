"""Glossary pages (spec 006; contracts/dashboard-ui.md). No store needed."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import glossary
from .deps import Ctx, Web, web_of

router = APIRouter()


def glossary_groups(g: glossary.Glossary, q: str) -> list[tuple[str, str, list[glossary.Entry]]]:
    """Groups in reading order, keeping entries whose term, labels or short text contain `q`."""
    needle = q.strip().casefold()

    def match(e: glossary.Entry) -> bool:
        haystack = " ".join((e.term, e.short, *e.labels)).casefold()
        return not needle or needle in haystack

    out = []
    for category, group, entries in g.groups():
        kept = [e for e in entries if match(e)]
        if kept:
            out.append((category, group, kept))
    return out


def glossary_not_found(web: Web, c: Ctx, what: str) -> HTMLResponse:
    return web.render(c, "glossary_not_found.html", 404, what=what, nav_current="glossary")


@router.get("/glossary", response_class=HTMLResponse)
def glossary_index(request: Request, env: str | None = None, q: str = "") -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    g = web.current_glossary()
    if isinstance(g, glossary.GlossaryError):
        return web.render(c, "glossary.html", nav_current="glossary", error=g, q=q, groups=[])
    return web.render(
        c,
        "glossary.html",
        nav_current="glossary",
        g=g,
        q=q.strip(),
        groups=glossary_groups(g, q),
        error=None,
    )


@router.get("/glossary/pages/{slug}", response_class=HTMLResponse)
def glossary_page(request: Request, slug: str, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    g = web.glossary_or_none()
    if g is None or slug not in g.pages:
        return glossary_not_found(web, c, f"glossary page {slug}")
    return web.render(
        c,
        "glossary_page.html",
        nav_current="glossary",
        title=g.page_title(slug),
        body=glossary.markdown_html(g.pages[slug], base="pages"),
    )


@router.get("/glossary/wiki", response_class=HTMLResponse)
def wiki_index(request: Request, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    g = web.glossary_or_none()
    if g is None:
        return glossary_not_found(web, c, "BA wiki (the glossary could not be loaded)")
    pages = sorted(g.wiki.values(), key=lambda p: p.front.title.casefold())
    return web.render(c, "wiki.html", nav_current="glossary", g=g, pages=pages)


@router.get("/glossary/wiki/{slug}", response_class=HTMLResponse)
def wiki_page(request: Request, slug: str, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    g = web.glossary_or_none()
    if g is None or slug not in g.wiki:
        return glossary_not_found(web, c, f"wiki page {slug}")
    page = g.wiki[slug]
    return web.render(
        c,
        "wiki_page.html",
        nav_current="glossary",
        g=g,
        page=page,
        body=glossary.markdown_html(page.body, base="wiki"),
    )
