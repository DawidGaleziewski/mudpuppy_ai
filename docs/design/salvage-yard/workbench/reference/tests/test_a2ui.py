"""R-96 spike: the generated A2UI catalog and its example streams (workbench/a2ui/)."""
import importlib.util
import json
import unittest
from pathlib import Path

A2UI = Path(__file__).resolve().parents[2] / "a2ui"
spec = importlib.util.spec_from_file_location("a2ui_check", A2UI / "check.py")
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class Catalog(unittest.TestCase):
    def test_every_catalogue_component_is_in_the_a2ui_catalog(self):
        cat = json.loads((A2UI.parent / "schema" / "catalogue.json").read_text(encoding="utf-8"))
        for c in cat["components"]:
            with self.subTest(c["type"]):
                self.assertIn(c["type"], check.COMPONENTS)
                self.assertEqual(check.COMPONENTS[c["type"]]["x-mudpuppy"]["owner"], "agent")

    def test_frame_components_are_server_owned(self):
        self.assertEqual(check.SERVER_OWNED, {"View", "CommandCard"})

    def test_streams_validate(self):
        self.assertEqual(check.check_streams(), [])

    def test_short_scan_id_is_refused(self):
        self.assertTrue(check.validate_component({"id": "map", "component": "LiveMap", "scan": "01a110d5"}))


class AgentFilter(unittest.TestCase):
    def test_refusals(self):
        refused = json.loads((A2UI / "examples" / "refused.json").read_text(encoding="utf-8"))["examples"]
        for r in refused:
            with self.subTest(r["why"]):
                self.assertEqual(check.filter_agent(r["message"])[1], r["why"])

    def test_server_rewrites_the_data_path(self):
        msg = {"version": "v0.9.1", "updateComponents": {"surfaceId": "t1", "components": [
            {"id": "map", "component": "LiveMap", "scan": "01a110d5-2028-7000-8f3e-5c1a9b27d460", "data": {"path": "/records"}}]}}
        out, code = check.filter_agent(msg)
        self.assertEqual(code, "server_prop")
        self.assertEqual(out["updateComponents"]["components"][0]["data"]["path"], "/scans/01a110d5-2028-7000-8f3e-5c1a9b27d460")


if __name__ == "__main__":
    unittest.main()
