"""Screenshots, layouts, wireframes and highlights of recorded states (spec 008).

Read-only: images are files the crawler wrote to `data/evidence/`; this module only finds them,
reads layout JSON and turns element boxes into percentage overlays. It never renders a wireframe
and never computes an element key: the layout stores the keys the crawler computed.
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

from pydantic import BaseModel, ValidationError

from .models import ResolvedEvidence, State, StateWireframe

# Only images and wireframes are served; snapshots, shapes and layouts never are
# (contracts/dashboard-routes.md).
EVIDENCE_IMAGE = re.compile(r"^[0-9a-f]{64}\.(png|svg|excalidraw)$")
EVIDENCE_REF = re.compile(r"^[0-9a-f]{64}\.[a-z0-9]{1,10}$")
FIGURES_OPEN = 3  # the Screens panel is collapsed above this many figures


class LayoutBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class LayoutElement(BaseModel):
    key: str
    role: str
    name: str
    box: LayoutBox | None


class LayoutSize(BaseModel):
    width: int
    height: int


class Layout(BaseModel):
    """Mirror of `@pathfinder/core` `Layout` (spec 008 data-model.md)."""

    version: int
    viewport: LayoutSize
    page: LayoutSize
    cut: bool
    elements: list[LayoutElement]

    def box_of(self, key: str) -> LayoutBox | None:
        for e in self.elements:
            if e.key == key:
                return e.box
        return None


def evidence_path(data_dir: Path, ref: str) -> Path | None:
    """The file for a content-addressed ref, or None for anything that is not one (no traversal)."""
    if not EVIDENCE_REF.match(ref):
        return None
    return data_dir / "evidence" / ref


def load_layout(data_dir: Path, ref: str | None) -> Layout | None:
    """The state's layout, or None when there is none, the file is gone or it does not parse."""
    path = evidence_path(data_dir, ref) if ref else None
    if path is None or not path.is_file():
        return None
    try:
        return Layout.model_validate(json.loads(path.read_text("utf-8")))
    except (ValueError, ValidationError):
        return None


class Highlight(BaseModel):
    """One numbered outline over a screenshot, in percent of the image so it scales with it."""

    n: int
    key: str
    note: str | None
    visible: bool  # False: the element has no box (hidden, empty or below the cut)
    left: float = 0
    top: float = 0
    width: float = 0
    height: float = 0


class Figure(BaseModel):
    """A state's picture: its screenshot (or wireframe when there is none) plus highlights."""

    state: State
    wireframe: StateWireframe | None
    page_width: int | None
    page_height: int | None
    cut: bool
    highlights: list[Highlight]

    @property
    def has_screenshot(self) -> bool:
        return self.state.screenshot_ref is not None

    @property
    def has_picture(self) -> bool:
        return self.has_screenshot or self.wireframe is not None


def highlights(layout: Layout | None, regions: list[tuple[str, str | None]]) -> list[Highlight]:
    """Number the regions in order and place each one over the screenshot."""
    out = []
    for i, (key, note) in enumerate(regions, start=1):
        box = layout.box_of(key) if layout else None
        if layout is None or box is None:
            out.append(Highlight(n=i, key=key, note=note, visible=False))
            continue
        w, h = layout.page.width, layout.page.height
        out.append(
            Highlight(
                n=i,
                key=key,
                note=note,
                visible=True,
                left=round(100 * box.x / w, 3),
                top=round(100 * box.y / h, 3),
                width=round(100 * box.width / w, 3),
                height=round(100 * box.height / h, 3),
            )
        )
    return out


def _state(conn: sqlite3.Connection, state_id: str) -> State | None:
    row = conn.execute("SELECT * FROM states WHERE id = ?", (state_id,)).fetchone()
    return State.model_validate(dict(row)) if row else None


def _has_table(conn: sqlite3.Connection, name: str) -> bool:
    return (
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
        ).fetchone()
        is not None
    )


def wireframe_of(conn: sqlite3.Connection, state_id: str) -> StateWireframe | None:
    """None also for a store migrated before 0006 (no wireframes table yet)."""
    if not _has_table(conn, "state_wireframes"):
        return None
    row = conn.execute("SELECT * FROM state_wireframes WHERE state_id = ?", (state_id,)).fetchone()
    return StateWireframe.model_validate(dict(row)) if row else None


def figure(
    conn: sqlite3.Connection,
    data_dir: Path,
    state: State,
    regions: list[tuple[str, str | None]],
) -> Figure:
    layout = load_layout(data_dir, state.layout_ref)
    return Figure(
        state=state,
        wireframe=wireframe_of(conn, state.id),
        page_width=layout.page.width if layout else None,
        page_height=layout.page.height if layout else None,
        cut=layout.cut if layout else False,
        highlights=highlights(layout, regions),
    )


def record_figures(
    conn: sqlite3.Connection, data_dir: Path, evidence: list[ResolvedEvidence]
) -> list[Figure]:
    """One figure per state the revision cites (as a state or a screen region), in link order,
    each with only this revision's regions."""
    order: list[str] = []
    regions: dict[str, list[tuple[str, str | None]]] = {}
    for e in evidence:
        link = e.link
        if link.target_kind not in ("state", "screen_region") or e.broken:
            continue
        if link.target_id not in regions:
            order.append(link.target_id)
            regions[link.target_id] = []
        if link.target_kind == "screen_region" and link.region:
            regions[link.target_id].append((link.region, link.note))
    out = []
    for state_id in order:
        state = _state(conn, state_id)
        if state is not None:
            out.append(figure(conn, data_dir, state, regions[state_id]))
    return out


class CitingRecord(BaseModel):
    key: str
    title: str
    portal_id: str
    regions: list[str]


class StatePage(BaseModel):
    figure: Figure
    elements: list[Highlight]  # every boxed element, for the "Show elements" overlay
    element_count: int
    citing: list[CitingRecord]


def citing_records(conn: sqlite3.Connection, state_id: str) -> list[CitingRecord]:
    """Records whose latest revision cites this state or one of its regions."""
    if not _has_table(conn, "doc_evidence_links"):
        return []
    has_region = any(
        r[1] == "region" for r in conn.execute("PRAGMA table_info(doc_evidence_links)")
    )
    rows = conn.execute(
        "SELECT r.key, r.title, r.portal_id, "
        + ("e.region" if has_region else "NULL AS region")
        + " FROM doc_evidence_links e"
        " JOIN doc_revisions v ON v.id = e.revision_id"
        " JOIN doc_records r ON r.id = v.record_id AND r.latest_rev = v.rev_no"
        " WHERE e.target_kind IN ('state', 'screen_region') AND e.target_id = ?"
        " ORDER BY r.key, region",
        (state_id,),
    ).fetchall()
    by_key: dict[str, CitingRecord] = {}
    for r in rows:
        c = by_key.setdefault(
            r["key"],
            CitingRecord(key=r["key"], title=r["title"], portal_id=r["portal_id"], regions=[]),
        )
        if r["region"] and r["region"] not in c.regions:
            c.regions.append(r["region"])
    return list(by_key.values())


def state_page(conn: sqlite3.Connection, data_dir: Path, state_id: str) -> StatePage | None:
    state = _state(conn, state_id)
    if state is None:
        return None
    layout = load_layout(data_dir, state.layout_ref)
    elements = (
        highlights(layout, [(e.key, None) for e in layout.elements if e.box is not None])
        if layout
        else []
    )
    return StatePage(
        figure=figure(conn, data_dir, state, []),
        elements=elements,
        element_count=len(layout.elements) if layout else 0,
        citing=citing_records(conn, state_id),
    )
