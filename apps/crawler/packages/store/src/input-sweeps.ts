/**
 * Input sweeps (spec 080 FR-003, R-97 (4)): a rule with bands ("engine factor 0.9 up to 1400 cm³,
 * 1.0 to 2000, 1.25 above") needs several values of one input, and a scan types one. For a
 * recorded journey that typed a number into a field with a minimum and a maximum and later reached
 * a page that shows values (`shown.*` attributes), `pendingSweeps` plans a sweep: the same walk on
 * the headless driver with that number spread over its range. The driver (`sweepPortal` in
 * mcp-server) halves every gap whose two ends show different values, and `recordBand` keeps each
 * edge it finds as a decision note `input_band`, which the BA's rules pass lists until a business
 * rule states it. Pure planning over the store; the replays are the driver's.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@mudpuppy/core';
import { attributeName } from '@mudpuppy/model';
import { journeyPath, referenceOf } from './replay-tests.js';

type Raw = BetterSqlite3.Database;

export interface SweepPlan {
  portal: string;
  persona: string;
  environment: string;
  startUrl: string;
  steps: string[];
  /** Every input the journey typed (`input.<attribute>` → value), the swept one included. */
  inputs: Record<string, string>;
  /** The swept input: its attribute (`input.pojemność_silnika_cm`) and the form's label. */
  attribute: string;
  label: string;
  min: number;
  max: number;
  purpose: string;
}

interface Field {
  label?: unknown;
  type?: unknown;
  constraints?: { min?: unknown; max?: unknown };
}

/** Numeric fields with both limits, by attribute name, from the run's recorded forms. */
function limitedFields(
  raw: Raw,
  runId: string,
): Map<string, { label: string; min: number; max: number }> {
  const out = new Map<string, { label: string; min: number; max: number }>();
  const rows = raw.prepare('SELECT fields_json FROM forms WHERE run_id = ?').all(runId) as {
    fields_json: string;
  }[];
  for (const r of rows)
    for (const f of JSON.parse(r.fields_json) as Field[]) {
      if (f.type !== 'number' || typeof f.label !== 'string') continue;
      // `Number(undefined)` is NaN, so a side with no limit drops the field.
      const [min, max] = [Number(f.constraints?.min), Number(f.constraints?.max)];
      if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
      if (max - min < 2) continue;
      out.set(`input.${attributeName(f.label)}`, { label: f.label, min, max });
    }
  return out;
}

/** Journeys that showed values after typing, latest first: their last shown step. */
function shownJourneys(raw: Raw, portal: string) {
  return raw
    .prepare(
      `SELECT w.journey_id, max(w.seq) AS seq, j.run_id, r.persona_id, r.environment, max(w.created_at) AS at
       FROM attribute_writes w JOIN journeys j ON j.id = w.journey_id JOIN runs r ON r.id = j.run_id
       WHERE r.portal_id = ? AND r.mode <> 'probe' AND w.source = 'shown' AND w.seq > 0
       GROUP BY w.journey_id ORDER BY at DESC`,
    )
    .all(portal) as {
    journey_id: string;
    seq: number;
    run_id: string;
    persona_id: string;
    environment: string;
    at: string;
  }[];
}

/** One plan per swept input, from the latest journey that typed it and then showed values. */
export function pendingSweeps(
  raw: Raw,
  portal: string,
  opts: { limit?: number } = {},
): SweepPlan[] {
  const out: SweepPlan[] = [];
  const planned = new Set<string>();
  for (const j of shownJourneys(raw, portal)) {
    const reference = referenceOf(raw, { journey_id: j.journey_id, seq: j.seq, created_at: j.at });
    const fields = limitedFields(raw, j.run_id);
    const inputs = Object.fromEntries(
      Object.entries(reference)
        .filter(([name]) => name.startsWith('input.'))
        .map(([name, v]) => [name, String(v)]),
    );
    for (const [attribute, value] of Object.entries(reference)) {
      const field = fields.get(attribute);
      if (!field || typeof value !== 'number' || planned.has(attribute)) continue;
      const path = journeyPath(raw, j.journey_id, j.seq);
      if (!path) continue;
      planned.add(attribute);
      out.push({
        portal,
        persona: j.persona_id,
        environment: j.environment,
        ...path,
        inputs,
        attribute,
        ...field,
        purpose: `input sweep of "${field.label}" (headless replay, spec 080)`,
      });
      if (out.length >= (opts.limit ?? Number.POSITIVE_INFINITY)) return out;
    }
  }
  return out;
}

/** What one replay showed: the `shown.*` attributes of the run's last journey. */
export function shownOf(raw: Raw, runId: string): Record<string, string> {
  const rows = raw
    .prepare(
      `SELECT w.name, coalesce(w.value_text, CAST(w.value_num AS TEXT)) AS v FROM attribute_writes w
       WHERE w.source = 'shown' AND w.journey_id = (
         SELECT id FROM journeys WHERE run_id = ? ORDER BY started_at DESC, id DESC LIMIT 1)
       ORDER BY w.seq`,
    )
    .all(runId) as { name: string; v: string | null }[];
  return Object.fromEntries(rows.map((r) => [r.name, r.v ?? '']));
}

/** One edge a sweep found: the swept field, the two neighbouring values and what changed. */
export interface InputBand {
  label: string;
  attribute: string;
  below: number;
  above: number;
  changed: { name: string; below: string; above: string }[];
}

/** Keep a band edge as a decision note `input_band` on the run that showed the upper value. */
export function recordBand(raw: Raw, runId: string, band: InputBand): void {
  const shown = band.changed.map(
    (c) => `${c.name.replace(/^shown\./, '')} ${c.below} → ${c.above}`,
  );
  raw
    .prepare(
      `INSERT INTO decision_log (id, run_id, kind, rule, reason, subject_ref, detail_json, created_at)
       VALUES (?, ?, 'note', 'input_band', ?, NULL, ?, ?)`,
    )
    .run(
      newId(),
      runId,
      `"${band.label}" ${String(band.below)} → ${String(band.above)} changes what the page shows: ${shown.join('; ')}`,
      JSON.stringify(band),
      nowIso(),
    );
}
