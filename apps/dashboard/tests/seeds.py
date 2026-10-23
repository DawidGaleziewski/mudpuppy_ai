"""Seeds the API tests share: a trace with events and an agent transcript (T028/T034/T040/T041)."""

from .conftest import BIG_RUN, insert


def seed_trace_with_events_and_agent(w: object) -> None:
    """A gate refusal, a robots check, a fingerprint decision, a stabilization timeout, an
    obstacle and a linked `decision_log` row inside one call; an agent transcript covering it
    (matched turn + tokens + preceding text) plus one call that never got an agent turn and one
    agent tool_use that never reached the server (T028/T034/T040/T041)."""
    insert(w, "trace_boots", id="boot-e", started_at="2026-09-25T19:50:00.000Z")
    insert(
        w,
        "decision_log",
        id="dec-1",
        run_id=BIG_RUN,
        kind="refuse",
        rule="ceiling:mutating",
        reason="mutating action refused on production",
        created_at="2026-09-25T19:50:00.000Z",
    )
    insert(
        w,
        "trace_spans",
        id="e-call-1",
        boot_id="boot-e",
        seq=1,
        run_id=BIG_RUN,
        name="pf_click",
        status="refused",
        duration_ms=80,
        tool_use_id="tu-e1",
    )
    insert(
        w,
        "trace_spans",
        id="e-gate",
        boot_id="boot-e",
        seq=2,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="gate_decision",
        status="ok",
        duration_ms=None,
        attrs_json=(
            '{"input_kind": "act", "action": {"role": "button", "accessible_name": "Buy"},'
            ' "safety_class": "mutating", "allowed": false, "rule": "ceiling:mutating",'
            ' "reason": "mutating action refused on production"}'
        ),
    )
    insert(
        w,
        "trace_spans",
        id="e-decision",
        boot_id="boot-e",
        seq=3,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="decision",
        status="ok",
        duration_ms=None,
        decision_id="dec-1",
        attrs_json='{"decision_id": "dec-1", "kind": "refuse", "rule": "ceiling:mutating"}',
    )
    insert(
        w,
        "trace_spans",
        id="e-robots",
        boot_id="boot-e",
        seq=4,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="robots_check",
        status="ok",
        duration_ms=None,
        attrs_json=(
            '{"url": {"origin": "https://www.liveinsurer.example", "route": "/admin/pixel.gif",'
            ' "query_keys": []}, "rule": "Disallow: /admin/", "action": "blocked"}'
        ),
    )
    insert(
        w,
        "trace_spans",
        id="e-fp",
        boot_id="boot-e",
        seq=5,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="fingerprint_assign",
        status="ok",
        duration_ms=None,
        attrs_json=(
            '{"route_template": "/oferta", "level1": "l1", "decision": "matched",'
            ' "cluster_id": "cluster-1", "matched": true, "similarity": 0.987, "threshold": 0.9}'
        ),
    )
    insert(
        w,
        "trace_spans",
        id="e-stall",
        boot_id="boot-e",
        seq=6,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="stabilization_timeout",
        status="ok",
        duration_ms=None,
        attrs_json=(
            '{"timeout_ms": 5000, "in_flight": [{"url": {"origin": null, "route": "/api/poll",'
            ' "query_keys": []}, "resource_type": "fetch", "age_ms": 4200}],'
            ' "since_mutation_ms": 3000, "running_animations": 1}'
        ),
    )
    insert(
        w,
        "trace_spans",
        id="e-obstacle",
        boot_id="boot-e",
        seq=7,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="obstacle",
        status="ok",
        duration_ms=None,
        attrs_json='{"obstacle_id": "cookie-banner", "selector": "#cookie-accept", "via": "sweep"}',
    )
    insert(
        w,
        "trace_spans",
        id="e-call-2",
        boot_id="boot-e",
        seq=8,
        run_id=BIG_RUN,
        name="pf_extract",
        status="ok",
        duration_ms=20,
        tool_use_id="tu-e2",
    )
    insert(
        w,
        "trace_spans",
        id="e-call-3",
        boot_id="boot-e",
        seq=9,
        run_id=BIG_RUN,
        name="pf_status",
        status="ok",
        duration_ms=5,
        tool_use_id=None,  # no agent context at all, e.g. issued outside a subagent call
    )
    insert(
        w,
        "agent_turns",
        id="e-turn-1",
        message_uuid="eu1",
        block_index=0,
        api_message_id="emsg-1",
        run_id=BIG_RUN,
        kind="text",
        text="Trying to buy the policy to see what happens",
        created_at="2026-09-25T19:50:00.000Z",
    )
    insert(
        w,
        "agent_turns",
        id="e-turn-2",
        message_uuid="eu1",
        block_index=1,
        api_message_id="emsg-1",
        run_id=BIG_RUN,
        kind="tool_use",
        tool_use_id="tu-e1",
        tool_name="mcp__mudpuppy__act",
        input_tokens=200,
        output_tokens=40,
        matched=1,
        created_at="2026-09-25T19:50:00.000Z",
    )
    insert(
        w,
        "agent_turns",
        id="e-turn-3",
        message_uuid="eu2",
        block_index=0,
        api_message_id="emsg-2",
        run_id=BIG_RUN,
        kind="tool_use",
        tool_use_id="tu-never",
        tool_name="mcp__mudpuppy__navigate",
        matched=0,
        created_at="2026-09-25T19:51:00.000Z",
    )
