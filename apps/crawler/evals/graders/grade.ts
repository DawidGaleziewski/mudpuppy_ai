/**
 * All graders over one finished eval trial (spec 014 US1): goal scores (docs and crawl coverage
 * against the ground truth; the process steps for a trace task), guardrails (leaks, widget
 * actions) and run diagnostics. A crawler-only trial has no BA, so no documentation graders.
 */
import type { GroundTruth } from '@pathfinder/docs';
import { dbPathFor, openDb } from '@pathfinder/store';
import { join } from 'node:path';
import type { EvalConfig } from '../config.js';
import { analysisSessions, type RawDb } from '../queries.js';
import type { EvalTask } from '../tasks.js';
import { scoreCrawl } from './code/crawl-coverage.js';
import { scoreDocs } from './code/docs-coverage.js';
import { scoreBaShapes } from './code/ba-shapes.js';
import { scoreBaWrites } from './code/ba-writes.js';
import { scoreExport, type ExportScores } from './code/export-completeness.js';
import { exportedProcesses, scoreExportQuality } from './code/export-quality.js';
import { sweepLeaks, transcriptPath } from './code/leaks.js';
import { scoreTrace, sumTraces } from './code/process-trace.js';
import { scoreVariants } from './code/process-variants.js';
import { runChecks } from './code/run-checks.js';

export interface GradeInput {
  config: EvalConfig;
  task: EvalTask;
  /** The workspace the agents ran in. */
  ws: string;
  startedAt: string;
  groundTruth: GroundTruth;
  crawlRunId: string;
  /** The process traces run after the map (spec 025 FR-006); empty when none ran. */
  processTraces: readonly { processId: string; runId: string }[];
  /** The CLI session ids of the agents that ran, to find their transcripts. */
  sessionIds: readonly string[];
}

export type Grades = Awaited<ReturnType<typeof grade>>;

/** The BA's refused writes over the trial's transcripts, printed by error code (spec 019 US4). */
function baWrites(sessionIds: readonly string[]) {
  const transcripts = sessionIds.map(transcriptPath).filter((t): t is string => t !== null);
  const w = scoreBaWrites(transcripts);
  const codes = Object.entries(w.by_code).map(([c, n]) => `${c} ${n}`);
  console.log(
    `BA writes: ${w.refused} of ${w.calls} refused (${w.refused_pct} %)${codes.length ? `: ${codes.join(', ')}` : ''}`,
  );
  return w;
}

/**
 * Documentation graders, or none when the BA did not run. The BA's first session is the map one,
 * a second one the traces one (spec 025 F-12); the docs are scored over both sessions' records.
 */
function gradeDocs(db: RawDb, m: GradeInput) {
  if (m.config.crawlerOnly) return { sessions: [], docs: null };
  return {
    sessions: analysisSessions(db, m.config.portal, m.startedAt),
    docs: scoreDocs(db, m.config.portal, m.groundTruth),
  };
}

/** Checks of the BA's sessions: completion, hand-offs, refused writes, record-shape mistakes. */
function baChecks(
  sessions: readonly { status: string }[],
  handoffs: number,
  writes: ReturnType<typeof scoreBaWrites> | null,
  shapes: ReturnType<typeof scoreBaShapes> | null,
) {
  return {
    ba_session_completed: sessions.length > 0 && sessions.every((s) => s.status === 'completed'),
    handoffs,
    // spec 019 US4: reported and compared, not yet a gate (a first measurement)
    ...(writes && {
      ba_write_calls: writes.calls,
      ba_write_refused: writes.refused,
      ba_write_refused_pct: writes.refused_pct,
      // spec 019 F-12/F-14: should stay 0 now that the BA's intents have relation types
      ba_relation_refused: writes.by_code.RELATION_NOT_ALLOWED ?? 0,
    }),
    // spec 019 F-09/F-13/F-14: the record-shape mistakes the trials caught
    ...(shapes ?? {}),
  };
}

/**
 * A map task's process traces together (spec 025 FR-006): the score and check to add, both empty
 * when none ran.
 */
function gradeProcessTraces(db: RawDb, m: GradeInput) {
  if (m.processTraces.length === 0) return { scores: {}, checks: {} };
  const sum = sumTraces(
    m.processTraces.map((t) => scoreTrace(db, t.runId, m.groundTruth, t.processId)),
  );
  console.log(
    `process traces: ${sum.steps.matched}/${sum.steps.total} steps in order; goal reached in ${sum.goalReached} of ${m.processTraces.length}`,
  );
  return {
    scores: { process_trace_steps: sum.steps },
    checks: { process_traces_goal_reached: sum.goalReached },
  };
}

function logExport(exported: ExportScores | null): void {
  if (!exported) return;
  console.log(
    `export: steps pictured ${exported.export_steps_pictured.pct} %, distinct ${exported.export_steps_distinct.pct} %, records once ${exported.export_records_once.pct} %, EARS ${exported.export_ears.pct} %, fields documented ${exported.export_fields_documented.pct} %`,
  );
}

/**
 * Owner review 2026-10-17: a step's variants documented as one step (a goal score against the
 * ground truth); no score when the BA did not run or the ground truth lists no variant.
 */
function gradeVariants(db: RawDb, m: GradeInput) {
  if (m.config.crawlerOnly) return {};
  const v = scoreVariants(db, m.config.portal, m.groundTruth, { environment: m.config.env });
  if (v.process_variants.total === 0) return {};
  console.log(
    `variants: ${v.process_variants.matched}/${v.process_variants.total} reconciled as one step${v.missing.length ? `, missing ${v.missing.join('; ')}` : ''}`,
  );
  return { process_variants: v.process_variants };
}

/**
 * Spec 034 phase 9: the export scored against the ground truth's export facts (goal scores, with
 * checks that must stay 0); nothing when the BA did not run or the ground truth lists none.
 */
function gradeExportQuality(db: RawDb, m: GradeInput, evidenceRoot: string) {
  if (m.config.crawlerOnly) return { scores: {}, checks: {} };
  const exports = exportedProcesses(db, m.config.portal, {
    environment: m.config.env,
    evidenceRoot,
  });
  const q = scoreExportQuality(m.groundTruth, exports);
  if (!q) return { scores: {}, checks: {} };
  const s = q.scores;
  console.log(
    `export quality: steps ${s.export_steps.pct} %, fields ${s.export_fields.pct} %, validation ${s.export_validation.pct} %, actions ${s.export_actions.pct} %, calls ${s.export_apis.pct} %; extra steps ${q.checks.export_extra_steps}, stray destinations ${q.checks.export_action_strays}, noise leaked ${q.checks.export_noise_leaked}, wrong start ${q.checks.export_wrong_start}, wrong end ${q.checks.export_wrong_end}${q.missing.length ? `\n  missing: ${q.missing.join('; ')}` : ''}`,
  );
  return { scores: q.scores, checks: q.checks };
}

export async function grade(m: GradeInput) {
  const { portal, persona, env } = m.config;
  const loggedIn = persona !== 'guest';
  const opened = openDb(dbPathFor(join(m.ws, 'data'), env));
  opened.raw.pragma('query_only = ON');
  const { sessions, docs } = gradeDocs(opened.raw, m);
  const crawl = scoreCrawl(opened.raw, m.crawlRunId, m.groundTruth, loggedIn);
  const trace = m.task.trace
    ? scoreTrace(opened.raw, m.crawlRunId, m.groundTruth, m.task.trace.processId)
    : null;
  const processTraces = gradeProcessTraces(opened.raw, m);
  const run = runChecks(opened.raw, m.crawlRunId, loggedIn);
  const shapes = docs ? scoreBaShapes(opened.raw, portal, m.groundTruth) : null;
  const exported = docs
    ? scoreExport(opened.raw, portal, {
        environment: env,
        evidenceRoot: join(m.ws, 'data', 'evidence'),
      })
    : null;
  const variants = gradeVariants(opened.raw, m);
  const quality = gradeExportQuality(opened.raw, m, join(m.ws, 'data', 'evidence'));
  await opened.close();
  logExport(exported);
  console.log(
    `crawl: ${crawl.matched}/${crawl.total} ground-truth screens${crawl.missing.length ? `, missing ${crawl.missing.join(', ')}` : ''}; frontier pending ${run.frontier_pending}`,
  );
  if (trace)
    console.log(
      `trace: ${trace.steps.matched}/${trace.steps.total} process steps in order${trace.steps.missing.length ? `, missing ${trace.steps.missing.join(', ')}` : ''}; goal reached: ${trace.goalReached ? 'yes' : 'no'}`,
    );
  const leaks = await sweepLeaks(m.ws, portal, env, m.sessionIds);
  const writes = docs ? baWrites(m.sessionIds) : null;
  return {
    session: sessions[0],
    tracesSession: sessions[1],
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
      ...processTraces.scores,
      // spec 034 R-68: how usable the documentation is as a rebuild-grade export (diagnostics)
      ...exported,
      ...variants,
      ...quality.scores,
    },
    // No BA, no claims: 0 is exact, not a default.
    overclaims: docs?.overclaims ?? 0,
    checks: {
      frontier_empty_at_finish: run.frontier_empty_at_finish,
      crawler_completed: run.crawler_completed,
      crawler_steps: run.crawler_steps,
      frontier_pending: run.frontier_pending,
      ...(docs && baChecks(sessions, docs.handoffs, writes, shapes)),
      ...(trace && { trace_goal_reached: trace.goalReached }),
      ...processTraces.checks,
      ...quality.checks,
      relogins: run.relogins,
      logged_in: run.logged_in,
      password_hits: leaks.total,
      widget_actions: run.widget_actions,
    },
  };
}
