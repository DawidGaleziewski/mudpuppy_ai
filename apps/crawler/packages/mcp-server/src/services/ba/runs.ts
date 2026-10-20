// list_runs: a portal's runs with their counts and the persona's attributes (moved out of
// `reads.ts` by spec 024, which pushed that file past the size limit).

import { z } from 'zod';
import type { BaContext } from '../../context.js';
import { parseInput } from '../../errors.js';
import { json } from './common.js';

type Row = Record<string, unknown>;

export const ListRunsInput = z.object({ portal_id: z.string().min(1) }).strict();

const RUN_COUNTS: Record<string, string> = {
  states: 'state_observations',
  transitions: 'transitions',
  forms: 'forms',
  network_calls: 'network_calls',
  actions: 'actions',
  open_questions: 'open_questions',
  rule_candidates: 'rule_candidates',
};

/**
 * The persona attributes a run ran with (spec 024 US1.1): from its own config snapshot, so a later
 * change of the persona file does not rewrite what the run was. `{}` when the persona had none.
 */
function personaAttributes(snapshot: unknown): Record<string, unknown> {
  const persona =
    typeof snapshot === 'string'
      ? json<{ persona?: { attributes?: unknown } }>(snapshot).persona
      : undefined;
  const attrs = persona?.attributes;
  return attrs && typeof attrs === 'object' ? (attrs as Record<string, unknown>) : {};
}

/** Runs of a portal, oldest first, with how much each recorded and its persona's attributes. */
export function listRuns(ctx: BaContext, raw: unknown): { runs: Row[] } {
  const input = parseInput(ListRunsInput, raw);
  const counts = Object.entries(RUN_COUNTS)
    .map(([name, table]) => `(SELECT COUNT(*) FROM ${table} t WHERE t.run_id = runs.id) AS ${name}`)
    .join(', ');
  const rows = ctx.raw
    .prepare(
      `SELECT id, mode, persona_id, environment, status, warning, started_at, ended_at,
              config_snapshot,
              (SELECT p.name FROM processes p WHERE p.run_id = runs.id) AS process_name, ${counts}
       FROM runs WHERE portal_id = ? ORDER BY id`,
    )
    .all(input.portal_id) as Row[];
  return {
    runs: rows.map((r) => {
      const {
        id,
        mode,
        persona_id,
        environment,
        status,
        warning,
        started_at,
        ended_at,
        config_snapshot,
        process_name,
        ...n
      } = r;
      return {
        run_id: id,
        mode,
        persona_id,
        persona_attributes: personaAttributes(config_snapshot),
        environment,
        status,
        warning,
        started_at,
        ended_at,
        counts: n,
        // Trace runs name their process; map runs have none.
        process_name: process_name ?? null,
      };
    }),
  };
}
