"""The header's data-store picker (spec 019 US5, R-71 (d)) as typed JSON: the store a request
reads, a note when the asked one is gone, and the stores to switch to (those holding the chosen
portal's scans, the open one always listed)."""

from __future__ import annotations

from pydantic import BaseModel

from . import db, stores


class StoreOut(BaseModel):
    #: What `?store=` names ("main:sandbox", "eval:<workspace>:sandbox").
    key: str
    label: str
    kind: str
    #: An eval workspace's folder name; None for a main store.
    workspace: str | None
    #: The store file from its data folder ("data/db/sandbox.sqlite"), for the header's menu.
    path: str = ""
    #: The file's size in bytes; None when it can't be read.
    size: int | None = None


class StoreList(BaseModel):
    current: StoreOut
    #: The asked store is gone (an eval workspace deleted since): the default one is shown.
    note: str | None
    stores: list[StoreOut]
    #: The store follows the portal (R-71 (d), R-103 (3)): the store to read `portal` in when the
    #: open one does not hold it and another does; None when the open one is right.
    follow: StoreOut | None = None


def _out(s: stores.Store) -> StoreOut:
    workspace = s.data_dir.parent.name if s.kind == "eval" else None
    file = db.store_path(s.data_dir, s.env)
    try:
        size: int | None = file.stat().st_size
    except OSError:
        size = None
    path = f"{s.data_dir.name}/{file.relative_to(s.data_dir).as_posix()}"
    return StoreOut(
        key=s.key, label=s.label, kind=s.kind, workspace=workspace, path=path, size=size
    )


def store_list(
    every: list[stores.Store], current: stores.Store, note: str | None, portal: str | None
) -> StoreList:
    shown = stores.stores_with_portal(every, portal) if portal else every
    if not any(s.key == current.key for s in shown):
        shown = [current, *shown]
    lands = stores.store_for_portal(every, current, portal) if portal else current
    follow = _out(lands) if lands.key != current.key else None
    return StoreList(
        current=_out(current), note=note, stores=[_out(s) for s in shown], follow=follow
    )
