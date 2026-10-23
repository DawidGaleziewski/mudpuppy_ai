"""The one status map (`status_map.py`, spec 022): every stored status has a shape from the design
enum and a word, and the console's labels map as the design package says."""

from __future__ import annotations

import pytest

from mudpuppy_dashboard import queries_docs, status_map
from mudpuppy_dashboard.models import DECISION_KINDS, FRONTIER_STATUSES, RUN_STATUSES


@pytest.mark.parametrize(
    ("vocabulary", "values"),
    [
        ("run", RUN_STATUSES),
        ("frontier", FRONTIER_STATUSES),
        ("decision", DECISION_KINDS),
        ("doc", queries_docs.DOC_STATUSES),
    ],
)
def test_every_stored_status_has_a_mapping(vocabulary: str, values: tuple[str, ...]) -> None:
    for v in values:
        assert v in status_map.VOCABULARIES[vocabulary], (vocabulary, v)


def test_shapes_are_the_design_enum_and_every_status_has_a_word() -> None:
    for table in status_map.VOCABULARIES.values():
        for s in table.values():
            assert s.shape is None or s.shape in status_map.SHAPES
            assert s.word


def test_console_labels_map_as_the_design_package_says() -> None:
    # docs/design/salvage-yard/migration/status-map.csv
    assert status_map.status_of("run", "completed").shape == "ok"
    assert status_map.status_of("run", "running").shape == "running"
    assert status_map.status_of("run", "interrupted") == ("stopped", "Interrupted")
    assert status_map.status_of("frontier", "skipped_unsafe").shape == "skipped"
    assert status_map.status_of("doc", "draft").shape == "draft"
    assert status_map.status_of("amendment", "superseded") == ("needs", "Re-anchor")
    assert status_map.status_of("confidence", "inferred").shape == "inferred"


def test_unknown_value_keeps_its_text_without_a_shape() -> None:
    assert status_map.status_of("run", "some_new_state") == (None, "some new state")
    assert status_map.status_of("outcome", None) == ("running", "Running")
