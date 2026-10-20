/**
 * The form-probing scan of a map task (spec 034 phase 9): after the map, the form steps the map
 * recorded on the task's `probeForms` routes are marked for probing, as the owner marks them in
 * the dashboard, and one crawler session probes them (crawler.md "Probe forms"), so the export's
 * Validation section has messages to show.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { newId, nowIso } from '@pathfinder/core';
import { dbPathFor, openDb } from '@pathfinder/store';
import type { EvalConfig } from '../config.js';
import { abort } from '../failures.js';
import { PROMPTS } from '../prompts.js';
import { runAgent, type CliOut } from './agent.js';
import { findCrawlRun } from './crawl-run.js';
import type { ScoredOutcome } from './outcome.js';

export interface FormProbingRun {
  runId: string;
  /** The CLI session, for the password sweep. */
  session: string;
  outcome: ScoredOutcome;
  out: CliOut;
}

/** Marks every recorded form step on the routes; returns how many it marked. */
async function markForProbing(c: EvalConfig, ws: string, routes: readonly string[]) {
  const opened = openDb(dbPathFor(join(ws, 'data'), c.env));
  try {
    const steps = opened.raw
      .prepare(
        `SELECT id FROM form_steps WHERE portal_id = ? AND route_template IN (${routes.map(() => '?').join(',')})`,
      )
      .all(c.portal, ...routes) as { id: string }[];
    const insert = opened.raw.prepare(
      `INSERT INTO marks (id, portal_id, kind, target_kind, target_id, created_by, created_at)
       VALUES (?, ?, 'probe', 'form_step', ?, 'eval', ?)`,
    );
    for (const s of steps) insert.run(newId(), c.portal, s.id, nowIso());
    return steps.length;
  } finally {
    await opened.close();
  }
}

/** Null when the task names no forms or the map recorded none of them. */
export async function runFormProbing(
  c: EvalConfig,
  ws: string,
  routes: readonly string[],
): Promise<FormProbingRun | null> {
  if (routes.length === 0) return null;
  const marked = await markForProbing(c, ws, routes);
  if (marked === 0) {
    console.log(`form probing: the map recorded no form step on ${routes.join(', ')}; skipped`);
    return null;
  }
  const since = nowIso();
  const session = randomUUID();
  const agent = runAgent(c, ws, 'crawler', PROMPTS.crawlerProbe(c.portal, c.persona), session);
  const runId =
    (await findCrawlRun(c, ws, since)) ??
    abort(`the crawler made no run for the form-probing scan (session ${session})`);
  console.log(`form probing: ${marked} form step(s) marked, run ${runId}, ${agent.outcome}`);
  return { runId, session, outcome: agent.outcome, out: agent.out };
}
