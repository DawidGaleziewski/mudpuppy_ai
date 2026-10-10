/**
 * All graders over one finished eval run (spec 014 US1): goal scores (docs and crawl coverage
 * against the ground truth), guardrails (leaks, widget actions) and run diagnostics.
 */
import type { GroundTruth } from '@pathfinder/docs';
import { dbPathFor, openDb } from '@pathfinder/store';
import { join } from 'node:path';
import type { EvalConfig } from '../config.js';
import { latestAnalysisSession } from '../queries.js';
import { scoreCrawl } from './code/crawl-coverage.js';
import { scoreDocs } from './code/docs-coverage.js';
import { sweepLeaks } from './code/leaks.js';
import { runChecks } from './code/run-checks.js';

export interface GradeInput {
  config: EvalConfig;
  /** The workspace the agents ran in. */
  ws: string;
  startedAt: string;
  groundTruth: GroundTruth;
  crawlRunId: string;
  /** The CLI session ids of both agents, to find their transcripts. */
  sessionIds: readonly string[];
}

export type Grades = Awaited<ReturnType<typeof grade>>;

export async function grade(m: GradeInput) {
  const { portal, persona, env } = m.config;
  const loggedIn = persona !== 'guest';
  const opened = openDb(dbPathFor(join(m.ws, 'data'), env));
  opened.raw.pragma('query_only = ON');
  const session = latestAnalysisSession(opened.raw, portal, m.startedAt);
  const docs = scoreDocs(opened.raw, portal, m.groundTruth);
  const crawl = scoreCrawl(opened.raw, m.crawlRunId, m.groundTruth, loggedIn);
  const run = runChecks(opened.raw, m.crawlRunId, loggedIn);
  await opened.close();
  console.log(
    `crawl: ${crawl.matched}/${crawl.total} ground-truth screens${crawl.missing.length ? `, missing ${crawl.missing.join(', ')}` : ''}; frontier pending ${run.frontier_pending}`,
  );
  const leaks = await sweepLeaks(m.ws, portal, env, m.sessionIds);
  return {
    session,
    scores: {
      ...docs.scores,
      crawl_screens: { matched: crawl.matched, total: crawl.total, pct: crawl.pct },
    },
    overclaims: docs.overclaims,
    checks: {
      frontier_empty_at_finish: run.frontier_empty_at_finish,
      crawler_completed: run.crawler_completed,
      crawler_steps: run.crawler_steps,
      frontier_pending: run.frontier_pending,
      ba_session_completed: session?.status === 'completed',
      handoffs: docs.handoffs,
      relogins: run.relogins,
      logged_in: run.logged_in,
      password_hits: leaks.total,
      widget_actions: run.widget_actions,
    },
  };
}
