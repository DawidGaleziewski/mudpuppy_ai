import { copyFileSync, existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@pathfinder/core';

/**
 * Export and delete everything one portal gathered (spec 002 FR-028, data-model.md "Partition
 * map"). Operator scripts only: the crawler agent has no tool for either.
 */

/** Tables that hold a portal's gathered data. `schema_migrations` and `portal_data_log` never do. */
export const PORTAL_TABLES = [
  'runs',
  'states',
  'state_wireframes',
  'state_observations',
  'actions',
  'transitions',
  'forms',
  'network_calls',
  'observations',
  'frontier',
  'open_questions',
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
  'chat_conversations',
  'chat_messages',
  'workflow_steps',
  'process_scopes',
  'amendments',
  'amendment_revisions',
  'chat_proposals',
  'screens',
  'grouping_suggestions',
  'ba_processes',
  'ba_process_revisions',
  'process_models',
  'process_model_revisions',
  'process_drafts',
  'process_live',
  'change_spec_revisions',
  'form_steps',
  'probe_outcomes',
  'probe_suites',
  'marks',
  'checkpoints',
  'builds',
  'state_components',
  'journeys',
  'attribute_writes',
  'observation_builds',
  'model_versions',
  'model_screens',
  'screen_members',
  'screen_lineage',
  'state_pair_labels',
  'parameter_roles',
  'action_classes',
  'model_transitions',
  'build_epochs',
  'entity_refs',
  'deviations',
  'deviation_occurrences',
  'hypotheses',
  'hypothesis_evidence',
  'hypothesis_tests',
  'hypothesis_events',
  'fingerprint_profiles',
  'tau_acceptances',
  'correlation_ids',
  'process_instances',
  'process_triggers',
  'process_explorations',
  'similarity_classifiers',
] as const;
export type PortalTable = (typeof PORTAL_TABLES)[number];

/**
 * Children before parents, so every foreign key still holds at each step. `process_steps` then
 * `processes` (`0005_trace_processes`) go first of all: steps reference actions, transitions and states,
 * and processes reference runs, actions and doc_records. The chat tables (`0008_chat_orchestrator`)
 * go before even those: amendments reference process_scopes and runs; process_scopes reference
 * states; workflow_steps reference runs and analysis_sessions; all but amendments reference
 * chat_conversations, and chat_messages are its children. `amendment_revisions` (`0016`) precede
 * amendments, and `screens` (`0015`) follow states (states and amendments reference them) and precede
 * runs (`first_seen_run`). The BA process tables (`0018`) go first of all: change specs, live records, drafts,
 * variant revisions and variants, process revisions, `ba_processes`, then `grouping_suggestions`; the cycle
 * between `ba_processes.suggestion_id` and `grouping_suggestions.process_id` is cut by clearing the latter first
 * (see `deletePortal`). amendments' self-references
 * (`reapplied_as`, `reapplies`) are within one portal and go in one DELETE statement. Layer B
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
  // 0036 (spec 039): processes' instances, triggers and explorations reference the model, journeys
  // and ba_processes; instances reference correlation ids
  'process_explorations',
  'process_triggers',
  'process_instances',
  'correlation_ids',
  // 0038 (spec 039): no references
  'similarity_classifiers',
  // 0033 (spec 039): no references
  'tau_acceptances',
  'fingerprint_profiles',
  // 0031 (spec 039): interpretation references the model; marks' and open questions' hypothesis
  // links are cleared first (see `deletePortal`)
  'hypothesis_events',
  'hypothesis_tests',
  'hypothesis_evidence',
  'entity_refs',
  'hypotheses',
  'deviation_occurrences',
  'deviations',
  // 0030 (spec 039): the portal model references transitions, observations, builds, states and itself
  'model_transitions',
  'action_classes',
  'screen_lineage',
  'screen_members',
  'build_epochs',
  'model_screens',
  'model_versions',
  'parameter_roles',
  'state_pair_labels',
  'checkpoints', // 0027: references runs and states (no portal_id: the default run_id partition)
  'marks', // 0024: references runs (used_by_run_id)
  'probe_suites', // 0023: reference runs and form_steps
  'probe_outcomes', // 0023: reference runs, states, form_steps and transitions
  // 0036: PROC records reference ba_processes, so Layer B (and the trace processes that reference
  // it) go before the BA process tables
  'process_steps',
  'processes',
  'doc_reviews',
  'doc_relations',
  'doc_evidence_links',
  'followup_tasks',
  'doc_revisions',
  'doc_records',
  'change_spec_revisions', // 0018: the BA process tables, children first
  'process_live',
  'process_drafts',
  'process_model_revisions',
  'process_models',
  'ba_process_revisions',
  'ba_processes',
  'grouping_suggestions',
  'chat_proposals', // 0017: references chat_conversations and amendments
  'amendment_revisions',
  'amendments',
  'process_scopes',
  'workflow_steps',
  'chat_messages',
  'chat_conversations',
  'analysis_session_runs',
  'analysis_sessions',
  'trace_spans',
  'agent_turns',
  'decision_log',
  'network_calls',
  'observation_builds', // 0029: references observations and builds
  'builds',
  'observations', // 0029: transitions.from_observation_id is cleared first (cycle with observations.transition_id)
  'frontier',
  'actions',
  'transitions',
  'attribute_writes', // 0029: references journeys
  'journeys', // 0029: transitions and observations reference journeys; journeys reference runs, checkpoints
  'forms',
  'open_questions',
  'robots_policies',
  'state_observations',
  'state_wireframes',
  'state_components', // 0029: references states
  'states',
  'form_steps', // 0022: states reference form_steps, form_steps reference runs
  'screens',
  'runs',
];

/** An evidence reference (`<sha256>.<ext>`), in a `*_ref` column or inside JSON (`snapshot_ref`). */
const EVIDENCE_REF = /\b[0-9a-f]{64}\.[a-z0-9]{1,10}\b/g;

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

const BA_PROCESSES_OF_PORTAL = (op: string) =>
  `SELECT id FROM ba_processes WHERE portal_id ${op} ?`;

/**
 * A typed reference belongs to the portal of its one target (0031). Each target kind is matched
 * on its own, so the refs go whatever order their referrers are deleted in. The portal is bound
 * once (`?`) and read through `x.p`, like every other clause here.
 */
const ENTITY_REFS_OF_PORTAL = (op: string): string => {
  const runs = `SELECT id FROM runs WHERE portal_id ${op} x.p`;
  const targets = [
    `screen_id IN (SELECT id FROM model_screens WHERE portal_id ${op} x.p)`,
    `state_id IN (SELECT id FROM states WHERE portal_id ${op} x.p)`,
    `observation_id IN (SELECT id FROM observations WHERE run_id IN (${runs}))`,
    `transition_id IN (SELECT id FROM transitions WHERE run_id IN (${runs}))`,
    `network_call_id IN (SELECT id FROM network_calls WHERE run_id IN (${runs}))`,
    `action_class_id IN (SELECT a.id FROM action_classes a JOIN model_screens s ON s.id = a.screen_id WHERE s.portal_id ${op} x.p)`,
    `model_transition_id IN (SELECT t.id FROM model_transitions t JOIN model_screens s ON s.id = t.from_screen_id WHERE s.portal_id ${op} x.p)`,
    `hypothesis_id IN (SELECT id FROM hypotheses WHERE portal_id ${op} x.p)`,
    `process_id IN (SELECT id FROM ba_processes WHERE portal_id ${op} x.p)`,
  ];
  return `EXISTS (SELECT 1 FROM (SELECT ? AS p) x WHERE ${targets.join(' OR ')})`;
};

/** `mine`: rows of the portal; `others`: rows of every other portal. */
export function where(table: PortalTable, side: 'mine' | 'others'): string {
  const op = side === 'mine' ? '=' : '<>';
  switch (table) {
    case 'runs':
    case 'states':
    case 'analysis_sessions':
    case 'doc_records':
    case 'processes':
    case 'chat_conversations':
    case 'workflow_steps':
    case 'process_scopes':
    case 'amendments':
    case 'chat_proposals':
    case 'screens':
    case 'ba_processes':
    case 'grouping_suggestions':
    case 'form_steps':
    case 'probe_suites':
    case 'marks':
    case 'builds':
    case 'model_versions':
    case 'model_screens':
    case 'state_pair_labels':
    case 'parameter_roles':
    case 'build_epochs':
    case 'deviations':
    case 'hypotheses':
    case 'fingerprint_profiles':
    case 'tau_acceptances':
    case 'similarity_classifiers':
      return `portal_id ${op} ?`;
    case 'deviation_occurrences':
      return `deviation_id IN (SELECT id FROM deviations WHERE portal_id ${op} ?)`;
    case 'hypothesis_evidence':
    case 'hypothesis_tests':
    case 'hypothesis_events':
      return `hypothesis_id IN (SELECT id FROM hypotheses WHERE portal_id ${op} ?)`;
    case 'entity_refs':
      return ENTITY_REFS_OF_PORTAL(op);
    case 'screen_members':
    case 'action_classes':
      return `screen_id IN (SELECT id FROM model_screens WHERE portal_id ${op} ?)`;
    case 'model_transitions':
      return `from_screen_id IN (SELECT id FROM model_screens WHERE portal_id ${op} ?)`;
    case 'screen_lineage':
      return `model_version_id IN (SELECT id FROM model_versions WHERE portal_id ${op} ?)`;
    case 'state_components':
      return `state_id IN (SELECT id FROM states WHERE portal_id ${op} ?)`;
    case 'attribute_writes':
      return `journey_id IN (SELECT id FROM journeys WHERE run_id IN (SELECT id FROM runs WHERE portal_id ${op} ?))`;
    case 'observation_builds':
      return `observation_id IN (SELECT id FROM observations WHERE run_id IN (SELECT id FROM runs WHERE portal_id ${op} ?))`;
    case 'chat_messages':
      return `conversation_id IN (SELECT id FROM chat_conversations WHERE portal_id ${op} ?)`;
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
    case 'amendment_revisions':
      return `amendment_id IN (SELECT id FROM amendments WHERE portal_id ${op} ?)`;
    case 'correlation_ids':
      return `journey_id IN (SELECT id FROM journeys WHERE run_id IN (SELECT id FROM runs WHERE portal_id ${op} ?))`;
    case 'ba_process_revisions':
    case 'process_models':
    case 'process_instances':
    case 'process_triggers':
    case 'process_explorations':
    case 'process_live':
    case 'change_spec_revisions':
      return `process_id IN (${BA_PROCESSES_OF_PORTAL(op)})`;
    case 'process_model_revisions':
    case 'process_drafts':
      return `variant_id IN (SELECT id FROM process_models WHERE process_id IN (${BA_PROCESSES_OF_PORTAL(op)}))`;
    case 'process_steps':
      return `process_id IN (SELECT id FROM processes WHERE portal_id ${op} ?)`;
    case 'state_wireframes':
      return `state_id IN (SELECT id FROM states WHERE portal_id ${op} ?)`;
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
    // 0031: marks and open questions may name a hypothesis; hypotheses supersede each other.
    raw
      .prepare(`UPDATE marks SET hypothesis_id = NULL WHERE ${where('marks', 'mine')}`)
      .run(portal);
    raw
      .prepare(
        `UPDATE open_questions SET hypothesis_id = NULL WHERE ${where('open_questions', 'mine')}`,
      )
      .run(portal);
    raw
      .prepare(`UPDATE hypotheses SET superseded_by = NULL WHERE ${where('hypotheses', 'mine')}`)
      .run(portal);
    // 0029: a transition names the observation it started from and an observation the transition
    // that led to it.
    raw
      .prepare(
        `UPDATE transitions SET from_observation_id = NULL WHERE ${where('transitions', 'mine')}`,
      )
      .run(portal);
    raw
      .prepare(
        `UPDATE grouping_suggestions SET process_id = NULL WHERE ${where('grouping_suggestions', 'mine')}`,
      )
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
