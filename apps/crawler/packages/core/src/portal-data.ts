import { copyFileSync, existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from './ids.js';

/**
 * Export and delete everything one portal gathered (spec 002 FR-028, data-model.md "Partition
 * map"). Operator scripts only: the crawler agent has no tool for either.
 */

/** Tables that hold a portal's gathered data. `schema_migrations` and `portal_data_log` never do. */
export const PORTAL_TABLES = [
  'runs',
  'states',
  'state_observations',
  'actions',
  'edges',
  'forms',
  'network_calls',
  'frontier',
  'open_questions',
  'rule_candidates',
  'decision_log',
  'robots_policies',
  'trace_spans',
  'agent_turns',
  'analysis_sessions',
  'analysis_session_runs',
  'doc_records',
  'doc_revisions',
  'doc_evidence_links',
  'doc_relations',
  'doc_reviews',
  'followup_tasks',
  'processes',
  'process_steps',
] as const;
export type PortalTable = (typeof PORTAL_TABLES)[number];

/**
 * Children before parents, so every foreign key still holds at each step. `process_steps` then
 * `processes` (`0005_trace_processes`) go first of all: steps reference actions, edges and states,
 * and processes reference runs, actions and doc_records. Layer B
 * (`0004_ba_documentation`, data-model.md "Portal data partition") goes first: reviews, relations and
 * evidence links are children of doc_revisions; followup_tasks and doc_revisions are children of
 * doc_records; doc_revisions is also a child of analysis_sessions, so it must precede
 * analysis_sessions too. doc_evidence_links and followup_tasks reference runs (nullable), so both must
 * be dropped before `runs`, which they are. `trace_spans` and `agent_turns` come before
 * `decision_log` (spans reference it) and `runs`; `trace_spans`' self-reference (`parent_id`) is
 * cleared first (see `deletePortal`), so its own position in this list only has to precede
 * `decision_log` and `runs`.
 */
const DELETE_ORDER: readonly PortalTable[] = [
  'process_steps',
  'processes',
  'doc_reviews',
  'doc_relations',
  'doc_evidence_links',
  'followup_tasks',
  'doc_revisions',
  'doc_records',
  'analysis_session_runs',
  'analysis_sessions',
  'trace_spans',
  'agent_turns',
  'decision_log',
  'network_calls',
  'frontier',
  'actions',
  'edges',
  'forms',
  'open_questions',
  'rule_candidates',
  'robots_policies',
  'state_observations',
  'states',
  'runs',
];

/** An evidence reference (`<sha256>.<ext>`), in a `*_ref` column or inside JSON (`snapshot_ref`). */
const EVIDENCE_REF = /\b[0-9a-f]{64}\.[a-z0-9]{1,8}\b/g;

export class PortalDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalDataError';
  }
}

type Raw = BetterSqlite3.Database;
type Row = Record<string, unknown>;
export type RowCounts = Record<PortalTable, number>;

const DOC_RECORDS_OF_PORTAL = (op: string) => `SELECT id FROM doc_records WHERE portal_id ${op} ?`;
const DOC_REVISIONS_OF_PORTAL = (op: string) =>
  `SELECT id FROM doc_revisions WHERE record_id IN (${DOC_RECORDS_OF_PORTAL(op)})`;

/** `mine`: rows of the portal; `others`: rows of every other portal. */
export function where(table: PortalTable, side: 'mine' | 'others'): string {
  const op = side === 'mine' ? '=' : '<>';
  switch (table) {
    case 'runs':
    case 'states':
    case 'analysis_sessions':
    case 'doc_records':
    case 'processes':
      return `portal_id ${op} ?`;
    case 'analysis_session_runs':
      return `session_id IN (SELECT id FROM analysis_sessions WHERE portal_id ${op} ?)`;
    case 'doc_revisions':
      return `record_id IN (${DOC_RECORDS_OF_PORTAL(op)})`;
    case 'doc_evidence_links':
    case 'doc_reviews':
      return `revision_id IN (${DOC_REVISIONS_OF_PORTAL(op)})`;
    case 'doc_relations':
      return `from_revision_id IN (${DOC_REVISIONS_OF_PORTAL(op)})`;
    case 'followup_tasks':
      return `record_id IN (${DOC_RECORDS_OF_PORTAL(op)})`;
    case 'process_steps':
      return `process_id IN (SELECT id FROM processes WHERE portal_id ${op} ?)`;
    default:
      return `run_id IN (SELECT id FROM runs WHERE portal_id ${op} ?)`;
  }
}

function rowsOf(raw: Raw, table: PortalTable, portal: string, side: 'mine' | 'others'): Row[] {
  return raw
    .prepare(`SELECT * FROM ${table} WHERE ${where(table, side)} ORDER BY 1, 2`)
    .all(portal) as Row[];
}

function refsIn(rows: readonly Row[], into: Set<string>): Set<string> {
  for (const row of rows)
    for (const v of Object.values(row))
      if (typeof v === 'string') for (const m of v.matchAll(EVIDENCE_REF)) into.add(m[0]);
  return into;
}

function countRows(raw: Raw, portal: string): RowCounts {
  const counts = {} as RowCounts;
  for (const t of PORTAL_TABLES) {
    const r = raw
      .prepare(`SELECT count(*) AS n FROM ${t} WHERE ${where(t, 'mine')}`)
      .get(portal) as {
      n: number;
    };
    counts[t] = r.n;
  }
  return counts;
}

function log(
  raw: Raw,
  entry: {
    portal: string;
    environment: string;
    action: 'export' | 'delete';
    operator: string;
    counts: unknown;
    target: string | null;
  },
): void {
  raw
    .prepare(
      `INSERT INTO portal_data_log (id, portal_id, environment, action, operator, counts_json, target, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      entry.portal,
      entry.environment,
      entry.action,
      entry.operator,
      JSON.stringify(entry.counts),
      entry.target,
      nowIso(),
    );
}

export interface ExportOptions {
  raw: Raw;
  evidenceDir: string;
  portal: string;
  environment: string;
  outDir: string;
  operator: string;
}

/**
 * Write `manifest.json`, one `<table>.ndjson` per partition table and an `evidence/` copy of every
 * file the portal's rows reference. Read-only on the gathered data; logs one `export` row.
 */
export function exportPortal(opts: ExportOptions): {
  outDir: string;
  counts: RowCounts;
  evidenceFiles: number;
} {
  const { raw, portal } = opts;
  const counts = countRows(raw, portal);
  if (counts.runs === 0)
    throw new PortalDataError(`portal "${portal}" has no runs in the ${opts.environment} database`);

  mkdirSync(join(opts.outDir, 'evidence'), { recursive: true });
  const refs = new Set<string>();
  for (const t of PORTAL_TABLES) {
    const rows = rowsOf(raw, t, portal, 'mine');
    refsIn(rows, refs);
    writeFileSync(
      join(opts.outDir, `${t}.ndjson`),
      rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''),
    );
  }
  let evidenceFiles = 0;
  for (const ref of [...refs].sort()) {
    const src = join(opts.evidenceDir, ref);
    if (!existsSync(src)) continue;
    copyFileSync(src, join(opts.outDir, 'evidence', ref));
    evidenceFiles += 1;
  }
  const version = raw
    .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .get() as { version: string } | undefined;
  writeFileSync(
    join(opts.outDir, 'manifest.json'),
    JSON.stringify(
      {
        portal_id: portal,
        environment: opts.environment,
        exported_at: nowIso(),
        counts,
        evidence_files: evidenceFiles,
        schema_version: version?.version ?? null,
      },
      null,
      2,
    ) + '\n',
  );
  log(raw, {
    portal,
    environment: opts.environment,
    action: 'export',
    operator: opts.operator,
    counts: { rows: counts, evidence_files: evidenceFiles },
    target: opts.outDir,
  });
  return { outDir: opts.outDir, counts, evidenceFiles };
}

export interface DeletePlan {
  counts: RowCounts;
  /** Evidence files only this portal's rows reference. */
  evidenceToRemove: string[];
  /** Evidence files this portal references that another portal references too. */
  evidenceKept: string[];
  /** Ids of this portal's runs still marked `running`. */
  running: string[];
}

/** What a delete would remove; changes nothing (the dry run of `portal:delete`). */
export function planPortalDelete(opts: {
  raw: Raw;
  evidenceDir: string;
  portal: string;
}): DeletePlan {
  const { raw, portal } = opts;
  const mine = new Set<string>();
  const others = new Set<string>();
  for (const t of PORTAL_TABLES) {
    refsIn(rowsOf(raw, t, portal, 'mine'), mine);
    refsIn(rowsOf(raw, t, portal, 'others'), others);
  }
  const running = (
    raw.prepare("SELECT id FROM runs WHERE portal_id = ? AND status = 'running'").all(portal) as {
      id: string;
    }[]
  ).map((r) => r.id);
  const onDisk = (r: string) => existsSync(join(opts.evidenceDir, r));
  return {
    counts: countRows(raw, portal),
    evidenceToRemove: [...mine].filter((r) => !others.has(r) && onDisk(r)).sort(),
    evidenceKept: [...mine].filter((r) => others.has(r)).sort(),
    running,
  };
}

/**
 * Delete every row of the portal in one transaction (children first), log it, then remove the
 * evidence files no other portal references. Refused while a run of the portal is running.
 */
export function deletePortal(opts: {
  raw: Raw;
  evidenceDir: string;
  /** `data/traces` (portal-scoped Playwright trace zips); its `<portal>/` subdir is removed too. */
  tracesDir?: string;
  portal: string;
  environment: string;
  operator: string;
}): DeletePlan {
  const { raw, portal } = opts;
  const plan = raw.transaction(() => {
    const p = planPortalDelete(opts);
    if (p.running.length > 0)
      throw new PortalDataError(
        `portal "${portal}" has a running run (${p.running.join(', ')}); finish or interrupt it first`,
      );
    // Clear trace_spans' self-reference first so children never outlive the parent row they
    // point at within this single-statement-per-table delete pass.
    raw
      .prepare(`UPDATE trace_spans SET parent_id = NULL WHERE ${where('trace_spans', 'mine')}`)
      .run(portal);
    for (const t of DELETE_ORDER)
      raw.prepare(`DELETE FROM ${t} WHERE ${where(t, 'mine')}`).run(portal);
    log(raw, {
      portal,
      environment: opts.environment,
      action: 'delete',
      operator: opts.operator,
      counts: {
        rows: p.counts,
        evidence_removed: p.evidenceToRemove.length,
        evidence_kept: p.evidenceKept.length,
      },
      target: null,
    });
    return p;
  })();
  for (const ref of plan.evidenceToRemove) {
    try {
      unlinkSync(join(opts.evidenceDir, ref));
    } catch {
      rmSync(join(opts.evidenceDir, ref), { force: true });
    }
  }
  if (opts.tracesDir) rmSync(join(opts.tracesDir, portal), { recursive: true, force: true });
  return plan;
}
