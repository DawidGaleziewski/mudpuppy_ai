"""The React console's scan page (R-96, spec 054): one scan's summary and tabs, and its graph.
Read-only, no SQL here (G-15)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from .. import queries_app_scan
from .api_common import store
from .deps import web_of

router = APIRouter(prefix="/api")


def _missing(scan: str) -> HTTPException:
    return HTTPException(404, f"There is no scan {scan} in this store.")


@router.get("/scans/{scan}")
def scan_head(request: Request, scan: str, env: str | None = None) -> queries_app_scan.ScanHead:
    """The scan's summary facts and its tabs with their counts."""
    c = web_of(request).ctx(request, env)
    with store(c) as conn:
        head = queries_app_scan.scan_head(conn, scan)
    if head is None:
        raise _missing(scan)
    return head


@router.get("/scans/{scan}/graph")
def scan_graph(request: Request, scan: str, env: str | None = None) -> queries_app_scan.ScanGraph:
    """Where the scan went and what failed (spec 035), placed by the map's layout."""
    c = web_of(request).ctx(request, env)
    with store(c) as conn:
        g = queries_app_scan.scan_graph(conn, scan)
    if g is None:
        raise _missing(scan)
    return g
