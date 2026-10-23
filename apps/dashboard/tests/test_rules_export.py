"""Spec 039 OV-5: the rules export (DMN, Markdown, CSV) from the Rules pages. The export command
is replaced by a fake that writes a small folder (the real one is tested in @mudpuppy/store)."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest

from mudpuppy_dashboard import rules_export

from .conftest import Store
from .test_processes_pages import client

P = "shop"
MD = '## BR-001 · Drivers under 18\n\nIf age < 18, "Dalej" on Dane leads to Odmowa (/odmowa).\n'


@pytest.fixture
def fake_export(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    calls: list[str] = []

    def run(settings: object, env: str, portal: str, out: Path) -> None:
        calls.append(portal)
        if portal == "broken":
            raise rules_export.ExportFailed("no such table: hypotheses")
        out.mkdir(parents=True)
        (out / "README.md").write_text("# Decision rules of shop\n")
        (out / "BR-001.md").write_text(MD)
        (out / "BR-001.dmn").write_text("<definitions/>")
        (out / "rules.csv").write_text("rule,finding\nBR-001,H-0001\n")

    monkeypatch.setattr(rules_export, "_run", run)
    rules_export._CACHE.clear()
    return calls


def test_the_zip_holds_every_file_and_is_built_once(
    empty_store: Store, fake_export: list[str]
) -> None:
    with client(empty_store) as c:
        r = c.get(f"/api/portals/{P}/rules/export.zip")
        again = c.get(f"/api/portals/{P}/rules/export.zip")
    names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    assert sorted(names) == [f"{P}-rules/{n}" for n in sorted(
        ("BR-001.dmn", "BR-001.md", "README.md", "rules.csv"))]  # fmt: skip
    assert again.status_code == 200 and fake_export == [P]  # cached until the store changes


def test_single_files_and_names_outside_the_export(
    empty_store: Store, fake_export: list[str]
) -> None:
    with client(empty_store) as c:
        csv = c.get(f"/api/portals/{P}/rules/export/rules.csv")
        dmn = c.get(f"/api/portals/{P}/rules/export/BR-001.dmn")
        other = c.get(f"/api/portals/{P}/rules/export/..%2Fsecret")
        missing = c.get(f"/api/portals/{P}/rules/export/BR-404.md")
    assert csv.status_code == 200 and csv.text.startswith("rule,finding")
    assert csv.headers["content-type"].startswith("text/csv")
    assert dmn.status_code == 200 and "attachment" in dmn.headers["content-disposition"]
    assert other.status_code == 404 and missing.status_code == 404
