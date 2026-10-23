"""The rebuild-grade export of one process, for the dashboard (spec 034 R-68, owner answer 5 of
2026-10-16: the dashboard shows a process in the export's layout, one tab per file).

The export is built by ``pnpm docs:process-export`` (the same generator as the command line) into a
temporary folder, kept until the store changes; the dashboard only reads it, renders its Markdown
and zips it for download. The store is never written.
"""

from __future__ import annotations

import io
import re
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

from markdown_it import MarkdownIt

from . import db
from .settings import Settings

# The files of a process folder, in tab order (README first).
TABS = (
    ("README.md", "README"),
    ("PROCESS_STEPS.md", "Steps"),
    ("BUSINESS_REQUIREMENTS.md", "Business"),
    ("FUNCTIONAL_REQUIREMENTS.md", "Functional"),
    ("EARS.md", "EARS"),
    ("CONTRACTS.md", "Contracts"),
    ("GAPS.md", "Gaps"),
)
TAB_FILES = {f for f, _ in TABS}
KEY = re.compile(r"^(PROC|PRC)-\d{3,}$")
IMAGE = re.compile(r"^step-\d+-(\d+-[a-z]+\.png|\d+-elements\.svg|wireframe\.svg|validation\.svg)$")

# No raw HTML: record text quotes the portal verbatim and could carry markup. The export's own
# anchors (`<a id="step-2"></a>`) are put back by a strict pattern after rendering.
_MD = MarkdownIt("js-default", {"html": False})
_ANCHOR = re.compile(r"&lt;a id=&quot;(?P<id>[a-z0-9-]{1,40})&quot;&gt;&lt;/a&gt;")
_CACHE: dict[tuple[str, str, str, float], Path] = {}


class ExportFailed(Exception):
    """The export command did not produce a folder (no such process, pnpm missing, a timeout)."""


@dataclass(frozen=True)
class Exported:
    folder: Path

    def text(self, name: str) -> str:
        return (self.folder / name).read_text(encoding="utf-8")

    def image(self, name: str) -> Path | None:
        path = self.folder / "images" / name
        return path if IMAGE.match(name) and path.is_file() else None

    def data_file(self, name: str) -> Path | None:
        path = self.folder / name
        return path if name in DATA_FILES and path.is_file() else None

    def zip_bytes(self, top: str) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for p in sorted(self.folder.rglob("*")):
                if p.is_file():
                    z.write(p, f"{top}/{p.relative_to(self.folder).as_posix()}")
        return buf.getvalue()


def _run(settings: Settings, env: str, portal: str, key: str, out: Path) -> None:
    cmd = [
        "pnpm",
        "--silent",
        "--dir",
        str(settings.crawler_dir),
        "docs:process-export",
        portal,
        key,
        "--env",
        env,
        "--root",
        str(settings.data_dir.parent),
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


def export(settings: Settings, data_dir: Path, env: str, portal: str, key: str) -> Exported:
    """The process's export folder, built again only after the store changed."""
    if not KEY.match(key):
        raise ExportFailed(f"not a process key: {key}")
    store, stamp = db.store_stamp(data_dir, env)
    cache_key = (store, portal, key, stamp)
    known = _CACHE.get(cache_key)
    if known is not None and (known / "README.md").is_file():
        return Exported(known)
    out = Path(tempfile.mkdtemp(prefix="pf-process-export-")) / key.lower()
    _run(settings, env, portal, key, out)
    _CACHE[cache_key] = out
    return Exported(out)


_LINK = re.compile(r'href="(?P<file>[A-Z_]+\.md)(?P<anchor>#[^"]*)?"')
_IMG = re.compile(r'src="images/(?P<name>[^"]+)"')
# The folder's data files, served as they are (the export's README links them).
DATA_FILES = {"openapi.yaml": "application/yaml", "process.json": "application/json"}
_DATA_LINK = re.compile(r'href="(?P<file>openapi\.yaml|process\.json)"')
_HEADING = re.compile(r"<(?P<close>/?)h(?P<n>[1-6])")


def render(md: str, tab_url: str, image_url: str, file_url: str) -> str:
    """One file as HTML: links to the other files become tab links, images and data files come
    from the dashboard. `tab_url`, `image_url` and `file_url` take `{file}` / `{name}`."""
    html = _ANCHOR.sub(lambda m: f'<a id="{m["id"]}"></a>', _MD.render(md))
    html = _DATA_LINK.sub(lambda m: f'href="{file_url.format(name=m["file"])}"', html)
    html = _LINK.sub(
        lambda m: (
            f'href="{tab_url.format(file=m["file"])}{m["anchor"] or ""}"'
            if m["file"] in TAB_FILES
            else m[0]
        ),
        html,
    )
    html = _IMG.sub(lambda m: f'src="{image_url.format(name=m["name"])}"', html)
    # The page has its own h1: the file's headings move one level down.
    html = _HEADING.sub(lambda m: f"<{m['close']}h{min(int(m['n']) + 1, 6)}", html)
    # Wide tables scroll inside their wrapper, never the page (screen acceptance criterion 2).
    html = html.replace(
        "<table>", '<div class="sy-table-wrap"><table class="sy-table sy-table--dense">'
    )
    html = html.replace("</table>", "</table></div>")
    # Code (shapes, samples, pseudo-code) scrolls inside its own box too.
    html = html.replace("<pre>", '<div class="sy-table-wrap"><pre>')
    return html.replace("</pre>", "</pre></div>")
