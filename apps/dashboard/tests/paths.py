"""Repo paths for the tests, found by a marker file instead of counting parent folders, so the
tests also run from a copy of `tests/` (mutmut runs them from `mutants/tests/`, spec 012 T041)."""

from pathlib import Path


def _repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "pnpm-workspace.yaml").is_file():
            return parent
    raise RuntimeError("repo root (pnpm-workspace.yaml) not found above tests/")


REPO_ROOT = _repo_root()
