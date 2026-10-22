/**
 * A BA-only trial (spec 045, `--ba-replay <result.json>`): a copy of a kept trial's workspace with
 * everything the BA and the narrow step wrote taken out, so the BA documents the same crawl
 * evidence again. The kept workspace is only read.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { EvalResult } from '@mudpuppy/gates';
import { dbPathFor, migrateUp, openDb } from '@mudpuppy/store';
import { die } from '../failures.js';

/** What the BA sessions and the narrow step wrote, children first (foreign keys). */
const BA_TABLES = [
  'doc_reviews',
  'doc_relations',
  'doc_evidence_links',
  'doc_revisions',
  'followup_tasks',
  'doc_records',
  'analysis_session_runs',
  'analysis_sessions',
  // the trace groupings the harness made (group-traces.ts), made again for the replay
  'process_triggers',
  'process_explorations',
  'process_instances',
  'grouping_suggestions',
  'change_spec_revisions',
  'process_live',
  'process_drafts',
  'process_model_revisions',
  'process_models',
  'ba_process_revisions',
  'ba_processes',
  'process_scopes',
] as const;

/** What a replay keeps of the kept trial. */
export interface ReplaySource {
  startedAt: string;
  workspace: string;
  crawlRunId: string;
  crawlerSession: string;
  processTraces: { process_id: string; run: string; cli_session: string }[];
  formProbing: { run: string; cli_session: string } | null;
  outcomes: NonNullable<EvalResult['outcomes']>;
}

/** The kept trial: a full trial (crawler and BA) whose workspace still exists. */
export function replaySource(file: string): ReplaySource {
  if (!existsSync(file)) die(`--ba-replay: no result file ${file}`);
  const r = EvalResult.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (!r.workspace || !existsSync(r.workspace))
    die(`--ba-replay: the trial's workspace ${r.workspace ?? '(none)'} is gone`);
  if (!r.runs.crawler || !r.runs.crawler_cli_session || !r.outcomes)
    die('--ba-replay: the kept trial has no crawl run');
  return {
    startedAt: r.started_at,
    workspace: r.workspace,
    crawlRunId: r.runs.crawler,
    crawlerSession: r.runs.crawler_cli_session,
    processTraces: r.runs.process_traces ?? [],
    formProbing: r.runs.form_probing ?? null,
    outcomes: r.outcomes,
  };
}

/** A fresh copy of the kept workspace without its documentation. */
export function replayWorkspace(source: string, portal: string, env: string): string {
  const ws = mkdtempSync(join(tmpdir(), `pf-eval-${portal}-replay-`));
  for (const part of ['portals', 'personas', join('data', 'migrations'), join('data', 'evidence')])
    if (existsSync(join(source, part)))
      cpSync(join(source, part), join(ws, part), { recursive: true });
  const target = dbPathFor(join(ws, 'data'), env);
  mkdirSync(dirname(target), { recursive: true });
  const from = openDb(dbPathFor(join(source, 'data'), env));
  // A consistent copy even when the source still has a write-ahead log; the source is only read.
  from.raw.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  from.raw.close();
  const { raw } = openDb(target);
  // Migrated first, while its keys are whole: a newer migration refuses to run over the dangling
  // keys the cut below leaves (entity_refs to records, spec 045 F-03).
  migrateUp(raw, join(ws, 'data', 'migrations'));
  raw.pragma('foreign_keys = OFF');
  raw.transaction(() => {
    for (const t of BA_TABLES) raw.prepare(`DELETE FROM ${t}`).run();
  })();
  raw.close();
  return ws;
}
