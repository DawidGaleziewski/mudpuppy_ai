import type { ServerContext } from '../context.js';
import type { RunRow } from './common.js';

interface SnapshotScope {
  max_states?: number;
  max_steps?: number;
  max_run_time_minutes?: number;
}

/** Budgets come from the run's resolved `config_snapshot.scope` (already narrowed by the persona). */
export function scopeOf(run: RunRow): SnapshotScope {
  try {
    const snap = JSON.parse(run.config_snapshot) as { scope?: SnapshotScope };
    return snap.scope ?? {};
  } catch {
    return {};
  }
}

/** True when a step, time or state budget is used up (the run may then finish; there is no external turn limit). */
export async function isBudgetExhausted(ctx: ServerContext, run: RunRow): Promise<boolean> {
  const s = scopeOf(run);
  if (s.max_steps !== undefined && run.steps_used >= s.max_steps) return true;
  if (s.max_run_time_minutes !== undefined && run.elapsed_ms >= s.max_run_time_minutes * 60_000)
    return true;
  if (s.max_states !== undefined) {
    const { n } = await ctx.db
      .selectFrom('state_observations')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('run_id', '=', run.id)
      .executeTakeFirstOrThrow();
    if (Number(n) >= s.max_states) return true;
  }
  return false;
}
