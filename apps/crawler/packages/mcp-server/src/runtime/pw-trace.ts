import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { redactZip, SECRETS, type Logger } from '@pathfinder/core';
import type { Tracer } from '@pathfinder/store';
import type { BrowserSession } from '@pathfinder/crawler';

type BrowserContext = BrowserSession['context'];

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
  /**
   * Run `fn` with nothing captured (typing vault credentials, spec 009 FR-019a): the open chunk is
   * saved up to here as `<seq>-<tool>.before-login.zip`, and a new chunk starts after `fn`.
   */
  untraced<T>(fn: () => Promise<T>): Promise<T>;
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
  /** The call whose chunk is recording now; null between calls and while untraced. */
  let open: { seq: number; name: string; id: string } | null = null;
  /** Set when a chunk could not be closed before typing credentials: tracing is stopped for good. */
  let dead = false;
  const save = async (file: string): Promise<string> => {
    const rel = join(relDir, file);
    const path = join(opts.dataDir, rel);
    mkdirSync(join(opts.dataDir, relDir), { recursive: true });
    await tracer.phase('pw_trace', () => context.tracing.stopChunk({ path }));
    // FR-019/FR-019a: a trace keeps the document's request (a login POST body) and typed input
    // values; registered secrets are replaced in every entry before the chunk stays on disk.
    if (SECRETS.size > 0) {
      try {
        const clean = redactZip(readFileSync(path), SECRETS.redact);
        if (clean) writeFileSync(path, clean);
      } catch (err) {
        rmSync(path, { force: true });
        throw err;
      }
    }
    return rel;
  };
  return {
    async chunk(fn) {
      const call = tracer.currentCall();
      if (!call || dead) return fn();
      try {
        await tracer.phase('pw_trace', () =>
          context.tracing.startChunk({ title: `${call.name} ${call.id}` }),
        );
        open = { seq: call.seq, name: call.name, id: call.id };
      } catch (err) {
        fail(err, 'startChunk');
      }
      if (!open) return fn();
      try {
        return await scope.run(context.tracing, fn);
      } finally {
        // Closed already when an untraced part could not restart the chunk.
        if (open) {
          open = null;
          try {
            call.setPwTracePath(await save(`${call.seq}-${call.name}.zip`));
          } catch (err) {
            fail(err, 'stopChunk');
          }
        }
      }
    },
    async untraced(fn) {
      const cur = open;
      if (!cur) return scope.exit(fn);
      open = null;
      try {
        await save(`${cur.seq}-${cur.name}.before-login.zip`);
      } catch (err) {
        // The chunk may still be recording: stop tracing for the rest of the run rather than
        // capture typed credentials.
        fail(err, 'stopChunk before login');
        dead = true;
        await context.tracing.stop().catch(() => undefined);
        return scope.exit(fn);
      }
      try {
        return await scope.exit(fn);
      } finally {
        try {
          await tracer.phase('pw_trace', () =>
            context.tracing.startChunk({ title: `${cur.name} ${cur.id} (after login)` }),
          );
          open = cur;
        } catch (err) {
          fail(err, 'startChunk after login');
        }
      }
    },
  };
}
