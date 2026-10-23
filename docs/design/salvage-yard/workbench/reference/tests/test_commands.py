"""Writes: propose → Confirm (token) → running → done; idempotent; undo for marks; refused when not on Now."""
import asyncio
import unittest

from commands import Commands
from tests._helpers import replayed_engine


class CommandFlow(unittest.TestCase):
    def run_async(self, coro):
        return asyncio.run(coro)

    def test_confirm_needs_the_token_and_is_idempotent(self):
        cmds = Commands(replayed_engine())

        async def flow():
            c, _ = cmds.propose({"command": "path.attempt", "args": {"scan": "01a110d5-2028-7000-8f3e-5c1a9b27d460", "step": 171, "variation": "record_only"},
                                 "reason": "Testing the flow."})
            self.assertEqual(c.state, "proposed")
            with self.assertRaises(PermissionError):
                await cmds.confirm(c.id, "wrong")
            await cmds.confirm(c.id, c.token)
            self.assertEqual(c.state, "running")
            await cmds.confirm(c.id, c.token)                 # double click: nothing runs twice
            await asyncio.sleep(0.05)
            self.assertEqual(c.state, "done")
            self.assertEqual(c.result["result"], "passed")
            self.assertEqual(len(cmds.engine.attempts[("01a110d5-2028-7000-8f3e-5c1a9b27d460", 171)]), 1)
        self.run_async(flow())

    def test_mark_add_can_be_undone(self):
        cmds = Commands(replayed_engine())

        async def flow():
            c, _ = cmds.propose({"command": "mark.add", "args": {"target": {"route": "/kontakt"}, "kind": "skip"}, "reason": "Testing the flow."})
            await cmds.confirm(c.id, c.token)
            await asyncio.sleep(0.05)
            self.assertEqual(len(cmds.engine.marks), 1)
            await cmds.undo(c.id)
            self.assertEqual((c.state, cmds.engine.marks), ("undone", []))
        self.run_async(flow())

    def test_cancel_and_not_now(self):
        cmds = Commands(replayed_engine())

        async def flow():
            c, _ = cmds.propose({"command": "scan.stop", "args": {"scan": "01a110d5-2028-7000-8f3e-5c1a9b27d460"}, "reason": "Testing the flow."})
            cmds.cancel(c.id)
            self.assertEqual(c.state, "cancelled")
            c2, _ = cmds.propose({"command": "scan.resume", "args": {"scan": "01a110d5-2028-7000-8f3e-5c1a9b27d460"}, "reason": "Testing the flow."})
            await cmds.confirm(c2.id, c2.token, writable=False)
            self.assertEqual(c2.state, "failed")
        self.run_async(flow())

    def test_unknown_command_is_refused(self):
        cmds = Commands(replayed_engine())
        c, why = cmds.propose({"command": "portal.delete", "args": {}, "reason": "clean up"})
        self.assertIsNone(c)


if __name__ == "__main__":
    unittest.main()
