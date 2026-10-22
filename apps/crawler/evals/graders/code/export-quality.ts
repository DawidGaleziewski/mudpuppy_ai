/**
 * How good a process export is, scored against the ground truth (spec 034 phase 9, the owner,
 * 2026-10-17: "check the quality of our exports"). Code-based, no tokens, over the `process.json`
 * of each exported process, so the approved export in `evals/reference-solutions/` scores the same
 * way a trial's does. Only ground-truth processes that list export facts (`actions` or `apis`)
 * count; each is compared with the exported process that covers most of its steps.
 *
 * Goal scores:
 * - `export_steps`: the process's steps shown in order (longest common run of routes).
 * - `export_fields`: the fields of its forms, each on its step with the right label, type,
 *   required flag, options and limits; a field only some variants show is marked so.
 * - `export_validation`: the messages the ground truth lists per field, verbatim on that step.
 * - `export_actions`: the action that moves each step on, leading to the right step.
 * - `export_apis`: the back-end calls of each step.
 * Checks (must be 0): `export_extra_steps` (steps not in the process, F-15),
 * `export_action_strays` (destinations of those actions outside the process, F-11),
 * `export_noise_leaked` (noise calls listed as endpoints), and `export_wrong_start` /
 * `export_wrong_end` (an exported process whose first or last step is not the ground truth's
 * `first_route` / `last_observable_route`: where a process starts and ends, R-77 (2), spec 039
 * T082).
 */
import { exportProcess, processKeys, type GroundTruth } from '@mudpuppy/docs';
import type { RawDb } from '../../queries.js';
import type { Score } from './export-completeness.js';

/** The parts of `process.json` (format `mudpuppy-process-export/1`) scored here. */
export interface ProcessJson {
  process: { key: string };
  steps: {
    n: number;
    route: string;
    fields: {
      label: string;
      type: string;
      required: boolean;
      validation: string;
      options: string;
      only_in: string[] | null;
    }[];
    elements: { kind: string; name: string; leads_to: string[] }[];
    validation: { field: string | null; message: string | null }[];
  }[];
  network: { endpoints: { method: string; path: string; steps: number[] }[] };
}

export interface ExportQuality {
  scores: {
    export_steps: Score;
    export_fields: Score;
    export_validation: Score;
    export_actions: Score;
    export_apis: Score;
  };
  checks: {
    export_extra_steps: number;
    export_action_strays: number;
    export_noise_leaked: number;
    export_wrong_start: number;
    export_wrong_end: number;
  };
  /** What was not found, one line each, for the log and the result. */
  missing: string[];
}

type GtProcess = GroundTruth['processes'][number];
type GtField = GroundTruth['forms'][number]['fields'][number];
type Step = ProcessJson['steps'][number];

const score = (matched: number, total: number): Score => ({
  matched,
  total,
  pct: total === 0 ? 0 : Math.round((1000 * matched) / total) / 10,
});

/** Length of the longest common subsequence: steps shown in the right order. */
function inOrder(want: readonly string[], got: readonly string[]): number {
  const row = new Array<number>(got.length + 1).fill(0);
  for (const w of want) {
    let diag = 0;
    for (let j = 1; j <= got.length; j++) {
      const up = row[j]!;
      row[j] = w === got[j - 1] ? diag + 1 : Math.max(row[j]!, row[j - 1]!);
      diag = up;
    }
  }
  return row[got.length]!;
}

/** The exported process that shows most of the ground-truth process's steps. */
function bestExport(p: GtProcess, exports: readonly ProcessJson[]): ProcessJson | null {
  let best: ProcessJson | null = null;
  let most = 0;
  for (const e of exports) {
    const n = (p.steps ?? []).filter((r) => e.steps.some((s) => s.route === r)).length;
    if (n > most) [best, most] = [e, n];
  }
  return best;
}

/** The limits the export's validation column must name, as the export writes them. */
function limits(f: GtField): string[] {
  const c = f.constraints;
  return [
    ...(c.min !== undefined ? [`min ${c.min}`] : []),
    ...(c.max !== undefined ? [`max ${c.max}`] : []),
    ...(c.pattern !== undefined ? [`pattern ${c.pattern}`] : []),
    ...(c.max_length !== undefined ? [`maxlength ${c.max_length}`] : []),
  ];
}

function fieldShown(f: GtField, step: Step, variantField: boolean): boolean {
  const row = step.fields.find((x) => x.label === f.label);
  if (!row) return false;
  const options = row.options.split(', ');
  return (
    (f.type === undefined || row.type === f.type) &&
    row.required === (f.constraints.required === true) &&
    (f.constraints.allowed_values ?? []).every((v) => options.includes(v)) &&
    limits(f).every((l) => row.validation.includes(l)) &&
    (row.only_in !== null) === variantField
  );
}

/** One ground-truth process against its export; `missing` collects what was not found. */
interface Scoring {
  p: GtProcess;
  steps: readonly string[];
  e: ProcessJson | null;
  missing: string[];
}

const stepOn = (c: Scoring, route: string): Step | undefined =>
  c.e?.steps.find((s) => s.route === route);

/** 1 when found, else 0 and a line in `missing`. */
function tally(c: Scoring, ok: boolean, what: string): number {
  if (!ok) c.missing.push(`${c.p.id}: ${what}`);
  return ok ? 1 : 0;
}

/** The fields of the forms on the process's steps, and the messages listed for them. */
function scoreFields(gt: GroundTruth, c: Scoring) {
  const screens = new Map(gt.screens.map((s) => [s.id, s.route_template]));
  const fields = gt.forms
    .filter((f) => c.steps.includes(screens.get(f.screen) ?? ''))
    .flatMap((f) => f.fields.map((x) => ({ route: screens.get(f.screen)!, field: x })));
  const variantFields = new Set((c.p.variants ?? []).map((v) => `${v.step}|${v.field}`));
  const out = { fields: [0, fields.length], validation: [0, 0] };
  for (const { route, field } of fields) {
    const step = stepOn(c, route);
    const variant = variantFields.has(`${route}|${field.label}`);
    out.fields[0]! += tally(
      c,
      !!step && fieldShown(field, step, variant),
      `field "${field.label}"`,
    );
    for (const m of field.messages ?? []) {
      out.validation[1]! += 1;
      const shown = step?.validation.some((v) => v.field === field.label && v.message === m);
      out.validation[0]! += tally(c, !!shown, `message "${m}" of "${field.label}"`);
    }
  }
  return out;
}

/** The actions that move each step on, and their destinations outside the process. */
function scoreActions(c: Scoring) {
  const out = { actions: [0, (c.p.actions ?? []).length], strays: 0 };
  for (const a of c.p.actions ?? []) {
    const els = stepOn(c, a.step)?.elements.filter((x) => x.kind === 'action' && x.name === a.name);
    const leads = els?.flatMap((x) => x.leads_to) ?? [];
    out.actions[0]! += tally(
      c,
      leads.includes(a.leads_to),
      `"${a.name}" on ${a.step} → ${a.leads_to}`,
    );
    out.strays += new Set(leads.filter((r) => !c.steps.includes(r))).size;
  }
  return out;
}

function scoreApis(c: Scoring) {
  let found = 0;
  for (const a of c.p.apis ?? []) {
    const n = stepOn(c, a.step)?.n ?? -1;
    const listed = (c.e?.network.endpoints ?? []).some(
      (x) => x.method === a.method && x.path === a.path && x.steps.includes(n),
    );
    found += tally(c, listed, `${a.method} ${a.path} on ${a.step}`);
  }
  return [found, (c.p.apis ?? []).length];
}

/**
 * The export ends at the last observable screen, or at a step of the process past it (the
 * boundary step of a process that ends in a mutation, e.g. the purchase).
 */
function endsRight(p: GtProcess, last: string | undefined): boolean {
  if (last === p.last_observable_route) return true;
  const steps = p.steps ?? [];
  const at = last === undefined ? -1 : steps.indexOf(last);
  return at >= 0 && at > steps.indexOf(p.last_observable_route);
}

function scoreProcess(gt: GroundTruth, p: GtProcess, e: ProcessJson | null) {
  const c: Scoring = { p, steps: p.steps ?? [], e, missing: [] };
  const routes = e?.steps.map((s) => s.route) ?? [];
  const endpoints = e?.network.endpoints ?? [];
  const noise = gt.noise ?? [];
  return {
    steps: [inOrder(c.steps, routes), c.steps.length],
    ...scoreFields(gt, c),
    ...scoreActions(c),
    apis: scoreApis(c),
    extra: routes.filter((r) => !c.steps.includes(r)).length,
    start: e && routes[0] !== p.first_route ? 1 : 0,
    end: e && !endsRight(p, routes.at(-1)) ? 1 : 0,
    leaked: endpoints.filter((x) => noise.some((n) => x.path.startsWith(n.path))).length,
    missing: c.missing,
  };
}

/** The `process.json` of every documented process, exported as `pnpm docs:process-export` does. */
export function exportedProcesses(
  db: RawDb,
  portal: string,
  opts: { environment: string; evidenceRoot?: string },
): ProcessJson[] {
  return processKeys(db, portal).flatMap((key) => {
    const json = exportProcess(db, portal, key, opts)?.get('process.json');
    return typeof json === 'string' ? [JSON.parse(json) as ProcessJson] : [];
  });
}

export function scoreExportQuality(
  gt: GroundTruth,
  exports: readonly ProcessJson[],
): ExportQuality | null {
  const wanted = gt.processes.filter((p) => p.actions || p.apis);
  if (wanted.length === 0) return null;
  const parts = wanted.map((p) => scoreProcess(gt, p, bestExport(p, exports)));
  const sum = (k: 'steps' | 'fields' | 'validation' | 'actions' | 'apis'): Score =>
    score(
      parts.reduce((n, x) => n + x[k][0]!, 0),
      parts.reduce((n, x) => n + x[k][1]!, 0),
    );
  const count = (k: 'extra' | 'strays' | 'leaked' | 'start' | 'end'): number =>
    parts.reduce((n, x) => n + x[k], 0);
  return {
    scores: {
      export_steps: sum('steps'),
      export_fields: sum('fields'),
      export_validation: sum('validation'),
      export_actions: sum('actions'),
      export_apis: sum('apis'),
    },
    checks: {
      export_extra_steps: count('extra'),
      export_action_strays: count('strays'),
      export_noise_leaked: count('leaked'),
      export_wrong_start: count('start'),
      export_wrong_end: count('end'),
    },
    missing: parts.flatMap((x) => x.missing),
  };
}
