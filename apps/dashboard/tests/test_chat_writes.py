"""R-30 T037: the constitution reading of T002 (research.md R10), checked in code.

The dashboard opens the store read-only (`test_readonly.py`); this test checks the rest of the
reading: no dashboard code writes a chat table, and the chat routes reach the chat service over HTTP
only (the TypeScript service validates every write with the core Zod schemas).
"""

import re
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "src" / "pathfinder_dashboard"
CHAT_TABLES = (
    "chat_conversations",
    "chat_messages",
    "workflow_steps",
    "process_scopes",
    "amendments",
)
WRITE = re.compile(
    r"\b(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+[\"`]?("
    + "|".join(CHAT_TABLES)
    + r")\b",
    re.IGNORECASE,
)


def test_chat_writes_only_via_service() -> None:
    offenders = [
        f"{path.relative_to(PACKAGE)}: {match.group(0)}"
        for path in PACKAGE.rglob("*.py")
        for match in WRITE.finditer(path.read_text(encoding="utf-8"))
    ]
    assert offenders == []


def test_chat_client_talks_http_only() -> None:
    source = (PACKAGE / "chat_client.py").read_text(encoding="utf-8")
    assert "sqlite3" not in source
    assert "chat_url" in source
