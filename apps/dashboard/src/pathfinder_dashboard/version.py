"""Code fingerprint of the dashboard package.

A server started without ``--dev`` keeps serving the code it imported. ``/healthz`` reports the
fingerprint taken at startup and the smoke check compares it with the files on disk, so a stale
server is reported as such instead of as a missing page.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

PACKAGE = Path(__file__).parent
_SUFFIXES = {".py", ".html", ".css", ".js"}


def code_fingerprint(package: Path = PACKAGE) -> str:
    """sha256 over every source/template/static file's path and bytes, in a fixed order."""
    h = hashlib.sha256()
    for path in sorted(p for p in package.rglob("*") if p.is_file() and p.suffix in _SUFFIXES):
        # The smoke check itself is not served code.
        if "__pycache__" in path.parts or "vendor" in path.parts or path.name == "smoke.py":
            continue
        h.update(path.relative_to(package).as_posix().encode())
        h.update(b"\0")
        h.update(path.read_bytes())
        h.update(b"\0")
    return h.hexdigest()[:16]


#: Taken once, when the server process imports the package.
STARTUP_FINGERPRINT = code_fingerprint()
