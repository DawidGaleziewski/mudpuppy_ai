// The context a Workbench turn sends the assistant (spec 043 T017, FR-020; designer
// 17-genui-architecture.md § 4.5): as_of, phase, the path and who chose it, the person's chips
// (structured, never pasted), the current view spec, and a summary of the bound scans from the
// store. Text that came from the portal (routes, titles) goes inside <scan_data> with every < and >
// escaped, truncated to 4 000 characters, so captured text cannot close the wrapper.

import type BetterSqlite3 from 'better-sqlite3';

export const SCAN_DATA_LIMIT = 4000;

/** A full scan id (D-9, the contract's `scanId`) and an event reference on it (`eventRef`). */
export const SCAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENT_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}#[0-9]{1,6}$/;

export type Chip =
  | { kind: 'page'; scan: string; route: string; state?: number }
  | { kind: 'step'; scan: string; step: number }
  | { kind: 'event'; ref: string }
  | { kind: 'view'; id: string };

/** At most 3 chips, each of a known shape (WB-UI-11); anything else is left out. */
export function chipsOf(value: unknown): Chip[] {
  if (!Array.isArray(value)) return [];
  const ok = (c: unknown): c is Chip => {
    if (typeof c !== 'object' || c === null) return false;
    const o = c as Record<string, unknown>;
    if (o.kind === 'page')
      return typeof o.scan === 'string' && SCAN_ID.test(o.scan) && typeof o.route === 'string';
    if (o.kind === 'step')
      return typeof o.scan === 'string' && SCAN_ID.test(o.scan) && Number.isInteger(o.step);
    if (o.kind === 'event') return typeof o.ref === 'string' && EVENT_REF.test(o.ref);
    return o.kind === 'view' && typeof o.id === 'string';
  };
  return value.filter(ok).slice(-3);
}

export const escapeData = (text: string): string =>
  text.replaceAll('<', '&lt;').replaceAll('>', '&gt;');

interface ScanRow {
  id: string;
  status: string;
  started_at: string;
  warning: string | null;
}

interface ScanSummary {
  /** The full id: what the model binds (D-9). */
  id: string;
  status: string;
  steps: number;
  pages: number;
  /** Portal text: inside <scan_data>. */
  at: string | null;
  error: string | null;
}

const WORDS: Record<string, string> = {
  running: 'running',
  completed: 'finished',
  interrupted: 'stopped',
  stopped_warning: 'stopped',
};

function summaryOf(raw: BetterSqlite3.Database, run: ScanRow): ScanSummary {
  const steps = (
    raw
      .prepare(
        `SELECT count(*) AS n FROM trace_spans WHERE run_id = ? AND kind = 'call' AND parent_id IS NULL`,
      )
      .get(run.id) as { n: number }
  ).n;
  const pages = (
    raw.prepare(`SELECT count(*) AS n FROM state_observations WHERE run_id = ?`).get(run.id) as {
      n: number;
    }
  ).n;
  const last = raw
    .prepare(
      `SELECT s.route_template FROM state_observations o JOIN states s ON s.id = o.state_id
       WHERE o.run_id = ? ORDER BY o.observed_at DESC LIMIT 1`,
    )
    .get(run.id) as { route_template: string } | undefined;
  return {
    id: run.id,
    status: WORDS[run.status] ?? run.status,
    steps,
    pages,
    at: last?.route_template ?? null,
    error: run.warning,
  };
}

/** The portal's newest runs, by their full ids (D-9): what the model may bind. */
function scansOf(raw: BetterSqlite3.Database, portal: string, limit = 5): ScanRow[] {
  return raw
    .prepare(
      `SELECT id, status, started_at, warning FROM runs WHERE portal_id = ?
       ORDER BY started_at DESC LIMIT ?`,
    )
    .all(portal, limit) as ScanRow[];
}

export interface TurnContextInput {
  conversationId: string;
  portal: string;
  phase: number;
  chips: Chip[];
}

/** The block put before the person's message for the assistant (never shown to the person). */
export function turnContext(raw: BetterSqlite3.Database, input: TurnContextInput): string {
  const wb = raw
    .prepare(`SELECT path, path_source FROM workbench_conversations WHERE conversation_id = ?`)
    .get(input.conversationId) as { path: string; path_source: string } | undefined;
  const view = raw
    .prepare(
      `SELECT spec_json FROM workbench_views WHERE conversation_id = ? AND fallback = 0
       ORDER BY turn DESC LIMIT 1`,
    )
    .get(input.conversationId) as { spec_json: string } | undefined;
  const scans = scansOf(raw, input.portal).map((r) => summaryOf(raw, r));
  const lines = [
    '<workbench_context>',
    `portal: ${input.portal} · as_of: now · phase: ${String(input.phase)} · paths: chat, mapping`,
    `path: ${wb?.path ?? 'chat'} · ${wb?.path_source === 'you' ? 'you' : 'assistant'}`,
    // A chip's route is portal text: escaped like <scan_data>.
    `chips: ${input.chips.length === 0 ? 'none' : escapeData(JSON.stringify(input.chips))}`,
    `current view: ${view?.spec_json ?? 'none'}`,
    'scans (newest first; bind these ids):',
    ...scans.map(
      (s) => `- ${s.id} · ${s.status} · ${String(s.steps)} steps · ${String(s.pages)} pages`,
    ),
    '</workbench_context>',
  ];
  const data = scans
    .filter((s) => s.at !== null || s.error !== null)
    .map((s) => `${s.id}: at ${s.at ?? '—'}${s.error === null ? '' : ` · stop: ${s.error}`}`)
    .join('\n');
  const portalText = escapeData(data).slice(0, SCAN_DATA_LIMIT);
  return portalText === ''
    ? lines.join('\n')
    : `${lines.join('\n')}\n<scan_data>\n${portalText}\n</scan_data>`;
}
