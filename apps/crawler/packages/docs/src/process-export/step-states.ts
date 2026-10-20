// The states of one process step (spec 034 R-68; owner review of the first real export,
// 2026-10-17): every recorded state of the step's page, collapsed so that typed values do not make
// rows, and split into variants only where the page's form differs (a radio choice that shows an
// extra box is step 4b, not a new step). Each variant says what led to it, from the recorded
// actions, so the condition is written out instead of guessed.

import type { RawDb } from '../keys.js';

export interface StepState {
  state_id: string;
  /** `main`, `validation` or `technical` (spec 032 state kinds). */
  kind: string;
  title: string;
  form_step: { index: number; label: string } | null;
  screenshot_ref: string | null;
  layout_ref: string | null;
  wireframe_svg_ref: string | null;
  /** How many recorded states this row stands for (typed values make a state each, F-04@032). */
  variants: number;
  /** All the state ids it stands for, the first one shown. */
  state_ids: string[];
  /** `a`, `b`… for the step's main variants (forms that differ); null for error states. */
  variant: string | null;
  /** The recorded actions that led here, e.g. `"Dalej" on /kalkulator/kierowca`. */
  reached_by: string[];
}

export interface StepHead {
  id: string;
  screen_id: string | null;
  title: string;
  route_template: string;
  form_step_id: string | null;
  portal_id: string;
  state_kind: string;
}

interface Row {
  id: string;
  state_kind: string;
  title: string;
  form_step_id: string | null;
  step_index: number | null;
  label: string | null;
  screenshot_ref: string | null;
  layout_ref: string | null;
  svg_ref: string | null;
}

const rows = <T>(raw: RawDb, sql: string, ...args: unknown[]): T[] =>
  raw.prepare(sql).all(...args) as T[];

/** The form a state shows, as its sorted field names: two states with the same form are one variant. */
function formShape(raw: RawDb, stateId: string): string {
  const forms = rows<{ fields_json: string }>(
    raw,
    'SELECT fields_json FROM forms WHERE state_id = ?',
    stateId,
  );
  const names = forms.flatMap((f) =>
    (JSON.parse(f.fields_json) as { name?: string; label?: string }[]).map(
      (x) => x.name ?? x.label ?? '',
    ),
  );
  return [...new Set(names)].sort().join(',');
}

/** The recorded ways into a set of states: the actions (with their page) and direct visits. */
function reachedBy(raw: RawDb, ids: readonly string[]): string[] {
  const marks = ids.map(() => '?').join(',');
  const actions = rows<{ name: string | null; route: string }>(
    raw,
    `SELECT DISTINCT json_extract(e.action_json, '$.accessible_name') AS name, f.route_template AS route
     FROM transitions e JOIN states f ON f.id = e.from_state
     WHERE e.to_state IN (${marks}) AND e.status = 'executed' AND e.from_state NOT IN (${marks})
     ORDER BY route, name LIMIT 6`,
    ...ids,
    ...ids,
  ).map((a) => `"${a.name ?? 'an action'}" on ${a.route}`);
  const direct = rows(
    raw,
    `SELECT 1 FROM observations WHERE state_id IN (${marks}) AND via = 'navigate' LIMIT 1`,
    ...ids,
  );
  return direct.length > 0 ? [...actions, 'its address, opened directly'] : actions;
}

/**
 * Every recorded state of the step's page (the same route; on a same-URL wizard, the same form
 * step), one row per kind, form step and form shape. Happy-path states first, the walked one
 * leading them (it is variant `a`).
 */
export function statesOfStep(raw: RawDb, head: StepHead): StepState[] {
  const found = rows<Row>(
    raw,
    `SELECT s.id, s.state_kind, s.title, s.form_step_id, f.step_index, f.label, s.screenshot_ref,
            s.layout_ref, w.svg_ref
     FROM states s LEFT JOIN form_steps f ON f.id = s.form_step_id
     LEFT JOIN state_wireframes w ON w.state_id = s.id
     WHERE s.portal_id = ? AND s.route_template = ?
       AND (? IS NULL OR s.form_step_id = ? OR s.state_kind = 'technical')
     ORDER BY s.state_kind = 'main' DESC, s.id = ? DESC, s.created_at, s.id`,
    head.portal_id,
    head.route_template,
    head.form_step_id,
    head.form_step_id,
    head.id,
  );
  const groups = new Map<string, { row: Row; ids: string[] }>();
  for (const r of found) {
    const key = `${r.state_kind}|${r.step_index ?? ''}|${r.state_kind === 'main' ? formShape(raw, r.id) : ''}`;
    const g = groups.get(key);
    if (g) g.ids.push(r.id);
    else groups.set(key, { row: r, ids: [r.id] });
  }
  const mains = [...groups.values()].filter((g) => g.row.state_kind === 'main').length;
  let letter = 0;
  return [...groups.values()].map(({ row, ids }) => {
    const main = row.state_kind === 'main';
    return {
      state_id: row.id,
      kind: row.state_kind,
      // A blank document (an empty response, F-11) has no title to show.
      title: row.title || 'Blank page (no title, no content)',
      form_step:
        row.step_index !== null
          ? { index: row.step_index, label: row.label ?? `step ${row.step_index}` }
          : null,
      screenshot_ref: row.screenshot_ref,
      layout_ref: row.layout_ref,
      wireframe_svg_ref: row.svg_ref,
      variants: ids.length,
      state_ids: ids,
      variant: main && mains > 1 ? String.fromCharCode(97 + letter++) : null,
      reached_by: reachedBy(raw, ids),
    };
  });
}
