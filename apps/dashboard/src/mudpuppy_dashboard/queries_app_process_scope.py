"""The process page's scope and merges as typed JSON (spec 078; designer T-05, T-06): the screens
in its scope that no observed move reaches yet, whether a merge absorbed it, the merges it took
part in (History's events, with Split back) and its to-be models branched from another process's
as-is. Read-only."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from . import queries_process_scope as qps


class OffPathOut(BaseModel):
    state: str
    title: str
    route: str


class MergeOut(BaseModel):
    id: str
    kept_key: str
    kept_name: str
    absorbed_key: str
    absorbed_name: str
    by: str
    reason: str | None
    at: str
    #: When it was undone or split back; None while it holds.
    undone_at: str | None


class ScopeOut(BaseModel):
    #: "Not on the observed path yet": in the scope, in no step; Explore from here finds the path.
    off_path: list[OffPathOut]
    #: The merge that absorbed this process ("Merged into PRC-001"); None when none did.
    merged_into: MergeOut | None
    merges: list[MergeOut]
    #: To-be models moved over by a merge: "branched from another as-is", re-base before Compare.
    from_other: list[str]


def _merge(m: qps.Merge) -> MergeOut:
    return MergeOut(
        id=m.id,
        kept_key=m.kept_key,
        kept_name=m.kept_name,
        absorbed_key=m.absorbed_key,
        absorbed_name=m.absorbed_name,
        by=m.author,
        reason=m.reason,
        at=m.at,
        undone_at=m.undone_at,
    )


def scope_out(conn: sqlite3.Connection, process_id: str) -> ScopeOut:
    into = qps.merged_into(conn, process_id)
    return ScopeOut(
        off_path=[
            OffPathOut(state=o.state, title=o.title, route=o.route)
            for o in qps.off_path(conn, process_id)
        ],
        merged_into=_merge(into) if into else None,
        merges=[_merge(m) for m in qps.merges_of(conn, process_id)],
        from_other=sorted(qps.from_other_process(conn, process_id)),
    )
