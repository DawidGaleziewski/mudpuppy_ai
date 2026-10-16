// A trace's variant runs proposed as one process (spec 031 US5, R-64, field SQ-2/SQ-7): after
// `pnpm portal:trace` drove the variants of one `traces.yaml` entry, the screens of its best run
// become one open grouping suggestion naming every variant run. The BA accepts it in Processes
// (the narrow step) or dismisses it; Pathfinder only proposes (constitution 5.0.0), so no process
// is created here. A set of screens already suggested, accepted or dismissed is not proposed again.

import { newId, nowIso } from '@pathfinder/core';
import {
  GroupingSuggestion,
  observedSteps,
  screensKey,
  type StateRow,
} from '@pathfinder/chat-model';
import type { ServerContext } from '../context.js';
import type { DriveResult } from '../trace-driver.js';

export type TraceGrouping = { suggested: GroupingSuggestion } | { skipped: string };

/** The run whose screens stand for the process: the first that reached its goal, else the longest. */
export function bestRun(results: readonly DriveResult[]): DriveResult | null {
  const ran = results.filter((r) => r.runId !== null);
  return (
    ran.find((r) => r.outcome === 'goal_reached') ??
    [...ran].sort((a, b) => b.steps - a.steps)[0] ??
    null
  );
}

/** The run's screens in the order it went through them, each once. */
export function runStates(ctx: ServerContext, runId: string): StateRow[] {
  const rows = ctx.raw
    .prepare(
      `SELECT ps.ord, ps.state_before, ps.state_after FROM process_steps ps
       JOIN processes p ON p.id = ps.process_id WHERE p.run_id = ? ORDER BY ps.ord`,
    )
    .all(runId) as { state_before: string | null; state_after: string | null }[];
  const ids: string[] = [];
  for (const r of rows)
    for (const id of [r.state_before, r.state_after])
      if (id !== null && !ids.includes(id)) ids.push(id);
  const find = ctx.raw.prepare(
    'SELECT id, title, route_template, screen_id FROM states WHERE id = ?',
  );
  return ids.map((id) => find.get(id) as StateRow);
}

const why = (traceId: string, results: readonly DriveResult[], best: DriveResult): string =>
  `pnpm portal:trace drove "${traceId}": ${results
    .map((r) => `${r.variant} (run ${r.runId ?? '-'}, ${r.outcome})`)
    .join(', ')}. Screens from ${best.variant}; document the process with every run as a variant.`;

export function suggestTraceGrouping(
  ctx: ServerContext,
  input: { portal: string; persona: string; trace: { id: string; name: string } },
  results: readonly DriveResult[],
): TraceGrouping {
  const best = bestRun(results);
  if (best === null) return { skipped: 'no variant started a run' };
  const states = runStates(ctx, best.runId!);
  if (states.length < 2)
    return { skipped: `run ${best.runId!} went through fewer than two screens` };
  const key = screensKey(states.map((s) => s.id));
  const earlier = ctx.raw
    .prepare(
      'SELECT name, status FROM grouping_suggestions WHERE portal_id = ? AND screens_key = ?',
    )
    .get(input.portal, key) as { name: string; status: string } | undefined;
  if (earlier)
    return { skipped: `these screens are already ${earlier.status} as "${earlier.name}"` };
  const suggestion = GroupingSuggestion.parse({
    id: newId(),
    portal_id: input.portal,
    name: input.trace.name,
    persona: input.persona,
    steps: observedSteps(states),
    why: why(input.trace.id, results, best),
    screens_key: key,
    status: 'open',
    conversation_id: null,
    process_id: null,
    decided_by: null,
    decided_at: null,
    created_at: nowIso(),
  });
  ctx.raw
    .prepare(
      `INSERT INTO grouping_suggestions (id, portal_id, name, persona, steps, why, screens_key,
         status, conversation_id, process_id, decided_by, decided_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, NULL, NULL, ?)`,
    )
    .run(
      suggestion.id,
      suggestion.portal_id,
      suggestion.name,
      suggestion.persona,
      JSON.stringify(suggestion.steps),
      suggestion.why,
      suggestion.screens_key,
      suggestion.created_at,
    );
  return { suggested: suggestion };
}
