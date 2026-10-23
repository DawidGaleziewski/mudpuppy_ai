"""Golden prompts and system events → did the assistant pick the right path, the required components, nothing it must
not, the right command? A case has either "message" (a person's turn) or "event" (command done, scan stopped, attempt
result: these arrive as a new turn).

  python3 evals/run_evals.py                 # ScriptedAssistant (always available)
  WB_ASSISTANT=anthropic ANTHROPIC_API_KEY=… python3 evals/run_evals.py   # the real model, same checks

Every spec still goes through catalogue.check_view, exactly like production. "keep" = the reply must not recompose
the screen (no spec, or a spec that falls back). Exit code 1 if any case fails: wire it into CI.
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import catalogue as cat                    # noqa: E402
import fixture as fx                       # noqa: E402
from app import resolve                    # noqa: E402
from assistant import Context, make_assistant   # noqa: E402
from events import Engine, scan_state      # noqa: E402


async def scan(kind):
    """The scan as the assistant would see it: running (at step 102) or stopped (at 171)."""
    if not kind:
        return None
    e = Engine(interval=0)
    e.logs[fx.SCAN] = []
    for step, t, d in fx.replay_script():
        if kind == "running" and step > 102:
            break
        await e.publish(fx.SCAN, step, t, d)
    return scan_state(e, fx.SCAN)


async def run_case(assistant, case):
    ctx = Context(message=case.get("message", ""), chips=case.get("chips", []), phase=case["phase"], scan=await scan(case["scan"]),
                  path="mapping" if case["scan"] else "chat")
    if "event" in case:
        reply = await assistant.on_event(ctx, case["event"])
        if reply is None:
            from assistant import Reply
            reply = Reply("")
    else:
        reply = await assistant.respond(ctx)
    got_path, types = "keep", []
    if reply.spec is not None:
        checked = cat.check_view(reply.spec, case["phase"], resolve)
        if checked.spec and (checked.components or not reply.spec.get("components")):
            got_path, types = checked.spec["path"], [c["type"] for c in checked.components]
    exp = case["expect"]
    problems = []
    if got_path != exp["path"]:
        problems.append(f"path {got_path} ≠ {exp['path']}")
    problems += [f"missing {t}" for t in exp["require"] if t not in types]
    problems += [f"has {t}" for t in exp["must_not"] if t in types]
    cmd = reply.command["command"] if reply.command else None
    if cmd != exp["command"]:
        problems.append(f"command {cmd} ≠ {exp['command']}")
    if exp.get("reply_has") and exp["reply_has"] not in reply.text:
        problems.append(f"reply lacks '{exp['reply_has']}'")
    return got_path, types, cmd, problems


async def main():
    assistant = make_assistant()
    cases = [json.loads(line) for line in (Path(__file__).parent / "golden.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    print(f"Assistant: {type(assistant).__name__} · {len(cases)} cases\n")
    print(f"{'case':<16}{'path':<14}{'components':<34}{'command':<14}result")
    failed = 0
    for case in cases:
        try:
            path, types, cmd, problems = await run_case(assistant, case)
        except Exception as e:                      # a crash is a failure, not a stop
            path, types, cmd, problems = "error", [], None, [str(e)]
        failed += bool(problems)
        print(f"{case['id']:<16}{path:<14}{','.join(types)[:32]:<34}{str(cmd):<14}{'PASS' if not problems else 'FAIL: ' + '; '.join(problems)}")
    print(f"\n{len(cases) - failed}/{len(cases)} passed")
    return failed


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
