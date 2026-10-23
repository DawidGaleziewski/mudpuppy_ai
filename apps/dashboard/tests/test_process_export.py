"""Spec 034 R-68: a process in the export's layout, one tab per file, its pictures and a zip. The
export command is replaced by a fake that writes a small folder (the real one is tested in
@mudpuppy/docs)."""

from __future__ import annotations

from pathlib import Path

import pytest

from mudpuppy_dashboard import process_export

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
