"""The React console's documentation export (R-100, spec 071; spec 034 R-68): a process in the
export's layout, one tab per file as HTML, its pictures and a zip, the portal in the address."""

from __future__ import annotations

import io
import zipfile

from .conftest import Store, make_client
from .test_process_export import fake_export  # noqa: F401  (the fixture)

API = "/api/portals/reference-insurer/processes/PROC-001/export"


def test_a_tab_comes_as_html_with_links_to_the_other_tabs(
    empty_store: Store,
    fake_export: list[str],  # noqa: F811
) -> None:
    with make_client(empty_store) as c:
        readme = c.get(API).json()
        steps = c.get(API, params={"tab": "PROCESS_STEPS.md"}).json()
    assert readme["tab"] == "README.md" and [t["file"] for t in readme["tabs"]][:2] == [
        "README.md",
        "PROCESS_STEPS.md",
    ]
    page = "/app/portals/reference-insurer/processes/PROC-001/documentation"
    assert f'href="{page}?tab=PROCESS_STEPS.md#step-1"' in readme["html"]
    assert "<script>alert(1)</script>" not in readme["html"]
    assert f'src="{API}/images/step-1-1-main.png"' in steps["html"]
    assert readme["zip"] == f"{API}.zip"


def test_pictures_zip_and_a_failed_export(
    empty_store: Store,
    fake_export: list[str],  # noqa: F811
) -> None:
    with make_client(empty_store) as c:
        img = c.get(f"{API}/images/step-1-1-main.png")
        bad = c.get(f"{API}/images/..%2Fsecret.png")
        z = c.get(f"{API}.zip")
        failed = c.get("/api/portals/reference-insurer/processes/PROC-404/export").json()
    assert img.content == b"\x89PNG fake" and bad.status_code == 404
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    assert "reference-insurer-proc-001/README.md" in names
    assert failed["html"] is None and "no documented process PROC-404" in failed["error"]
