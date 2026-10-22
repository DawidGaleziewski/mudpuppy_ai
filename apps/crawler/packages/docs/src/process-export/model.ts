// What a process export renders (spec 034 R-68), read once: the resolved steps, the documentation
// records of the process (the SRS export model scoped to its states, so records render exactly as
// in the SRS export, spec 027 FR-006), each step's records and form fields, and the contracts.

import { processModelFacts, type ProcessModelFacts } from '@mudpuppy/store';
import type { RawDb } from '../keys.js';
import { loadExportModel } from '../render/export-load.js';
import type { ExportModel, ExportRecord } from '../render/model.js';
import { applyScope, evidenceStates } from '../scope.js';
import { processContracts, type Contracts } from './contracts.js';
import { elementsOfStep, type StepElements } from './elements.js';
import { validationOf, type ValidationRow } from './validation.js';
import { resolveProcessSteps, type ProcessStep, type ResolvedProcess } from './steps.js';

export interface FieldRow {
  label: string;
  name: string;
  type: string;
  required: boolean;
  validation: string;
  options: string;
  /** The data item that documents the field, when one does. */
  data_item: string | null;
  name_en: string | null;
  /** The step's variants that show the field, when not all of them do (`['b']`: only in 4b). */
  only_in: string[] | null;
}

export interface StepModel extends StepElements {
  step: ProcessStep;
  records: ExportRecord[];
  fields: FieldRow[];
  /** What the form said to wrong input (validation probes). */
  validation: ValidationRow[];
}

export interface ProcessExportModel {
  portal: string;
  environment: string;
  as_of: string;
  process: ResolvedProcess;
  /** The process record itself (PROC), when the process is one. */
  record: ExportRecord | null;
  /** Every record about the process's screens, as the SRS export renders them. */
  srs: ExportModel;
  steps: StepModel[];
  contracts: Contracts;
  /** What the portal model knows of the process (spec 039 T078); null without one. */
  facts: ProcessModelFacts | null;
}

/** The process (PRC) behind an export key: a PROC record's own process, or the PRC itself. */
function processIdOf(raw: RawDb, portal: string, key: string): string | null {
  try {
    const row = (
      key.startsWith('PROC-')
        ? raw
            .prepare('SELECT process_id AS id FROM doc_records WHERE portal_id = ? AND key = ?')
            .get(portal, key)
        : raw
            .prepare('SELECT id FROM ba_processes WHERE portal_id = ? AND key = ?')
            .get(portal, key)
    ) as { id: string | null } | undefined;
    return row?.id ?? null;
  } catch {
    return null; // a store before spec 039
  }
}

interface FormField {
  name?: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: string[];
  constraints?: Record<string, unknown>;
  validation_messages?: string[];
}

function fieldsOf(raw: RawDb, step: ProcessStep, records: readonly ExportRecord[]): FieldRow[] {
  const ids = step.states.flatMap((s) => s.state_ids);
  if (ids.length === 0) return [];
  const forms = raw
    .prepare(
      `SELECT fields_json FROM forms WHERE state_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`,
    )
    .all(...ids) as { fields_json: string }[];
  const byLabel = new Map<string, FieldRow>();
  const dataItems = records.filter((r) => r.kind === 'data_item');
  for (const f of forms)
    for (const x of JSON.parse(f.fields_json) as FormField[]) {
      const label = x.label ?? x.name ?? '';
      if (label === '' || byLabel.has(label)) continue;
      byLabel.set(label, fieldRow(x, label, dataItems));
    }
  const rows = [...byLabel.values()];
  const variants = step.states.filter((s) => s.variant !== null);
  if (variants.length < 2) return rows;
  const shownIn = variants.map((v) => ({ v: v.variant!, labels: labelsOn(raw, v.state_ids) }));
  return rows.map((r) => {
    const on = shownIn.filter((s) => s.labels.has(r.label)).map((s) => s.v);
    return on.length < variants.length ? { ...r, only_in: on } : r;
  });
}

function labelsOn(raw: RawDb, ids: readonly string[]): Set<string> {
  const forms = raw
    .prepare(`SELECT fields_json FROM forms WHERE state_id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids) as { fields_json: string }[];
  return new Set(
    forms.flatMap((f) =>
      (JSON.parse(f.fields_json) as FormField[]).map((x) => x.label ?? x.name ?? ''),
    ),
  );
}

function fieldRow(x: FormField, label: string, dataItems: readonly ExportRecord[]): FieldRow {
  const item = dataItems.find((d) => d.content.name_verbatim === label);
  const constraints = Object.entries(x.constraints ?? {}).map(([k, v]) => `${k} ${String(v)}`);
  return {
    label,
    name: x.name ?? '',
    type: x.type ?? '',
    required: x.required === true,
    validation: [...constraints, ...(x.validation_messages ?? []).map((m) => `“${m}”`)].join('; '),
    options: (x.options ?? []).join(', '),
    data_item: item?.key ?? null,
    name_en: typeof item?.content.name_en === 'string' ? item.content.name_en : null,
    only_in: null,
  };
}

/** The records whose evidence lies on one of the step's states. */
function recordsOfStep(
  raw: RawDb,
  step: ProcessStep,
  records: readonly ExportRecord[],
): ExportRecord[] {
  const ids = new Set([step.state_id, ...step.states.flatMap((s) => s.state_ids)]);
  return records.filter((r) =>
    r.evidence.some((e) => (evidenceStates(raw, e) ?? []).some((s) => ids.has(s))),
  );
}

export function loadProcessExport(
  raw: RawDb,
  portal: string,
  key: string,
  opts: { environment: string; evidenceRoot?: string },
): ProcessExportModel | null {
  const process = resolveProcessSteps(raw, portal, key);
  if (process === null) return null;
  const full = loadExportModel(raw, portal, {
    environment: opts.environment,
    mode: 'all',
    ...(opts.evidenceRoot ? { evidenceRoot: opts.evidenceRoot } : {}),
  });
  const stateIds = process.steps.flatMap((s) => [
    s.state_id,
    ...s.states.flatMap((x) => x.state_ids),
  ]);
  const srs = applyScope(raw, full, { name: process.title, stateIds });
  const record = full.records.find((r) => r.key === key) ?? null;
  const records =
    record && !srs.records.some((r) => r.key === key) ? [record, ...srs.records] : srs.records;
  const scoped = { ...srs, records };
  const processId = processIdOf(raw, portal, key);
  return {
    portal,
    environment: opts.environment,
    as_of: full.as_of,
    process,
    record,
    srs: scoped,
    facts: processId ? processModelFacts(raw, portal, processId) : null,
    steps: process.steps.map((step) => {
      const fields = fieldsOf(raw, step, records);
      return {
        step,
        records: recordsOfStep(raw, step, records),
        fields,
        validation: validationOf(
          raw,
          step.states.flatMap((s) => s.state_ids),
        ),
        ...elementsOfStep(
          raw,
          opts.evidenceRoot,
          step.states,
          fields.map((f) => f.label),
        ),
      };
    }),
    contracts: processContracts(raw, process.steps),
  };
}
