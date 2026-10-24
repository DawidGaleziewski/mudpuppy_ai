"""A scan's step limit, from its config snapshot (spec 022 T030). The rest of the htmx Scans page's
read models went with R-100's htmx pages (spec 074, R-102 (1)); the React Scans page reads
`queries_app.py`."""

from __future__ import annotations

import json

from .models import Run


def max_steps(run: Run) -> int | None:
    snapshot = run.config_snapshot
    try:
        value = (json.loads(snapshot) if isinstance(snapshot, str) else snapshot)["portal"][
            "scope"
        ]["max_steps"]
    except (ValueError, KeyError, TypeError):
        return None
    return value if isinstance(value, int) and value > 0 else None
