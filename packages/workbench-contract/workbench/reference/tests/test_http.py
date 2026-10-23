"""HTTP: a real uvicorn on a free port, driven with urllib (no extra test dependencies)."""
import http.cookiejar
import os
import re
import socket
import subprocess
import sys
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = free_port()
        env = dict(os.environ, WB_REPLAY_INTERVAL="0.1", WB_COMMAND_DELAY="0.05", WB_COMPOSE_DELAY="0.05")
        cls.proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app:app", "--port", str(cls.port), "--log-level", "warning"],
                                    cwd=HERE, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.base = f"http://127.0.0.1:{cls.port}"
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.base + "/workbench", timeout=1)
                break
            except OSError:
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(5)

    def setUp(self):
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        html = self.op.open(self.base + "/workbench?phase=2").read().decode()
        self.csrf = re.search(r'X-CSRF-Token": "([^"]+)"', html).group(1)
        self.stream_url = re.search(r'sse-connect="([^"]+)"', html).group(1).replace("&amp;", "&")

    def post(self, path, data, csrf=True):
        headers = {"HX-Request": "true"}
        if csrf:
            headers["X-CSRF-Token"] = self.csrf
        req = urllib.request.Request(self.base + path, data=urllib.parse.urlencode(data).encode(), headers=headers)
        return self.op.open(req)

    def resume_url(self, last_id):
        return self.stream_url.split("&last_event_id")[0] + "&last_event_id=" + urllib.parse.quote(last_id)

    def read(self, url, headers=None, until=None, quiet=1.0, limit=15):
        """Read the stream until `until(text)` is true, or nothing arrives for `quiet` seconds. Returns (ids, text)."""
        req = urllib.request.Request(self.base + url, headers=headers or {})
        ids, text, t0 = [], "", time.time()
        with self.op.open(req, timeout=quiet) as s:
            try:
                while time.time() - t0 < limit:
                    line = s.readline().decode()
                    if not line:
                        break
                    text += line
                    if line.startswith("id: "):
                        ids.append(line[4:].strip())
                    if until and until(text):
                        break
            except (socket.timeout, TimeoutError):
                pass
        return ids, text

    def test_posts_need_the_csrf_token(self):
        with self.assertRaises(urllib.error.HTTPError) as e:
            self.post("/workbench/turn", {"text": "hi"}, csrf=False)
        self.assertEqual(e.exception.code, 403)

    def test_turn_command_and_stream_resume(self):
        self.post("/workbench/turn", {"text": "Map the OC/AC calculator"})
        _, text = self.read(self.stream_url, until=lambda t: 'data-cmd-state="proposed"' in t and "Idempotency-Key" in t)
        cid = re.search(r'id="cmd-(k\d+)"', text).group(1)
        token = re.search(r'"token": "([^"]+)"', text).group(1)
        with self.assertRaises(urllib.error.HTTPError):                      # a wrong token runs nothing
            self.post(f"/workbench/commands/{cid}/confirm", {"token": "nope"})
        self.assertEqual(self.post(f"/workbench/commands/{cid}/confirm", {"token": token}).status, 204)
        # the whole story, start to stop: the scan's events and the turns all arrive on one ordered stream
        ids, text = self.read(self.stream_url, until=lambda t: "Next action failed at /kontakt" in t, limit=20)
        self.assertIn('data-cmd-state="done"', text)
        self.assertRegex(text, r"id: \d+\|01a110d5-2028-7000-8f3e-5c1a9b27d460#\d+")                       # ids carry both lanes: outbox|event
        self.assertIn("01a110d5-2028-7000-8f3e-5c1a9b27d460#171", text)
        ids += self.read(self.resume_url(ids[-1]))[0]                         # then until quiet
        # reconnect after message k (Last-Event-ID header, or ?last_event_id= after a hard reconnect): every outbox entry
        # after k arrives, in order, with no gap, and the stream converges on the same last event. (The two lanes may
        # interleave differently on a replay; the page ends up the same.)
        k = len(ids) // 2
        for again in (self.read(self.stream_url, headers={"Last-Event-ID": ids[k]})[0], self.read(self.resume_url(ids[k]))[0]):
            outs = [int(i.split("|")[0]) for i in again]
            delivered = sorted(set(outs))
            self.assertEqual(delivered, list(range(int(ids[k].split("|")[0]) + 1, int(ids[-1].split("|")[0]) + 1)))
            self.assertEqual(outs, sorted(outs))
            self.assertEqual(again[-1].split("|")[1], ids[-1].split("|")[1])

    def test_dropped_stream_refuses_then_recovers(self):
        self.post("/demo/drop", {})
        with self.assertRaises(urllib.error.HTTPError) as e:
            self.op.open(self.base + self.stream_url, timeout=3)
        self.assertEqual(e.exception.code, 503)
        time.sleep(5.2)
        with self.op.open(self.base + self.stream_url, timeout=3) as s:
            self.assertEqual(s.status, 200)


if __name__ == "__main__":
    unittest.main()
