/**
 * The process traces of a map task (spec 025 FR-006): after the map, one crawler session in trace
 * mode per ground-truth process the task lists, so the BA has trace evidence for its processes.
 */
import { randomUUID } from 'node:crypto';
import type { EvalConfig } from '../config.js';
import { abort } from '../failures.js';
import { PROMPTS } from '../prompts.js';
import type { TraceSpec } from '../tasks.js';
import { runAgent, type CliOut } from './agent.js';
import { findCrawlRun } from './crawl-run.js';
import type { ScoredOutcome } from './outcome.js';

export interface ProcessTraceRun {
  processId: string;
  /** The process's name, as the trace was asked for it (the name it is grouped under). */
  name: string;
  runId: string;
  /** The CLI session, for the password sweep. */
  session: string;
  outcome: ScoredOutcome;
  out: CliOut;
}

/** Run the traces one after another; a session that made no run ends the trial. */
export async function runProcessTraces(
  c: EvalConfig,
  ws: string,
  traces: readonly TraceSpec[],
): Promise<ProcessTraceRun[]> {
  const done: ProcessTraceRun[] = [];
  for (const t of traces) {
    const since = new Date().toISOString();
    const session = randomUUID();
    const prompt = PROMPTS.crawlerTrace(c.portal, c.persona, t.name, t.goal);
    const agent = runAgent(c, ws, 'crawler', prompt, session);
    const runId =
      (await findCrawlRun(c, ws, since)) ??
      abort(`the crawler made no run for process trace ${t.processId} (session ${session})`);
    console.log(`process trace ${t.processId}: run ${runId}, ${agent.outcome}`);
    done.push({
      processId: t.processId,
      name: t.name,
      runId,
      session,
      outcome: agent.outcome,
      out: agent.out,
    });
  }
  return done;
}
