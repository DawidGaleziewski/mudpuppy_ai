"""Shared test helpers: a session with the fixture scan already replayed (no server, no waiting)."""
import asyncio
import logging
import os

os.environ.setdefault("WB_COMMAND_DELAY", "0")

import commands                          # noqa: E402
import fixture as fx                      # noqa: E402

commands.DEMO_DELAY = 0                   # no artificial "running" pause in tests
logging.getLogger("workbench").setLevel(logging.WARNING)   # telemetry lines are noise in test output
from events import Engine                 # noqa: E402


def replayed_engine(stop=True):
    """An Engine whose log holds the whole 01a110d5-2028 replay (published synchronously)."""
    e = Engine(interval=0)

    async def fill():
        e.logs[fx.SCAN] = []
        for step, type_, data in fx.replay_script():
            if not stop and type_ == "scan.stopped":
                break
            await e.publish(fx.SCAN, step, type_, data)
    asyncio.run(fill())
    e._cond = None              # asyncio primitives belong to one loop; the next test gets a fresh one
    return e
