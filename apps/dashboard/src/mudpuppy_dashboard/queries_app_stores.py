"""The header's data-store picker (spec 019 US5, R-71 (d)) as typed JSON: the store a request
reads, a note when the asked one is gone, and the stores to switch to (those holding the chosen
portal's scans, the open one always listed)."""

from __future__ import annotations

from pydantic import BaseModel

from . import stores


class StoreOut(BaseModel):
    #: What `?store=` names ("main:sandbox", "eval:<workspace>:sandbox").
    key: str
    label: str
    kind: str
    #: An eval workspace's folder name; None for a main store.
    workspace: str | None


class StoreList(BaseModel):
    current: StoreOut
    #: The asked store is gone (an eval workspace deleted since): the default one is shown.
    note: str | None
    stores: list[StoreOut]


def _out(s: stores.Store) -> StoreOut:
    workspace = s.data_dir.parent.name if s.kind == "eval" else None
    return StoreOut(key=s.key, label=s.label, kind=s.kind, workspace=workspace)


def store_list(
    every: list[stores.Store], current: stores.Store, note: str | None, portal: str | None
) -> StoreList:
    shown = stores.stores_with_portal(every, portal) if portal else every
    if not any(s.key == current.key for s in shown):
        shown = [current, *shown]
    return StoreList(current=_out(current), note=note, stores=[_out(s) for s in shown])
