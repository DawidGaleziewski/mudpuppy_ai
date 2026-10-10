/**
 * All graders over one finished eval trial (spec 014 US1): goal scores (docs and crawl coverage
 * against the ground truth; the process steps for a trace task), guardrails (leaks, widget
 * actions) and run diagnostics. A crawler-only trial has no BA, so no documentation graders.
 */
import type { GroundTruth } from '@pathfinder/docs';
import { dbPathFor, openDb } from '@pathfinder/store';
import { join } from 'node:path';
import type { EvalConfig } from '../config.js';
import { latestAnalysisSession, type RawDb } from '../queries.js';
import type { EvalTask } from '../tasks.js';
import { scoreCrawl } from './code/crawl-coverage.js';
import { scoreDocs } from './code/docs-coverage.js';
import { sweepLeaks } from './code/leaks.js';
import { scoreTrace } from './code/process-trace.js';
import { runChecks } from './code/run-checks.js';

export interface GradeInput {
  config: EvalConfig;
  task: EvalTask;
  /** The workspace the agents ran in. */
  ws: string;
  startedAt: string;
  groundTruth: GroundTruth;
  crawlRunId: string;
  /** The CLI session ids of the agents that ran, to find their transcripts. */
  sessionIds: readonly string[];
}

export type Grades = Awaited<ReturnType<typeof grade>>;

/** Documentation graders, or none when the BA did not run. */
function gradeDocs(db: RawDb, m: GradeInput) {
  if (m.config.crawlerOnly) return { session: undefined, docs: null };
  return {
    session: latestAnalysisSession(db, m.config.portal, m.startedAt),
    docs: scoreDocs(db, m.config.portal, m.groundTruth),
  };
}

export async function grade(m: GradeInput) {
  const { portal, persona, env } = m.config;
  const loggedIn = persona !== 'guest';
  const opened = openDb(dbPathFor(join(m.ws, 'data'), env));
  opened.raw.pragma('query_only = ON');
  const { session, docs } = gradeDocs(opened.raw, m);
  const crawl = scoreCrawl(opened.raw, m.crawlRunId, m.groundTruth, loggedIn);
  const trace = m.task.trace
    ? scoreTrace(opened.raw, m.crawlRunId, m.groundTruth, m.task.trace.processId)
    : null;
  const run = runChecks(opened.raw, m.crawlRunId, loggedIn);
  await opened.close();
  console.log(
    `crawl: ${crawl.matched}/${crawl.total} ground-truth screens${crawl.missing.length ? `, missing ${crawl.missing.join(', ')}` : ''}; frontier pending ${run.frontier_pending}`,
  );
  if (trace)
    console.log(
      `trace: ${trace.steps.matched}/${trace.steps.total} process steps in order${trace.steps.missing.length ? `, missing ${trace.steps.missing.join(', ')}` : ''}; goal reached: ${trace.goalReached ? 'yes' : 'no'}`,
    );
  const leaks = await sweepLeaks(m.ws, portal, env, m.sessionIds);
  return {
    session,
    scores: {
      ...docs?.scores,
      crawl_screens: { matched: crawl.matched, total: crawl.total, pct: crawl.pct },
      ...(trace && {
        trace_steps: {
          matched: trace.steps.matched,
          total: trace.steps.total,
          pct: trace.steps.pct,
        },
      }),
    },
    // No BA, no claims: 0 is exact, not a default.
    overclaims: docs?.overclaims ?? 0,
    checks: {
      frontier_empty_at_finish: run.frontier_empty_at_finish,
      crawler_completed: run.crawler_completed,
      crawler_steps: run.crawler_steps,
      frontier_pending: run.frontier_pending,
      ...(docs && {
        ba_session_completed: session?.status === 'completed',
        handoffs: docs.handoffs,
      }),
      ...(trace && { trace_goal_reached: trace.goalReached }),
      relogins: run.relogins,
      logged_in: run.logged_in,
      password_hits: leaks.total,
      widget_actions: run.widget_actions,
    },
  };
}
