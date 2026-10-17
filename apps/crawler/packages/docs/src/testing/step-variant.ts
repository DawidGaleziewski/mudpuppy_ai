import type { FixtureStore } from './fixture-store.js';

/**
 * Another recording of the calculator state (spec 034, owner review 2026-10-17): a copy of the
 * vehicle state and its form, with `extraField` added to the form when given (a variant, e.g. a box
 * a radio choice shows), reached from `from` by an executed action named `label`.
 */
export function addStepVariant(
  fx: FixtureStore,
  v: { id: string; from: string; label: string; extraField: string | null },
): void {
  fx.raw
    .prepare(
      `INSERT INTO states SELECT @id, portal_id, @id, cluster_id, route_template, title, evidence_ref,
         confidence, stabilization, first_seen_run, created_at, screenshot_ref, layout_ref, screen_id,
         screen_rev, form_step_id, state_kind FROM states WHERE id = @src`,
    )
    .run({ id: v.id, src: fx.states.vehicle });
  const form = fx.raw
    .prepare('SELECT fields_json FROM forms WHERE state_id = ?')
    .get(fx.states.vehicle) as { fields_json: string };
  const fields = JSON.parse(form.fields_json) as object[];
  if (v.extraField !== null)
    fields.push({ name: v.extraField, label: v.extraField, type: 'number', required: true });
  fx.raw
    .prepare(
      `INSERT INTO forms SELECT @fid, run_id, @id, @fields, evidence_ref, confidence, created_at
       FROM forms WHERE state_id = @src`,
    )
    .run({ fid: `form-${v.id}`, id: v.id, fields: JSON.stringify(fields), src: fx.states.vehicle });
  fx.raw
    .prepare(
      `INSERT INTO edges SELECT @eid, run_id, @from, @id, @action, safety_class, 'executed',
         evidence_ref, confidence, NULL, stabilization, created_at FROM edges WHERE id = @src`,
    )
    .run({
      eid: `edge-${v.id}`,
      from: v.from,
      id: v.id,
      action: JSON.stringify({ accessible_name: v.label }),
      src: fx.edges.carToVehicle,
    });
}
