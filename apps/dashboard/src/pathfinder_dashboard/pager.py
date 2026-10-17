"""Offset paging for the list pages (R-71 (a), spec 034 FR-021): 25 items per page, the total,
and Previous / Next links that keep the list's filters. Filters and search run before paging, so
they cover every item, not only the page shown.

`paginate` slices a list a query module already built; a list too large for that pages in SQL
through `paged_from_count`.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

PAGE_SIZE = 25


def page_number(raw: str | int | None) -> int:
    """`?page=` as a page number; anything that is not a positive number is page 1."""
    try:
        return max(int(raw or 1), 1)
    except (TypeError, ValueError):
        return 1


@dataclass(frozen=True)
class Paged[T]:
    items: list[T]
    total: int
    page: int
    size: int = PAGE_SIZE

    @property
    def pages(self) -> int:
        return max(1, -(-self.total // self.size))

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size

    @property
    def first(self) -> int:
        """1-based position of the first item shown; 0 for an empty list."""
        return self.offset + 1 if self.items else 0

    @property
    def last(self) -> int:
        return self.offset + len(self.items)

    @property
    def has_prev(self) -> bool:
        return self.page > 1

    @property
    def has_next(self) -> bool:
        return self.page < self.pages


def clamp(page: int, total: int, size: int = PAGE_SIZE) -> int:
    """A page past the end shows the last page (spec 034 edge case)."""
    return min(max(page, 1), max(1, -(-total // size)))


def paginate[T](items: Sequence[T], page: int, size: int = PAGE_SIZE) -> Paged[T]:
    page = clamp(page, len(items), size)
    start = (page - 1) * size
    return Paged(list(items[start : start + size]), len(items), page, size)


def paged_from_count[T](
    total: int, page: int, fetch: Callable[[int, int], list[T]], size: int = PAGE_SIZE
) -> Paged[T]:
    """Page in SQL: `fetch(limit, offset)` reads one page after the total is known."""
    page = clamp(page, total, size)
    return Paged(fetch(size, (page - 1) * size), total, page, size)


@dataclass(frozen=True)
class PageLinks[T]:
    """What the `pages` macro draws: position, total and the neighbour pages' links."""

    paged: Paged[T]
    prev_url: str | None
    next_url: str | None


def links[T](paged: Paged[T], url: Callable[[int | None], str]) -> PageLinks[T]:
    """`url(page)` builds the list's link for a page (None = page 1, so its link stays short)."""
    prev = None
    if paged.has_prev:
        prev = url(paged.page - 1 if paged.page > 2 else None)
    nxt = url(paged.page + 1) if paged.has_next else None
    return PageLinks(paged, prev, nxt)
