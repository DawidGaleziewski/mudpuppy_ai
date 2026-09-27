import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger, PwTraceMode, Tracer } from '@pathfinder/core';
import type { BrowserSession } from '@pathfinder/crawler';

type BrowserContext = BrowserSession['context'];

/** Playwright traces hold unscrubbed page content: only off production, or when the boot flag says so (research §13). */
export function pwTraceEnabled(environment: string, bootFlag: PwTraceMode): boolean {
  return environment !== 'production' || bootFlag === 'all';
}

type Tracing = BrowserContext['tracing'];
const scope = new AsyncLocalStorage<Tracing>();

/** Run a phase inside `tracing.group(name)` when the current call records a Playwright trace. */
export async function inPwGroup<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const tracing = scope.getStore();
  if (!tracing) return fn();
  await tracing.group(name).catch(() => {});
  try {
    return await fn();
  } finally {
    await tracing.groupEnd().catch(() => {});
  }
}

export interface PwTrace {
  /** Record the current browser call as one chunk, `data/traces/<portal>/<run>/<seq>-<tool>.zip`. */
  chunk<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Start Playwright tracing for a run's context. Returns null when tracing is off or could not start.
 * Failures are logged and counted in trace health; they never fail the crawl.
 */
export async function startPwTrace(opts: {
  context: BrowserContext;
  tracer: Tracer;
  logger: Logger;
  dataDir: string;
  portal: string;
  runId: string;
}): Promise<PwTrace | null> {
  const { context, tracer, logger, runId } = opts;
  const fail = (err: unknown, what: string): void => {
    tracer.countFailure(runId);
    logger.warn(
      { err: (err as Error)?.message, run_id: runId },
      `playwright trace: ${what} failed`,
    );
  };
  try {
    await context.tracing.start({ screenshots: true, snapshots: true });
  } catch (err) {
    fail(err, 'start');
    return null;
  }
  const relDir = join('traces', opts.portal, runId);
  return {
    async chunk(fn) {
      const call = tracer.currentCall();
      if (!call) return fn();
      let started = false;
      try {
        await tracer.phase('pw_trace', () =>
          context.tracing.startChunk({ title: `${call.name} ${call.id}` }),
        );
        started = true;
      } catch (err) {
        fail(err, 'startChunk');
      }
      if (!started) return fn();
      try {
        return await scope.run(context.tracing, fn);
      } finally {
        const rel = join(relDir, `${call.seq}-${call.name}.zip`);
        try {
          mkdirSync(join(opts.dataDir, relDir), { recursive: true });
          await tracer.phase('pw_trace', () =>
            context.tracing.stopChunk({ path: join(opts.dataDir, rel) }),
          );
          call.setPwTracePath(rel);
        } catch (err) {
          fail(err, 'stopChunk');
        }
      }
    },
  };
}
