"""A turn, in order: text first (never held for the view), the composing frame when a view starts, then the view.
A view that misses its deadline is dropped quietly; a model that never starts gets a "Still working" line."""
import asyncio
import json
import unittest
from pathlib import Path

import app
from tests._helpers import replayed_engine

EX = Path(__file__).resolve().parents[2] / "examples"


def spec(name):
    return json.loads((EX / "valid" / f"{name}.json").read_text(encoding="utf-8"))


class Turns(unittest.TestCase):
    def setUp(self):
        self.old_engine, app.engine = app.engine, replayed_engine()

    def tearDown(self):
        app.engine = self.old_engine

    def run_turn(self, events, phase=2):
        sess = app.Session(id="t", phase=phase)
        shell = app.append_turn(sess, "assistant")

        async def go():
            async def gen():
                for e in events:
                    if e[0] == "sleep":
                        await asyncio.sleep(e[1])
                    else:
                        yield e
            return await app.run_assistant(sess, shell, gen(), asked="Map it")
        changed = asyncio.run(go())
        return sess, shell, changed

    def test_text_then_composing_then_view(self):
        sess, shell, changed = self.run_turn([("text", "Here is the map."), ("view_start", None), ("view", spec("mapping-live"))])
        self.assertTrue(changed)
        self.assertIn("Here is the map.", sess.outbox[0])
        self.assertIn('data-gen-state="composing"', sess.outbox[1])      # where the view will go (inline: the turn)
        self.assertIn('id="wb-layout"', sess.outbox[2])                    # then the view: layout + its slot
        self.assertIn("Live map opened", sess.outbox[2])

    def test_view_after_the_deadline_is_dropped(self):
        old, app.VIEW_DEADLINE_S = app.VIEW_DEADLINE_S, 0.01
        try:
            sess, shell, changed = self.run_turn([("text", "Hm."), ("view_start", None), ("sleep", 0.05), ("view", spec("mapping-live"))])
        finally:
            app.VIEW_DEADLINE_S = old
        self.assertFalse(changed)
        self.assertEqual(shell.note, "No view this time; the answer is in words.")
        self.assertFalse(shell.composing)

    def test_invalid_view_falls_back_to_words(self):
        bad = {"version": "1", "path": "mapping", "why": "x map", "components": [{"id": "a", "type": "HtmlBlock", "bind": {}}]}
        sess, shell, changed = self.run_turn([("text", "Here."), ("view_start", None), ("view", bad)])
        self.assertFalse(changed)
        self.assertIn("No view this time", sess.outbox[-1])
        self.assertNotIn("sy-state--failure", sess.outbox[-1])            # quiet, never red

    def test_refused_command_says_why(self):
        sess, shell, _ = self.run_turn([("command", {"command": "scan.stop", "args": {"scan": "01a110d5-2028-7000-8f3e-5c1a9b27d460"}, "reason": "Stop it now."})])
        self.assertEqual(shell.commands, [])
        self.assertIn("isn't running", shell.note)                        # the replayed scan is already stopped


if __name__ == "__main__":
    unittest.main()
