"""A stored Workbench view as A2UI v0.9.1 (spec 075, the R-96 spike; designer 19-console-answers/
13-a2ui-catalogue.md, stage 1): the assistant keeps composing view specs (`render_view`), and the
server compiles each into the components of the Workbench catalog. Components carry ids and
options; the server adds `data`, the path in the data model where their live values are, and
writes the data model itself. View and CommandCard are the server's. `Choice` is the spike's own
server-owned frame for the assistant's `ask_choice` (not in the designer's catalog yet). Pure: no
store access."""

from __future__ import annotations

from typing import Any

VERSION = "v0.9.1"
CATALOG_ID = "https://mudpuppy.local/a2ui/catalogs/workbench/v1/catalog.json"

# Where each component's data is (the catalog's `x-mudpuppy.dataPath`; test_wb_a2ui checks them
# against `packages/workbench-contract/workbench/a2ui/catalog.json`).
DATA_PATHS = {
    "LiveMap": "/scans/{scan}",
    "ScanMeter": "/scans/{scan}/meter",
    "PageMiniature": "/scans/{scan}/pages",
    "PageDetail": "/scans/{scan}/pages",
    "Narration": "/scans/{scan}/narration",
    "ErrorCard": "/scans/{scan}/stop",
    "StepShot": "/scans/{scan}/steps/{step}",
    "EventTail": "/scans/{scan}/events",
    "FixChoices": "/scans/{scan}/fixes/{step}",
    "AttemptList": "/scans/{scan}/attempts/{step}",
    "Compare": "/changes/{change}",
    "DecisionTable": "/rules/{rule}",
    "FindingCard": "/findings/{finding}",
    "RecordCard": "/records/{record}",
    "RecordList": "/records",
    "View": "/view",
    "CommandCard": "/commands/{id}",
}

SERVER_OWNED = ("View", "CommandCard", "Choice")


def data_path(component: str, bind: dict[str, Any], component_id: str) -> str:
    """The component's data path with its bound ids filled in."""
    path = DATA_PATHS[component]
    for key, value in bind.items():
        path = path.replace("{" + key + "}", str(value))
    return path.replace("{id}", component_id)


def compile_component(comp: dict[str, Any]) -> dict[str, Any] | None:
    """One view-spec component as an A2UI component, or None when the server owns its type."""
    kind = comp["type"]
    if kind in SERVER_OWNED or kind not in DATA_PATHS:
        return None
    bind = comp.get("bind", {})
    return {
        "id": comp["id"],
        "component": kind,
        **bind,
        **comp.get("props", {}),
        "data": {"path": data_path(kind, bind, comp["id"])},
    }


def view_root(
    path: str, why: str | None, children: list[str], suggestions: list[str] | None = None
) -> dict[str, Any]:
    """The surface's root: the View frame (genmark, Why, source line, suggestions)."""
    root: dict[str, Any] = {
        "id": "root",
        "component": "View",
        "path": path,
        "why": why or "",
        "children": children,
        "data": {"path": "/view"},
    }
    if suggestions:
        root["suggestions"] = suggestions
    return root


def command_id(command: str) -> str:
    """A command card's component id (`^[a-z][a-z0-9-]{0,23}$`): the row id's last 12 characters."""
    return f"cmd-{command[-12:].lower()}"


def choice_id(choice: str) -> str:
    return f"choice-{choice[-12:].lower()}"


def command_card(command: str, name: str) -> dict[str, Any]:
    cid = command_id(command)
    return {
        "id": cid,
        "component": "CommandCard",
        "command": name,
        "data": {"path": f"/commands/{cid}"},
    }


def choice_card(choice: str) -> dict[str, Any]:
    cid = choice_id(choice)
    return {"id": cid, "component": "Choice", "data": {"path": f"/choices/{cid}"}}


def compile_view(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """A checked view spec as its surface's components, root first."""
    comps = [c for c in map(compile_component, spec.get("components", [])) if c is not None]
    root = view_root(
        spec["path"], spec.get("why"), [c["id"] for c in comps], spec.get("suggestions")
    )
    return [root, *comps]


def surface_messages(surface: str, components: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """A new surface: createSurface, then its components."""
    return [
        {"version": VERSION, "createSurface": {"surfaceId": surface, "catalogId": CATALOG_ID}},
        update_messages(surface, components),
    ]


def update_messages(surface: str, components: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "version": VERSION,
        "updateComponents": {"surfaceId": surface, "components": components},
    }


def delete_message(surface: str) -> dict[str, Any]:
    return {"version": VERSION, "deleteSurface": {"surfaceId": surface}}
