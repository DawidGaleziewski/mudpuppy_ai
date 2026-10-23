/**
 * The status vocabulary (Salvage Yard rule 8, `references/status-map.csv`): every status shows a
 * shape and a word. `data-status` picks the shape and colour; the word is the component's text.
 */
export const STATUSES = [
  'ok',
  'running',
  'live',
  'needs',
  'stopped',
  'skipped',
  'todo',
  'queued',
  'unobserved',
  'draft',
  'inferred',
  'failed',
  'overturned',
] as const;

export type StatusKind = (typeof STATUSES)[number];

/** The default word of each status, when the caller has none of its own. */
export const STATUS_WORD: Record<StatusKind, string> = {
  ok: 'OK',
  running: 'Running',
  live: 'Live',
  needs: 'Needs you',
  stopped: 'Stopped',
  skipped: 'Skipped',
  todo: 'To do',
  queued: 'Queued',
  unobserved: 'Not observed',
  draft: 'Draft',
  inferred: 'Inferred',
  failed: 'Failed',
  overturned: 'Overturned',
};
