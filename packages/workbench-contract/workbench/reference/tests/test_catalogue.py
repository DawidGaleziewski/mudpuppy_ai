"""The contract: every example in ../examples behaves as documented."""
import json
import unittest
from pathlib import Path

import catalogue as cat
from app import resolve

EX = Path(__file__).resolve().parents[2] / "examples"


def load(rel):
    return json.loads((EX / rel).read_text(encoding="utf-8"))


class ViewSpecs(unittest.TestCase):
    def test_valid_examples_pass_untouched(self):
        for f in sorted((EX / "valid").glob("*.json")):
            with self.subTest(f.name):
                raw = load(f"valid/{f.name}")
                checked = cat.check_view(raw, phase=3, resolve=resolve)
                self.assertIsNotNone(checked.spec, checked.rejected)
                self.assertEqual(checked.dropped, [])
                self.assertEqual(len(checked.components), len(raw["components"]))

    def test_invalid_examples_give_the_expected_code(self):
        """examples/invalid/EXPECTED.json maps each file to the one reason code the server must log."""
        expected = load("invalid/EXPECTED.json")["examples"]
        self.assertEqual(sorted(expected), sorted(p.name for p in (EX / "invalid").glob("*.json") if p.name != "EXPECTED.json"))
        for name, exp in expected.items():
            with self.subTest(name):
                checked = cat.check_view(load(f"invalid/{name}"), phase=3, resolve=resolve)
                self.assertIn(exp["code"], checked.codes)
                if exp["outcome"] == "dropped":
                    self.assertIn(exp["component"], [d.index for d in checked.dropped if d.code == exp["code"]])

    def test_markup_in_why_is_repaired_not_rendered(self):
        checked = cat.check_view(load("invalid/markup-in-why.json"), phase=3, resolve=resolve)
        self.assertEqual(checked.spec["why"], cat.GENERIC_WHY)

    def test_bad_path_falls_back_to_the_current_path(self):
        raw = {"version": "1", "path": "dashboard", "why": "Here.", "components": []}
        checked = cat.check_view(raw, 3, resolve, current_path="mapping")
        self.assertEqual((checked.spec["path"], checked.codes), ("mapping", ["repaired_path"]))

    def test_duplicates_are_dropped(self):
        c = {"id": "a", "type": "RecordCard", "bind": {"record": "PROC-001"}}
        raw = {"version": "1", "path": "chat", "why": "Two of the same.", "components": [c, dict(c, id="b")]}
        checked = cat.check_view(raw, 3, resolve)
        self.assertEqual((len(checked.components), checked.codes), (1, ["duplicate"]))

    def test_unknown_id_is_dropped(self):
        raw = {"version": "1", "path": "mapping", "why": "You asked to map.",
               "components": [{"id": "map", "type": "LiveMap", "bind": {"scan": "deadbeef-0000-7000-8000-000000000000"}}]}   # well-formed, unknown
        checked = cat.check_view(raw, phase=2, resolve=resolve)
        self.assertEqual(checked.codes, ["id_not_found"])

    def test_phase_gating(self):
        self.assertIn("not available in phase 2", cat.check_view(load("valid/explain.json"), 2, resolve).rejected)
        self.assertIsNotNone(cat.check_view(load("valid/explain.json"), 3, resolve).spec)
        self.assertIsNone(cat.check_view(load("valid/troubleshoot.json"), 1, resolve).spec)
        raw = {"version": "1", "path": "mapping", "why": "Shot.", "components": [{"id": "s", "type": "StepShot",
               "bind": {"scan": "01a110d5-2028-7000-8f3e-5c1a9b27d460", "step": 171}}]}
        self.assertEqual(cat.check_view(raw, 3, resolve).codes, ["not_on_path"])

    def test_server_decides_placement(self):
        spec = cat.check_view(load("valid/mapping-live.json"), 2, resolve).spec
        self.assertEqual([c["type"] for c in cat.place(spec, "split")["stage"]], ["LiveMap", "PageDetail"])
        self.assertEqual([c["type"] for c in cat.place(spec, "split")["conv"]], ["Narration"])
        self.assertEqual([c["type"] for c in cat.place(spec, "inline")["aside"]], ["PageDetail"])
        self.assertEqual(cat.layout_for("chat", 3), "inline")
        self.assertEqual(cat.layout_for("mapping", 3, focus=True), "focus")


class Narration(unittest.TestCase):
    def refs(self):
        from tests._helpers import replayed_engine
        e = replayed_engine()
        return {ev.ref: ev.data for ev in e.logs["01a110d5-2028-7000-8f3e-5c1a9b27d460"]}

    def test_valid_narration_passes(self):
        good, rejected = cat.check_narration(load("narration/valid.json"), self.refs())
        self.assertEqual((len(good), rejected), (2, []))

    def test_number_not_in_cited_event_is_rejected(self):
        good, rejected = cat.check_narration(load("narration/ungrounded-number.json"), self.refs())
        self.assertEqual(good, [])
        self.assertIn("40", rejected[0][1])

    def test_citing_a_missing_event_is_rejected(self):
        raw = {"scan": "01a110d5-2028-7000-8f3e-5c1a9b27d460", "lines": [{"text": "Opened /.", "cites": ["01a110d5-2028-7000-8f3e-5c1a9b27d460#999"]}]}
        self.assertEqual(cat.check_narration(raw, self.refs())[0], [])


class Commands(unittest.TestCase):
    def test_examples(self):
        self.assertIsNotNone(cat.check_command(load("command/resume.json"))[0])
        self.assertIsNotNone(cat.check_command(load("command/attempt.json"))[0])
        cmd, why = cat.check_command(load("command/invalid-unknown.json"))
        self.assertIsNone(cmd)
        self.assertIn("portal.delete", why)

    def test_persona_add(self):
        # R-95: a persona is proposed with a vault reference, never a secret value
        self.assertIsNotNone(cat.check_command(load("command/persona-add.json"))[0])
        cmd, why = cat.check_command(load("command/invalid-persona-secret.json"))
        self.assertIsNone(cmd)
        self.assertIn("password", why)


if __name__ == "__main__":
    unittest.main()
