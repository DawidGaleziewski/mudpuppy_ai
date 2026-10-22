"""The portal's decision rules exported (spec 039 owner answer OV-5, UX G13): a DMN table and a
Markdown page per rule, `rules.csv` of them all and a README, built by
``pnpm model:rules-export`` (the same generator as the command line) into a temporary folder kept
until the store changes. The dashboard only reads it: a rule's Markdown for its page, single
files and the folder as a zip for download. The store is never written.
"""

from __future__ import annotations

import io
import re
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

from . import db
from .settings import Settings

# A rule's files are named by its BR key once documented, else by its hypothesis key.
FILE = re.compile(r"^((BR|H)-\d{3,}\.(md|dmn)|rules\.csv|README\.md)$")
MEDIA = {".md": "text/markdown", ".dmn": "application/xml", ".csv": "text/csv"}
_CACHE: dict[tuple[str, str, float], Path] = {}


class ExportFailed(Exception):
    """The export command did not produce a folder (pnpm missing, a timeout, an old store)."""


@dataclass(frozen=True)
class RulesExport:
    folder: Path

    def file(self, name: str) -> Path | None:
        path = self.folder / name
        return path if FILE.match(name) and path.is_file() else None

    def markdown(self, shown_key: str) -> str | None:
        path = self.file(f"{shown_key}.md")
        return path.read_text(encoding="utf-8") if path else None

    def zip_bytes(self, top: str) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for p in sorted(self.folder.iterdir()):
                if p.is_file():
                    z.write(p, f"{top}/{p.name}")
        return buf.getvalue()


def _run(settings: Settings, env: str, portal: str, out: Path) -> None:
    cmd = [
        "pnpm",
        "--silent",
        "--dir",
        str(settings.crawler_dir),
        "model:rules-export",
        portal,
        "--env",
        env,
        "--root",
        str(settings.data_dir.parent),
        "--status",
        "all",
        "--out",
        str(out),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=False)
    except (FileNotFoundError, subprocess.TimeoutExpired) as err:
        raise ExportFailed(str(err)) from err
    if proc.returncode != 0 or not (out / "README.md").is_file():
        detail = (proc.stderr or proc.stdout).strip().splitlines()[-1:] or ["no output"]
        raise ExportFailed(detail[0][:300])


def export(settings: Settings, data_dir: Path, env: str, portal: str) -> RulesExport:
    """Every rule of the portal, in every status (each says its status), built again only after
    the store changed."""
    store, stamp = db.store_stamp(data_dir, env)
    cache_key = (store, portal, stamp)
    known = _CACHE.get(cache_key)
    if known is not None and (known / "README.md").is_file():
        return RulesExport(known)
    out = Path(tempfile.mkdtemp(prefix="pf-rules-export-")) / "rules"
    _run(settings, env, portal, out)
    _CACHE[cache_key] = out
    return RulesExport(out)
