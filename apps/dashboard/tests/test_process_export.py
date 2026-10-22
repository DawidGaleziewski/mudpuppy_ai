"""Spec 034 R-68: a process in the export's layout, one tab per file, its pictures and a zip. The
export command is replaced by a fake that writes a small folder (the real one is tested in
@mudpuppy/docs)."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest

from mudpuppy_dashboard import process_export

from .conftest import Store, make_client

README = """# PROC-001 Quote

[Steps](PROCESS_STEPS.md#step-1) · [Gaps](GAPS.md)

| A | B |
| --- | --- |
| <script>alert(1)</script> | x |
"""
STEPS = '## <a id="step-1"></a>Step 1\n\n![shot](images/step-1-1-main.png)\n'


@pytest.fixture
def fake_export(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    calls: list[str] = []

    def run(settings: object, env: str, portal: str, key: str, out: Path) -> None:
        calls.append(f"{portal} {key}")
        if key == "PROC-404":
            raise process_export.ExportFailed(
                "reference-insurer has no documented process PROC-404"
            )
        (out / "images").mkdir(parents=True)
        (out / "README.md").write_text(README)
        (out / "PROCESS_STEPS.md").write_text(STEPS)
        (out / "images" / "step-1-1-main.png").write_bytes(b"\x89PNG fake")
        for f in (
            "BUSINESS_REQUIREMENTS.md",
            "FUNCTIONAL_REQUIREMENTS.md",
            "EARS.md",
            "CONTRACTS.md",
            "GAPS.md",
        ):
            (out / f).write_text(f"# {f}\n")

    monkeypatch.setattr(process_export, "_run", run)
    process_export._CACHE.clear()
    return calls


def test_tabs_render_the_files_with_links_between_tabs(
    empty_store: Store, fake_export: list[str]
) -> None:
    with make_client(empty_store) as c:
        html = c.get("/docs/reference-insurer/PROC-001/export").text
        steps = c.get(
            "/docs/reference-insurer/PROC-001/export", params={"tab": "PROCESS_STEPS.md"}
        ).text
        again = c.get("/docs/reference-insurer/PROC-001/export", params={"tab": "nope"}).text
    assert "PROC-001 documentation" in html and 'aria-current="page">README' in html
    assert 'href="/docs/reference-insurer/PROC-001/export?tab=PROCESS_STEPS.md#step-1"' in html
    assert '<table class="sy-table sy-table--dense">' in html
    assert "<script>alert(1)</script>" not in html  # portal text never becomes markup
    assert '<a id="step-1"></a>' in steps
    assert 'src="/docs/reference-insurer/PROC-001/export/images/step-1-1-main.png"' in steps
    assert 'aria-current="page">README' in again
    assert fake_export == ["reference-insurer PROC-001"]  # built once, then kept


def test_images_and_zip(empty_store: Store, fake_export: list[str]) -> None:
    with make_client(empty_store) as c:
        img = c.get("/docs/reference-insurer/PROC-001/export/images/step-1-1-main.png")
        bad = c.get("/docs/reference-insurer/PROC-001/export/images/..%2Fsecret.png")
        z = c.get("/docs/reference-insurer/PROC-001/export.zip")
    assert img.status_code == 200 and img.content == b"\x89PNG fake"
    assert bad.status_code == 404
    assert z.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    assert "reference-insurer-proc-001/README.md" in names
    assert "reference-insurer-proc-001/images/step-1-1-main.png" in names


def test_unknown_process_or_key(empty_store: Store, fake_export: list[str]) -> None:
    with make_client(empty_store) as c:
        missing = c.get("/docs/reference-insurer/PROC-404/export")
        bad_key = c.get("/docs/reference-insurer/SCR-001/export")
    assert missing.status_code == 404 and "no documented process PROC-404" in missing.text
    assert bad_key.status_code == 404 and "not a process key" in bad_key.text


@pytest.mark.parametrize(
    ("name", "served"),
    [
        ("step-4-1-main.png", True),
        ("step-4-2-technical.png", True),
        ("step-4-wireframe.svg", True),
        ("step-4-1-elements.svg", True),
        ("step-4-validation.svg", True),
        ("step-4-validation.png", False),
        ("../step-4-1-main.png", False),
    ],
)
def test_image_names(name: str, served: bool) -> None:
    """The marked screenshots of the owner review (2026-10-17) are served, nothing else is."""
    assert bool(process_export.IMAGE.match(name)) is served
