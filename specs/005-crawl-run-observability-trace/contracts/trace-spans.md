# Contract: Tracer and span vocabulary

Tables in `../data-model.md`; rationale in `../research.md` §1–§10.

## Tracer API (`apps/crawler/packages/core/src/trace/tracer.ts`)

```ts
interface TracerDeps {
  db: PathfinderDb; logger: Logger; evidence: EvidenceStore;
  now?: () => Date; monotonic?: () => number; newId?: () => string;   // injected in tests
  level: 'off' | 'standard' | 'verbose';
}
interface Tracer {
  readonly bootId: string;
  start(boot: { environment: string; server: 'pathfinder'; version: string; pwTrace: 'non_production' | 'all' }): Promise<void>;
  sweepUnfinished(): Promise<number>;                          // earlier boots' running → unfinished
  call<T>(c: CallStart, fn: (span: SpanHandle) => Promise<T>): Promise<T>;
  phase<T>(name: PhaseName, fn: (span: SpanHandle) => Promise<T>, attrs?: Attrs): Promise<T>;
  event(name: EventName, attrs: Attrs, opts?: { status?: SpanStatus; summary?: string; decisionId?: string }): void;
  eventForRun(runId: string, name: EventName, attrs: Attrs, opts?: …): void; // outside ALS (§3)
  health(runId: string): { dropped: number; truncated: number };
  shutdown(): Promise<void>;                                  // flush, set trace_boots.ended_at
}
interface CallStart { tool: string; runId: string | null; args: unknown; meta?: Record<string, unknown>; requestId?: string | number; rationale?: string }
interface SpanHandle { setRunId(id: string): void; set(attrs: Attrs): void; setStatus(s: SpanStatus): void; setOutput(v: unknown): void }
```

Rules:

- `call` inserts its row immediately (`running`), runs `fn` inside `AsyncLocalStorage`, then writes
  final status, `ended_at`, `duration_ms`, output and all buffered children in one transaction.
- Status from the outcome: resolved → `ok`; `ToolError` code `ACTION_REFUSED` → `refused`;
  `RUN_STOPPED` → `stopped`; any other throw → `error`. Every throw also emits `event error`
  (`code`, message masked, `stack_top` for non-`ToolError`). The original error is rethrown
  unchanged.
- `phase` outside a `call` runs its function untraced (services are also called directly by tests
  and scripts); nothing is written.
- `event` inside a call attaches to the innermost open span; `eventForRun` attaches to the run's
  active call or, if none, writes `between_calls = 1`.
- All writes are wrapped: a failure increments `dropped` for the run, logs via pino, never throws.
- Level `off`: only `call` spans; `standard`/`verbose` differ only in `request` events (§10).
- Scrubbing and caps are applied inside the tracer (`scrubTraceJson`, `maskText`, `limits.ts`);
  never plain `scrubJson`, which masks every id (research §7).

## Names

**Calls**: the eight `AGENT_TOOL_NAMES`.

**Phases**: `preflight`, `resume_check`, `robots_fetch`, `insert_run`, `open_session`,
`restore_index`, `begin_step`, `gate`, `reach_state`, `locate`, `click`, `goto`, `settle`,
`observe`, `net_drain`, `fingerprint`, `record_state`, `record_forms`, `record_transition`,
`record_api_calls`, `enqueue_frontier`, `run_bookkeeping`, `complete_run`.

**Events** and their required attributes:

| Event | Attributes |
| --- | --- |
| `gate_decision` | `input_kind` (`navigate`/`act`), `url` (shaped) or `action` {role, accessible_name, nth}, `safety_class`, `allowed`, `rule`, `reason`, `policy_id?` |
| `item_cap` | `route_template`, `count`, `cap`, `allowed` |
| `locator` | `role`, `accessible_name`, `nth`, `matches`, `outcome` (`clicked`/`absent`/`click_failed`), `error?` |
| `stabilization_timeout` | `timeout_ms`, `in_flight` [{url, resource_type, age_ms}], `since_mutation_ms`, `running_animations` |
| `fingerprint_assign` | `route_template`, `level1`, `decision` (kind), `cluster_id`, `matched`, `similarity`, `threshold` |
| `state_recorded` | `state_id`, `created`, `evidence_ref` |
| `frontier_enqueue` / `frontier_skip` | `frontier_id`, `action`, `safety_class`, `priority`, `depth`, `rule?`, `reason?` |
| `frontier_pick` | `frontier_id?`, `priority?`, `depth?`, `pending`, `reason?` (`empty`/`budget_exhausted`) |
| `request` | `method`, `resource_type`, `url` (shaped), `main_frame`, `decision` (`continue`/`abort`/`fulfill`), `reason?`, `robots_rule?`, `limiter_wait_ms`, `status?`, `redirect_to?` (shaped), `failed?` |
| `request_aggregate` | `by_type_decision` {"xhr:continue": n, …}, `limiter_wait_ms_total`, `count` |
| `robots_check` | `url` (shaped), `rule`, `action` (`blocked`/`allowed`) |
| `limiter_wait` | `wait_ms`, `halted` |
| `block_verdict` | `signature`, `status`, `url` (shaped) |
| `run_stop` | `warning` (masked) |
| `run_status` | `status`, `steps_used`, `elapsed_ms`, `max_depth_reached` |
| `decision` | `decision_id`, `kind`, `rule` |
| `obstacle` | `obstacle_id`, `selector`, `via` |
| `error` | `code`, `message`, `stack_top?` |
| `trace_health` | `dropped`, `truncated` |
| `concurrent_calls` | `overlapping_calls` [span ids], `run_id` — once per overlap, on each call involved (research §3) |

Any event attached through `eventForRun` while more than one browser call of the run is open also
carries `overlapping_calls`.

A shaped URL is `{origin, route, query_keys}` from `shapeUrl()`; raw URLs are never stored.

## Callbacks added to `@pathfinder/crawler` (trace-agnostic)

```ts
// request-gate.ts (RequestGateOptions; BrowserSession passes them via SessionOptions.observe)
interface RequestDecision { url: string; method: string; resourceType: string; mainFrame: boolean;
  decision: 'continue' | 'abort' | 'fulfill';
  reason?: 'navigation_policy' | 'robots' | 'redirect_refused' | 'limiter_halted';
  rule?: string; robotsRule?: string; limiterWaitMs: number;
  status?: number; redirectTo?: string; failed?: string }
onRequestDecision?: (d: RequestDecision) => void;                    // every routed request
onRobotsCheck?: (c: { url: string; rule: string; action: 'blocked' | 'allowed' }) => void; // every occurrence
onResponse?: (r: { url: string; status: number; resourceType: string }) => void;          // every response
onBlockVerdict?: (v: { kind: string; warning: string; status: number; url: string }) => void;
now?: () => number;                                                  // limiter-wait clock
// A throwing hook is swallowed; hooks never change the gate's behaviour.
// `status` on a `continue` request comes from `onResponse` (the route handler cannot see it);
// failed requests (`requestfailed`) come from the network activity tracker (§9).

// stabilizer.ts
trackNetworkActivity(page, now?, { onRequestFailed?: (f: { url; resourceType; failure }) => void })
  // NetworkActivity gains inFlightRequests(): { url; resourceType; ageMs }[]
settleWithDiagnostics(page, net, opts): Promise<{ result: StabilizationResult; waitedMs: number;
  diagnostics?: { inFlight: { url: string; resourceType: string; ageMs: number }[];
                  sinceMutationMs: number | null; runningAnimations: number | null;
                  msSinceNetworkActivity: number } }>;   // diagnostics only on timeout

// session.ts
BrowserSession.settleTraced(): Promise<SettleOutcome & { obstacles: ObstacleEvent[] }>;
SessionOptions.observe: gate hooks above + onRequestFailed
```

Existing callbacks and `settle()` keep their current behaviour.

## No agent access

`AGENT_TOOL_NAMES` is unchanged; no tool reads or writes trace tables.
