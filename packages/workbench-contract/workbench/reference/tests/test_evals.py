"""The golden evals run in CI too (ScriptedAssistant here; the real model in a nightly job with the key set)."""
import asyncio
import contextlib
import io
import unittest

from evals.run_evals import main


class Evals(unittest.TestCase):
    def test_golden_cases_pass(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            failed = asyncio.run(main())
        self.assertEqual(failed, 0, out.getvalue())


if __name__ == "__main__":
    unittest.main()
