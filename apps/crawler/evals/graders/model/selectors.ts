/**
 * Helpers for a judge's `selectPairs` (spec 017 contracts/judge-definition.md): picking candidate
 * records and turning one into the text the judge reads. Pure.
 */
import { normalise, type EvalRecord, type GroundTruth } from '@mudpuppy/docs';
import { pairId, type Pair } from './definition.js';

export { normalise };

export const ofKind = (records: readonly EvalRecord[], ...kinds: string[]): EvalRecord[] =>
  records.filter((r) => kinds.includes(r.kind));

/** Whether any evidence of the record was seen on this route template. */
export const citingRoute = (record: EvalRecord, route: string): boolean =>
  record.evidence.some((e) => e.routes.includes(route));

/** The route template of a ground-truth screen, or undefined for an unknown id. */
export const screenRoute = (gt: GroundTruth, screenId: string): string | undefined =>
  gt.screens.find((s) => s.id === screenId)?.route_template;

const show = (v: unknown): string =>
  typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);

function line(key: string, value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value))
    return value.length === 0 ? [] : [`${key}: ${value.map(show).join(', ')}`];
  return [`${key}: ${show(value)}`];
}

/** The record's content as `key: value` lines (no `kind`), plus its confidence label. */
export function recordText(record: EvalRecord): string {
  const content = Object.entries(record.content).flatMap(([k, v]) =>
    k === 'kind' ? [] : line(k, v),
  );
  const flags = [
    `confidence: ${record.confidence}`,
    ...(record.not_observable ? ['not_observable: true'] : []),
  ];
  return [...content, ...flags].join('\n');
}

export function toPair(itemId: string, item: string, record: EvalRecord): Pair {
  return {
    id: pairId(itemId, record.key, record.rev),
    itemId,
    item,
    record: { key: record.key, rev: record.rev, kind: record.kind, text: recordText(record) },
  };
}
