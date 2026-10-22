"""Live `mudpuppy` MCP servers that disagree with the dashboard (spec 031 US2, R-61, field GC-22).

Each server writes `<data_dir>/servers/<pid>.json` (environment, checkout, server name) and removes
it on exit (`services/server-registry.ts`). The dashboard only reads them: a server answering on
another environment or from another checkout than the dashboard's is named in a callout, so a call
answered by a stray server is never a mystery. Files of dead processes are skipped, never deleted
(the dashboard writes nothing outside its review path).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ServerEntry:
    pid: int
    environment: str
    code_root: Path
    server: str


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except PermissionError:
        return True  # exists, belongs to someone else
    except OSError:
        return False
    return True


def live_servers(data_dir: Path) -> list[ServerEntry]:
    folder = data_dir / "servers"
    if not folder.is_dir():
        return []
    out: list[ServerEntry] = []
    for f in sorted(folder.glob("*.json")):
        try:
            raw = json.loads(f.read_text(encoding="utf-8"))
            entry = ServerEntry(
                pid=int(raw["pid"]),
                environment=str(raw["environment"]),
                code_root=Path(str(raw["codeRoot"])).resolve(),
                server=str(raw.get("server", "mudpuppy")),
            )
        except (OSError, ValueError, KeyError, TypeError):
            continue
        if _alive(entry.pid):
            out.append(entry)
    return out


def stray_warnings(entries: list[ServerEntry], environment: str, code_root: Path) -> list[str]:
    """One sentence per live server on another environment or from another checkout."""
    root = code_root.resolve()
    out: list[str] = []
    for e in entries:
        if e.environment != environment:
            out.append(
                f'{e.server} pid {e.pid} serves environment "{e.environment}"; '
                f'this page shows "{environment}".'
            )
        if e.code_root != root:
            out.append(f"{e.server} pid {e.pid} runs from another checkout ({e.code_root}).")
    return out
