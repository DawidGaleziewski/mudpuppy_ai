import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditPii } from '@mudpuppy/store';
import { buildFrontierReport, renderReport } from '@mudpuppy/crawler';
import { interruptStaleRuns } from '../src/index.js';
import { crawl, mapPortal, type Body } from './harness.js';
import { available, insurer, useInsurerMocks } from './insurer-harness.js';

useInsurerMocks();

describe.skipIf(!available)('insurer mock: spec 001 end-to-end checks (spec 002 FR-020)', () => {
  it('maps read-only with evidence, confidence, locators and a frontier report; no PII stored', async () => {
    const { mock, ctx, call, cleanup } = await insurer();
    try {
      const runId = await mapPortal(call, 'insurer', mock.origin + '/');
      const states = await ctx.db.selectFrom('states').selectAll().execute();
      const transitions = await ctx.db.selectFrom('transitions').selectAll().execute();
      expect(states.length).toBeGreaterThan(3);
      for (const r of [...states, ...transitions]) {
        expect(r.evidence_ref).toMatch(/^[0-9a-f]{64}\.yaml$/);
        expect(r.confidence).toBeTruthy();
      }
      expect(
        transitions.filter((e) => e.status === 'executed').every((e) => e.safety_class === 'read'),
      ).toBe(true);
      const files = readdirSync(join(ctx.dir, 'evidence'));
      for (const e of transitions) {
        const a = JSON.parse(e.action_json) as Body;
        expect(a.locators.length).toBeGreaterThan(0);
        expect(a.locators[0].kind).toBe('role');
        expect(files).toContain(a.snapshot_ref);
      }
      const report = renderReport(await buildFrontierReport(ctx.db, runId));
      expect(report).toContain('disallowed by robots.txt');
      expect(report).toContain('denylisted');
      const { findings } = await auditPii({ evidenceDir: join(ctx.dir, 'evidence'), db: ctx.db });
      expect(findings).toEqual([]);
    } finally {
      await cleanup();
    }
  }, 120_000);

  it('stops on a 403 with zero further requests and no way to resume', async () => {
    const { mock, ctx, call, cleanup } = await insurer();
    try {
      const runId = (await call('start_run', { portal_id: 'insurer', persona_id: 'guest' })).body
        .run_id as string;
      const home = await call('navigate', {
        run_id: runId,
        url: mock.origin + '/',
        rationale: 'exploring the target URL',
      });
      const blocked = await call('navigate', {
        run_id: runId,
        url: mock.origin + '/blocked',
        rationale: 'exploring the target URL',
      });
      expect(blocked.body.error.code).toBe('RUN_STOPPED');
      const run = await ctx.db.selectFrom('runs').selectAll().executeTakeFirstOrThrow();
      expect(run.status).toBe('stopped_warning');
      const count = mock.requests.length;
      expect(
        (
          await call('act', {
            run_id: runId,
            action_id: home.body.actions[0].action_id,
            rationale: 'exploring the next frontier item',
          })
        ).body.error.code,
      ).toBe('RUN_STOPPED');
      expect(
        (
          await call('start_run', {
            portal_id: 'insurer',
            persona_id: 'guest',
            resume_run_id: runId,
          })
        ).body.error.code,
      ).toBe('RUN_NOT_RESUMABLE');
      expect(mock.requests.length).toBe(count);
    } finally {
      await cleanup();
    }
  }, 60_000);

  it('resumes an interrupted run without duplicating states or transitions', async () => {
    const { mock, ctx, call, runtime, cleanup } = await insurer();
    try {
      const runId = (await call('start_run', { portal_id: 'insurer', persona_id: 'guest' })).body
        .run_id as string;
      await call('navigate', {
        run_id: runId,
        url: mock.origin + '/',
        rationale: 'exploring the target URL',
      });
      for (let i = 0; i < 3; i++) {
        const next = await call('get_next_frontier_item', { run_id: runId });
        await call('act', {
          run_id: runId,
          action_id: next.body.item.action_id,
          rationale: 'exploring the next frontier item',
        });
      }
      const transitionsBefore = (await ctx.db.selectFrom('transitions').select('id').execute())
        .length;
      await runtime.closeAll();
      expect(await interruptStaleRuns(ctx)).toEqual([runId]);
      const resumed = await call('start_run', {
        portal_id: 'insurer',
        persona_id: 'guest',
        resume_run_id: runId,
      });
      expect(resumed.body).toMatchObject({ run_id: runId, resumed: true });
      expect(mock.hits('/robots.txt').length).toBe(2); // fetched again on resume
      await crawl(call, runId, 300);
      expect(
        (await call('finish_run', { run_id: runId, rationale: 'frontier exhausted' })).body.status,
      ).toBe('completed');
      const transitions = await ctx.db.selectFrom('transitions').selectAll().execute();
      const keys = transitions.map((e) => `${e.from_state}|${e.action_json}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(transitions.length).toBeGreaterThan(transitionsBefore);
      const states = await ctx.db.selectFrom('states').selectAll().execute();
      expect(new Set(states.map((s) => s.fingerprint)).size).toBe(states.length);
    } finally {
      await cleanup();
    }
  }, 120_000);
});
