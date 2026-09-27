import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type OpenedDb } from '../src/db.js';
import { createEvidenceStore } from '../src/evidence.js';
import { migrateUp } from '../src/migrate.js';
import { createTracer, type Tracer, type TracerDeps } from '../src/trace/tracer.js';

const MIGRATIONS = fileURLToPath(new URL('../../../../../data/migrations', import.meta.url));
const RUN = 'run-1';
const BOOT = {
  environment: 'sandbox',
  server: 'pathfinder',
  version: '0.0.0-test',
  pwTrace: 'non_production',
} as const;

class FakeToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

let cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.reverse()) await c();
  cleanups = [];
});

/** Fixed clock, monotonic timer and ids: two setups with the same calls produce the same rows. */
function fixedDeps() {
  let t = Date.parse('2026-01-01T00:00:00.000Z');
  let m = 0;
  let i = 0;
  return {
    now: () => new Date((t += 1)),
    monotonic: () => (m += 5),
    newId: () => `00000000-0000-7000-8000-${String(++i).padStart(12, '0')}`,
  };
}

async function setup(overrides: Partial<TracerDeps> = {}, opts: { start?: boolean } = {}) {
  const opened: OpenedDb = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  const dir = mkdtempSync(join(tmpdir(), 'pf-tracer-'));
  cleanups.push(async () => {
    await opened.close();
    rmSync(dir, { recursive: true, force: true });
  });
  opened.raw
    .prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, seed_id, viewport,
       locale, browser, config_snapshot, status, warning, steps_used, elapsed_ms, max_depth_reached, started_at,
       ended_at, coverage) VALUES (?, 'shop', 'guest', 'map', 'sandbox', 'd', NULL, 'v', 'pl-PL', 'chromium', '{}',
       'running', NULL, 0, 0, 0, '2026-01-01T00:00:00.000Z', NULL, NULL)`,
    )
    .run(RUN);
  const tracer = createTracer({
    db: opened.db,
    logger: pino({ level: 'silent' }),
    evidence: createEvidenceStore(join(dir, 'evidence')),
    level: 'standard',
    flushIntervalMs: 60_000,
    ...fixedDeps(),
    ...overrides,
  });
  if (opts.start !== false) await tracer.start(BOOT);
  cleanups.push(() => tracer.shutdown());
  const spans = () =>
    opened.raw.prepare('SELECT * FROM trace_spans ORDER BY seq').all() as Record<string, unknown>[];
  return { opened, tracer, spans, dir };
}

const attrs = (row: Record<string, unknown>) =>
  JSON.parse(row.attrs_json as string) as Record<string, unknown>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 1));

describe('Tracer boot', () => {
  it('start writes one trace_boots row with the configuration', async () => {
    const { opened, tracer } = await setup();
    const boots = opened.raw.prepare('SELECT * FROM trace_boots').all() as Record<
      string,
      unknown
    >[];
    expect(boots).toHaveLength(1);
    expect(boots[0]).toMatchObject({
      id: tracer.bootId,
      environment: 'sandbox',
      server: 'pathfinder',
      pid: process.pid,
      version: '0.0.0-test',
      trace_level: 'standard',
      pw_trace: 'non_production',
      ended_at: null,
    });
  });

  it('shutdown sets ended_at', async () => {
    const { opened, tracer } = await setup();
    await tracer.shutdown();
    const boot = opened.raw.prepare('SELECT ended_at FROM trace_boots').get() as {
      ended_at: string | null;
    };
    expect(boot.ended_at).not.toBeNull();
  });
});

describe('Tracer.call', () => {
  it('inserts a running row at start and writes the final row and its children at the end', async () => {
    const { tracer, spans } = await setup();
    const result = await tracer.call(
      { tool: 'navigate', runId: RUN, args: { url: '/x' } },
      async () => {
        await tracer.phase('goto', async () => tick());
        const during = spans();
        expect(during).toHaveLength(1);
        expect(during[0]).toMatchObject({
          kind: 'call',
          name: 'navigate',
          status: 'running',
          run_id: RUN,
        });
        expect(during[0]!.duration_ms).toBeNull();
        return 42;
      },
    );
    expect(result).toBe(42);
    const rows = spans();
    expect(rows.map((r) => [r.kind, r.name, r.status])).toEqual([
      ['call', 'navigate', 'ok'],
      ['phase', 'goto', 'ok'],
    ]);
    expect(rows[0]!.duration_ms).toEqual(expect.any(Number));
    expect(rows[0]!.ended_at).not.toBeNull();
    expect(rows[1]!.parent_id).toBe(rows[0]!.id);
    expect(rows[1]!.run_id).toBe(RUN);
  });

  it('stores tool_use_id, agent_id, agent_type, requestId, args, output and the masked rationale', async () => {
    const { tracer, spans } = await setup();
    await tracer.call(
      {
        tool: 'act',
        runId: RUN,
        args: { run_id: RUN, action_id: 'a1' },
        meta: {
          'claudecode/toolUseId': 'toolu_01',
          'claudecode/agentId': 'agent-7',
          'claudecode/agentType': 'crawler',
        },
        requestId: 9,
        rationale: 'check the form, then write to test.user@example.test',
      },
      async (span) => {
        span.setOutput({ state_id: 's1' });
      },
    );
    const [row] = spans();
    expect(row).toMatchObject({ tool_use_id: 'toolu_01', agent_id: 'agent-7' });
    expect(row!.rationale).toBe('check the form, then write to [email]');
    expect(attrs(row!)).toMatchObject({
      request_id: 9,
      agent_type: 'crawler',
      args: { run_id: RUN, action_id: 'a1' },
      output: { state_id: 's1' },
    });
  });

  it.each([
    ['ACTION_REFUSED', 'refused'],
    ['RUN_STOPPED', 'stopped'],
    ['RUN_NOT_FOUND', 'error'],
  ])(
    'maps a thrown %s to status %s, emits one error event and rethrows the original',
    async (code, status) => {
      const { tracer, spans } = await setup();
      const err = new FakeToolError(code, 'nope for test.user@example.test');
      await expect(
        tracer.call({ tool: 'act', runId: RUN, args: {} }, async () => {
          await tracer.phase('gate', async () => {
            throw err;
          });
        }),
      ).rejects.toBe(err);
      const rows = spans();
      expect(rows[0]).toMatchObject({ kind: 'call', status });
      expect(rows.find((r) => r.kind === 'phase')).toMatchObject({ name: 'gate', status });
      const errors = rows.filter((r) => r.name === 'error');
      expect(errors).toHaveLength(1);
      expect(attrs(errors[0]!)).toMatchObject({ code, message: 'nope for [email]' });
      expect(attrs(errors[0]!).stack_top).toBeUndefined();
    },
  );

  it('records stack_top for a non-ToolError throw', async () => {
    const { tracer, spans } = await setup();
    await expect(
      tracer.call({ tool: 'navigate', runId: RUN, args: {} }, async () => {
        throw new TypeError('boom');
      }),
    ).rejects.toThrow('boom');
    const error = spans().find((r) => r.name === 'error')!;
    expect(attrs(error)).toMatchObject({ code: 'TypeError', message: 'boom' });
    expect(attrs(error).stack_top).toEqual(expect.any(String));
  });

  it('keeps an unknown run id out of the foreign key and notes it', async () => {
    const { tracer, spans } = await setup();
    await tracer.call({ tool: 'navigate', runId: 'no-such-run', args: {} }, async () => {});
    const [row] = spans();
    expect(row!.run_id).toBeNull();
    expect(attrs(row!).unknown_run_id).toBe('no-such-run');
  });

  it('setRunId attaches a run-less call and its children to the run once it exists', async () => {
    const { tracer, spans } = await setup();
    await tracer.call({ tool: 'start_run', runId: null, args: {} }, async (span) => {
      await tracer.phase('preflight', async () => {});
      span.setRunId(RUN);
      await tracer.phase('open_session', async () => {});
    });
    expect(spans().map((r) => r.run_id)).toEqual([RUN, RUN, RUN]);
  });

  it('leaves a call refused before any run run-less', async () => {
    const { tracer, spans } = await setup();
    await expect(
      tracer.call({ tool: 'start_run', runId: null, args: {} }, async () => {
        throw new FakeToolError('ENV_GUARD_REFUSED', 'production');
      }),
    ).rejects.toThrow();
    expect(spans().map((r) => [r.name, r.run_id])).toEqual([
      ['start_run', null],
      ['error', null],
    ]);
  });

  it('offloads a large output to evidence and counts it as truncated', async () => {
    const { tracer, spans } = await setup();
    await tracer.call({ tool: 'navigate', runId: RUN, args: {} }, async (span) => {
      span.setOutput({
        actions: Array.from({ length: 2000 }, (_, i) => ({ accessible_name: `link ${i}` })),
      });
    });
    const [row] = spans();
    expect(row!.payload_ref).toMatch(/^[0-9a-f]{64}\.json$/);
    expect(Buffer.byteLength(row!.attrs_json as string)).toBeLessThanOrEqual(8192);
    expect(tracer.health(RUN).truncated).toBeGreaterThan(0);
  });
});

describe('context propagation', () => {
  it('nests phases and events through AsyncLocalStorage across awaits', async () => {
    const { tracer, spans } = await setup();
    await tracer.call({ tool: 'navigate', runId: RUN, args: {} }, async () => {
      await tracer.phase('goto', async () => {
        await tick();
        tracer.event('request', { method: 'GET' });
        await tracer.phase('settle', async () => {
          await tick();
          tracer.event('stabilization_timeout', { timeout_ms: 10 });
        });
      });
      tracer.event('gate_decision', { allowed: true });
    });
    const rows = spans();
    const by = (name: string) => rows.find((r) => r.name === name)!;
    expect(by('goto').parent_id).toBe(by('navigate').id);
    expect(by('request').parent_id).toBe(by('goto').id);
    expect(by('settle').parent_id).toBe(by('goto').id);
    expect(by('stabilization_timeout').parent_id).toBe(by('settle').id);
    expect(by('gate_decision').parent_id).toBe(by('navigate').id);
    for (const e of rows.filter((r) => r.kind === 'event')) {
      expect(e.duration_ms).toBeNull();
      expect(e.ended_at).toBeNull();
      expect(e.status).toBe('ok');
    }
  });

  it('keeps two interleaved calls apart', async () => {
    const { tracer, spans } = await setup();
    const a = deferred();
    const b = deferred();
    const pa = tracer.call({ tool: 'get_known_states', runId: RUN, args: {} }, async () => {
      await a.promise;
      tracer.event('frontier_pick', { pending: 1 });
    });
    const pb = tracer.call({ tool: 'get_next_frontier_item', runId: RUN, args: {} }, async () => {
      await b.promise;
      tracer.event('frontier_pick', { pending: 2 });
    });
    await tick();
    b.resolve();
    a.resolve();
    await Promise.all([pa, pb]);
    const rows = spans();
    const call = (name: string) => rows.find((r) => r.name === name)!;
    const picks = rows.filter((r) => r.name === 'frontier_pick');
    expect(picks.find((p) => attrs(p).pending === 1)!.parent_id).toBe(call('get_known_states').id);
    expect(picks.find((p) => attrs(p).pending === 2)!.parent_id).toBe(
      call('get_next_frontier_item').id,
    );
  });

  it('runs a phase outside any call untraced', async () => {
    const { tracer, spans } = await setup();
    await expect(tracer.phase('goto', async () => 1)).resolves.toBe(1);
    expect(spans()).toEqual([]);
  });
});

describe('eventForRun', () => {
  it("attaches to the run's open browser call, else writes a between-calls event", async () => {
    const { tracer, spans } = await setup();
    const gate = deferred();
    const p = tracer.call({ tool: 'navigate', runId: RUN, args: {} }, async () => gate.promise);
    await tick();
    tracer.eventForRun(RUN, 'robots_check', { rule: 'Disallow: /admin/', action: 'blocked' });
    gate.resolve();
    await p;
    tracer.eventForRun(RUN, 'request', { method: 'GET' });
    await tracer.flush();
    const rows = spans();
    const nav = rows.find((r) => r.name === 'navigate')!;
    expect(rows.find((r) => r.name === 'robots_check')).toMatchObject({
      parent_id: nav.id,
      between_calls: 0,
    });
    expect(rows.find((r) => r.name === 'request')).toMatchObject({
      parent_id: null,
      between_calls: 1,
      run_id: RUN,
    });
  });

  it('does not attach to a non-browser call', async () => {
    const { tracer, spans } = await setup();
    const gate = deferred();
    const p = tracer.call(
      { tool: 'get_known_states', runId: RUN, args: {} },
      async () => gate.promise,
    );
    await tick();
    tracer.eventForRun(RUN, 'request', { method: 'GET' });
    gate.resolve();
    await p;
    await tracer.flush();
    expect(spans().find((r) => r.name === 'request')).toMatchObject({
      parent_id: null,
      between_calls: 1,
    });
  });

  it('flags two overlapping browser calls of one run on both, and on events attached meanwhile', async () => {
    const { tracer, spans } = await setup();
    const a = deferred();
    const b = deferred();
    const pa = tracer.call({ tool: 'navigate', runId: RUN, args: { n: 1 } }, async () => a.promise);
    await tick();
    const pb = tracer.call({ tool: 'act', runId: RUN, args: { n: 2 } }, async () => b.promise);
    await tick();
    tracer.eventForRun(RUN, 'request', { method: 'GET' });
    a.resolve();
    b.resolve();
    await Promise.all([pa, pb]);
    const rows = spans();
    const nav = rows.find((r) => r.name === 'navigate')!;
    const act = rows.find((r) => r.name === 'act')!;
    const concurrent = rows.filter((r) => r.name === 'concurrent_calls');
    expect(concurrent).toHaveLength(2);
    expect(
      concurrent.find((r) => r.parent_id === nav.id) &&
        attrs(concurrent.find((r) => r.parent_id === nav.id)!),
    ).toMatchObject({
      overlapping_calls: [act.id],
      run_id: RUN,
    });
    expect(attrs(concurrent.find((r) => r.parent_id === act.id)!)).toMatchObject({
      overlapping_calls: [nav.id],
    });
    const req = rows.find((r) => r.name === 'request')!;
    expect(req.parent_id).toBe(act.id);
    expect(attrs(req).overlapping_calls).toEqual([nav.id]);
  });
});

describe('ordering, sweeping and failure', () => {
  it('assigns strictly increasing seq per boot', async () => {
    const { tracer, spans } = await setup();
    for (let i = 0; i < 3; i++)
      await tracer.call({ tool: 'navigate', runId: RUN, args: {} }, async () => {
        await tracer.phase('goto', async () => tracer.event('request', {}));
      });
    const seqs = spans().map((r) => r.seq as number);
    expect(seqs).toEqual([...seqs].sort((x, y) => x - y));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it("sweepUnfinished marks earlier boots' running spans unfinished, not its own", async () => {
    const { opened, tracer, spans } = await setup();
    const gate = deferred();
    const p = tracer.call({ tool: 'navigate', runId: RUN, args: {} }, async () => gate.promise);
    await tick();
    // a second process on the same store
    const next = createTracer({
      db: opened.db,
      logger: pino({ level: 'silent' }),
      evidence: createEvidenceStore(join(tmpdir(), 'pf-unused')),
      level: 'standard',
      newId: (() => {
        let i = 0;
        return () => `ffffffff-0000-7000-8000-${String(++i).padStart(12, '0')}`;
      })(),
    });
    await next.start(BOOT);
    expect(await next.sweepUnfinished()).toBe(1);
    expect(spans()[0]).toMatchObject({ status: 'unfinished', ended_at: null, duration_ms: null });
    await next.call({ tool: 'get_known_states', runId: RUN, args: {} }, async () => {});
    expect(await next.sweepUnfinished()).toBe(0);
    gate.resolve();
    await p;
    await next.shutdown();
  });

  it('never throws when the trace table breaks, and counts what it dropped', async () => {
    const { opened, tracer } = await setup();
    await tracer.call({ tool: 'navigate', runId: RUN, args: {} }, async () => {});
    opened.raw.exec('DROP TABLE trace_spans');
    const out = await tracer.call({ tool: 'navigate', runId: RUN, args: {} }, async () => {
      await tracer.phase('goto', async () => tracer.event('request', {}));
      return 'still works';
    });
    expect(out).toBe('still works');
    tracer.eventForRun(RUN, 'request', {});
    await expect(tracer.flush()).resolves.toBeUndefined();
    expect(tracer.health(RUN).dropped).toBeGreaterThan(0);
  });

  it('writes a trace_health event on the next call after something was dropped or truncated', async () => {
    const { tracer, spans } = await setup();
    await tracer.call({ tool: 'navigate', runId: RUN, args: {} }, async (span) => {
      span.setOutput({ big: 'x'.repeat(20_000) });
    });
    const health = spans().filter((r) => r.name === 'trace_health');
    expect(health).toHaveLength(1);
    expect(attrs(health[0]!)).toMatchObject({ dropped: 0, truncated: 1 });
    await tracer.call({ tool: 'navigate', runId: RUN, args: {} }, async () => {});
    expect(spans().filter((r) => r.name === 'trace_health')).toHaveLength(1);
  });
});

describe('levels, scrubbing and determinism', () => {
  it('level off writes only call spans', async () => {
    const { tracer, spans } = await setup({ level: 'off' });
    await tracer.call({ tool: 'navigate', runId: RUN, args: {} }, async () => {
      await tracer.phase('goto', async () => tracer.event('request', {}));
    });
    await expect(
      tracer.call({ tool: 'act', runId: RUN, args: {} }, async () => {
        throw new FakeToolError('ACTION_REFUSED', 'no');
      }),
    ).rejects.toThrow();
    tracer.eventForRun(RUN, 'request', {});
    await tracer.flush();
    expect(spans().map((r) => [r.kind, r.name, r.status])).toEqual([
      ['call', 'navigate', 'ok'],
      ['call', 'act', 'refused'],
    ]);
  });

  it('scrubs attrs and masks summaries while keeping server-issued ids', async () => {
    const { tracer, spans } = await setup();
    const id = '01a0da20-3022-7000-9ef1-6ac7ce1a0035';
    await tracer.call(
      { tool: 'navigate', runId: RUN, args: { state_id: id, note: 'mail test.user@example.test' } },
      async (span) => {
        span.setSummary('went to test.user@example.test');
        tracer.event(
          'decision',
          { decision_id: id, reason: 'call +48 601 234 567' },
          { summary: 'Witaj, Jan Kowalski' },
        );
      },
    );
    const rows = spans();
    expect(attrs(rows[0]!).args).toEqual({ state_id: id, note: 'mail [email]' });
    expect(rows[0]!.summary).toBe('went to [email]');
    const ev = rows.find((r) => r.name === 'decision')!;
    expect(attrs(ev)).toMatchObject({ decision_id: id });
    expect(ev.attrs_json).not.toContain('601 234');
    expect(ev.summary).not.toContain('Kowalski');
  });

  it('two identical sequences with injected clock and ids produce identical rows', async () => {
    const script = async (tracer: Tracer) => {
      await tracer.call(
        { tool: 'start_run', runId: null, args: { portal: 'shop' } },
        async (span) => {
          await tracer.phase('preflight', async () => {});
          span.setRunId(RUN);
        },
      );
      await tracer.call({ tool: 'navigate', runId: RUN, args: { url: '/' } }, async (span) => {
        await tracer.phase('goto', async () => tracer.event('request', { method: 'GET' }));
        span.setOutput({ ok: true });
      });
      await expect(
        tracer.call({ tool: 'act', runId: RUN, args: {} }, async () => {
          throw new FakeToolError('ACTION_REFUSED', 'denylisted');
        }),
      ).rejects.toThrow();
    };
    const one = await setup();
    await script(one.tracer);
    const two = await setup();
    await script(two.tracer);
    expect(two.spans()).toEqual(one.spans());
    expect(one.spans().length).toBeGreaterThan(4);
  });
});
