"""Rendering: every generated view carries its provenance, and nothing from a spec or a person reaches HTML unescaped."""
import json
import re
import unittest
from pathlib import Path

import app
import catalogue as cat
from render import Renderer
from tests._helpers import replayed_engine

EX = Path(__file__).resolve().parents[2] / "examples"


def session_with(spec_name, phase=3, focus=False, engine=None):
    sess = app.Session(id="t", phase=phase, focus=focus)
    raw = json.loads((EX / "valid" / f"{spec_name}.json").read_text(encoding="utf-8"))
    checked = cat.check_view(raw, phase, app.resolve)
    old = app.engine
    app.engine = engine or replayed_engine()
    try:
        t = app.append_turn(sess, "assistant", text="Here you go.")
        v, _ = app.new_view(sess, checked.spec, tid=t.id, origin="assistant", asked="Map the OC/AC calculator")
        t.view_id = v.id
    finally:
        app.engine = old
    return sess


class Provenance(unittest.TestCase):
    def test_every_frame_has_mark_and_source_and_the_lead_has_why_and_feedback(self):
        eng = replayed_engine()
        for name in ("mapping-live", "mapping-stopped", "troubleshoot", "explain", "explain-rule", "chat-records"):
            for phase, focus in ((3, False), (3, True), (2, False)):
                if name.startswith("explain") and phase < 3:
                    continue
                with self.subTest(name=name, phase=phase, focus=focus):
                    sess = session_with(name, phase, focus, eng)
                    html = Renderer(sess, eng, app.commands, "x").page()
                    frames = html.split('<section class="sy-genview')[1:]
                    self.assertTrue(frames)
                    for chunk in frames:
                        self.assertIn('class="sy-genmark">generated<', chunk)
                        self.assertIn('class="sy-genview__source"', chunk)
                    # once per view: Why this view? and Right view? sit on the lead frame (the spec's first component)
                    self.assertEqual(html.count('class="sy-genview__why"'), 1)
                    self.assertEqual(html.count('class="sy-genfeedback"'), 1)
                    lead = sess.views[sess.current].spec["components"][0]["id"]
                    self.assertIn(f'aria-controls="t1-{lead}-why"', html)

    def test_chat_is_inline_and_errorcard_is_failure_framed(self):
        eng = replayed_engine()
        html = Renderer(session_with("chat-records", 3, False, eng), eng, app.commands, "x").page()
        self.assertIn('sy-wb--inline sy-wb--nosheet', html)
        html = Renderer(session_with("mapping-stopped", 2, False, eng), eng, app.commands, "x").page()
        self.assertIn("sy-genview--failure", html)
        self.assertIn("Next action failed at /kontakt", html)
        self.assertIn('id="t1-map"', html)                                    # frame id = t{turn}-{component id}
        self.assertRegex(html, r'data-type="LiveMap"[\s\S]*?data-status="stopped"')   # scan: ash, not red

    def test_live_parts_target_existing_regions(self):
        eng = replayed_engine()
        sess = session_with("mapping-live", 2, False, eng)
        r = Renderer(sess, eng, app.commands, "x")
        page = r.page()
        v = sess.views[sess.current]
        slots, _ = r.slots(v)
        for place, comps in slots.items():
            for c in comps:
                for target in re.findall(r'id="([^"]+)" hx-swap-oob', r.live_parts(v, c, place)):
                    self.assertIn(f'id="{target}"', page, target)


class Escaping(unittest.TestCase):
    def test_person_text_and_chips_are_escaped(self):
        eng = replayed_engine()
        sess = session_with("mapping-live", 2, False, eng)
        evil = '<script>alert(1)</script>'
        app.append_turn(sess, "user", text=evil, chips=[{"label": '"><img src=x onerror=alert(1)>'}])
        sess.views[sess.current].asked = evil
        html = Renderer(sess, eng, app.commands, "x").page()
        self.assertNotIn("<script>alert", html)
        self.assertEqual(html.count('aria-live="polite"'), 1)                 # one polite live region per page
        self.assertNotIn("<img src=x", html)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", html)

    def test_markup_in_spec_strings_never_survives(self):
        raw = {"version": "1", "path": "chat", "why": "<b>x</b>", "suggestions": ["<i>y</i>"], "components": []}
        spec = cat.check_view(raw, 3, app.resolve).spec
        self.assertEqual((spec["why"], spec["suggestions"]), ("Composed for your request.", []))


if __name__ == "__main__":
    unittest.main()
