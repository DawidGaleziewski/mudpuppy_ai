/**
 * Did the BA reconcile a step's variants (spec 034, owner review 2026-10-17: "quite paramount")?
 * A step whose form differs by an earlier choice is one step with variants, not two steps. For each
 * `variants` entry of a ground-truth process, some documented process passing that route must show
 * it as exactly one step, with a variant whose form has the field and that the choice leads to.
 * Code-based, over the process export's model (the same steps `pnpm docs:process-export` writes).
 *
 * - `process_variants`: ground-truth variants documented that way.
 * - `export_steps_distinct` (in `export-completeness.ts`) counts the repeats this would hide.
 */
import { loadProcessExport, processKeys, type GroundTruth } from '@pathfinder/docs';
import type { RawDb } from '../../queries.js';
import type { Score } from './export-completeness.js';

type Variant = NonNullable<GroundTruth['processes'][number]['variants']>[number];
type StepModel = NonNullable<ReturnType<typeof loadProcessExport>>['steps'][number];

const score = (matched: number, total: number): Score => ({
  matched,
  total,
  pct: total === 0 ? 0 : Math.round((1000 * matched) / total) / 10,
});

/** The labels of the form fields recorded on the given states. */
function fieldLabels(db: RawDb, ids: readonly string[]): Set<string> {
  const rows = db
    .prepare(`SELECT fields_json FROM forms WHERE state_id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids) as { fields_json: string }[];
  return new Set(
    rows.flatMap((r) =>
      (JSON.parse(r.fields_json) as { label?: string; name?: string }[]).map(
        (f) => f.label ?? f.name ?? '',
      ),
    ),
  );
}

/** The step shows the variant: two or more happy-path variants, one with the field, led to by the choice. */
function showsVariant(db: RawDb, step: StepModel, v: Variant): boolean {
  const variants = step.step.states.filter((s) => s.variant !== null);
  return (
    variants.length >= 2 &&
    variants.some(
      (s) =>
        fieldLabels(db, s.state_ids).has(v.field) &&
        s.reached_by.some((r) => r.startsWith(`"${v.when}"`)),
    )
  );
}

export function scoreVariants(
  db: RawDb,
  portal: string,
  gt: GroundTruth,
  opts: { environment: string },
): { process_variants: Score; missing: string[] } {
  const wanted = gt.processes.flatMap((p) => p.variants ?? []);
  const models = processKeys(db, portal)
    .map((key) => loadProcessExport(db, portal, key, opts))
    .filter((m) => m !== null);
  const missing: string[] = [];
  for (const v of wanted) {
    const found = models.some((m) => {
      const on = m.steps.filter((s) => s.step.route_template === v.step);
      return on.length === 1 && showsVariant(db, on[0]!, v);
    });
    if (!found) missing.push(`${v.step} (${v.field} when ${v.when})`);
  }
  return { process_variants: score(wanted.length - missing.length, wanted.length), missing };
}
