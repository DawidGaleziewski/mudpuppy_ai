import { describe, expect, it, vi } from 'vitest';
import type { ObstacleEvent } from '@pathfinder/obstacles';
import type { SettleOutcome } from '@pathfinder/crawler';
import type { ServerContext } from '../src/context.js';
import { ToolError } from '../src/errors.js';
import type { RunState } from '../src/runtime/run-state.js';
import {
  decision,
  event,
  fail,
  obstacleReports,
  orFail,
  reported,
  ReportedFailure,
  step,
  type Report,
} from '../src/runtime/pipeline/context.js';
import { frontierReports } from '../src/runtime/pipeline/enqueue.js';
import { gateEvent } from '../src/runtime/pipeline/gate.js';
import { settleReports } from '../src/runtime/pipeline/settle.js';

/**
 * G-18: pipeline steps return their decisions and events; `step()` writes them inside the step's
 * span, in order, also when the step fails after reporting. Report builders are plain functions.
 */

/** A server context that records what gets written, and in which order, under which phase. */
function fakeCtx() {
  const written: { what: string; phase: string | null }[] = [];
  let current: string | null = null;
  const ctx = {
    tracer: {
      phase: async (name: string, fn: () => Promise<unknown>) => {
        const outer = current;
        current = name;
        try {
          return await fn();
        } finally {
          current = outer;
        }
      },
      event: vi.fn((name: string) => written.push({ what: `event ${name}`, phase: current })),
    },
    decisions: {
      record: vi.fn((d: { kind: string; run_id: string }) => {
        written.push({ what: `decision ${d.kind} ${d.run_id}`, phase: current });
        return Promise.resolve();
      }),
    },
  };
  return { ctx: ctx as unknown as ServerContext, written };
}

const at = (ctx: ServerContext) => ({ ctx, run: { id: 'run-1' } });
const note = decision({ kind: 'note', rule: 'r', reason: 'why' });

describe('step()', () => {
  it('writes the returned reports in order, inside the step span, with the run id', async () => {
    const { ctx, written } = fakeCtx();
    const value = await step(at(ctx), 'settle', () =>
      Promise.resolve(reported(42, [event('relogin', {}), note, event('obstacle', {})])),
    );
    expect(value).toBe(42);
    expect(written).toEqual([
      { what: 'event relogin', phase: 'settle' },
      { what: 'decision note run-1', phase: 'settle' },
      { what: 'event obstacle', phase: 'settle' },
    ]);
  });

  it('writes the reports of a ReportedFailure, then throws the original error', async () => {
    const { ctx, written } = fakeCtx();
    const err = new ToolError('ACTION_REFUSED', 'no');
    await expect(step(at(ctx), 'gate', () => fail([note], err))).rejects.toBe(err);
    expect(written).toEqual([{ what: 'decision note run-1', phase: 'gate' }]);
  });

  it('writes nothing for a plain error', async () => {
    const { ctx, written } = fakeCtx();
    const err = new Error('boom');
    await expect(step(at(ctx), 'gate', () => Promise.reject(err))).rejects.toBe(err);
    expect(written).toEqual([]);
  });

  it('writes nothing when a step reports nothing', async () => {
    const { ctx, written } = fakeCtx();
    await step(at(ctx), 'observe', () => Promise.resolve(reported('page')));
    expect(written).toEqual([]);
  });
});

describe('fail() and orFail()', () => {
  it('fail() keeps earlier reports in front of a nested failure’s own', () => {
    const inner = new ReportedFailure([event('locator', {})], new Error('x'));
    try {
      fail([note], inner);
    } catch (e) {
      expect(e).toBeInstanceOf(ReportedFailure);
      const f = e as ReportedFailure;
      expect(f.reports).toEqual([note, event('locator', {})]);
      expect(f.error).toBe(inner.error);
      return;
    }
    expect.unreachable();
  });

  it('orFail() passes a value through and wraps a rejection with the reports so far', async () => {
    await expect(orFail([note], Promise.resolve(7))).resolves.toBe(7);
    const err = new Error('stopped');
    const failed = await orFail([note], Promise.reject(err)).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(ReportedFailure);
    expect((failed as ReportedFailure).reports).toEqual([note]);
    expect((failed as ReportedFailure).error).toBe(err);
  });
});

describe('obstacleReports', () => {
  const events: ObstacleEvent[] = [
    { id: 'cookie_banner', selector: '#cookie button.accept', via: 'sweep', at: 1 },
    { id: 'chat_widget', selector: '.chat-close', via: 'handler', at: 2 },
  ];
  const state = (cursor: number) =>
    ({ session: { obstacles: { events } }, obstacleCursor: cursor }) as unknown as RunState;

  it('one obstacle event per dismissal since the cursor, in order, and advances the cursor', () => {
    const rs = state(0);
    expect(obstacleReports(rs)).toEqual([
      event('obstacle', {
        obstacle_id: 'cookie_banner',
        selector: '#cookie button.accept',
        via: 'sweep',
      }),
      event('obstacle', { obstacle_id: 'chat_widget', selector: '.chat-close', via: 'handler' }),
    ]);
    expect(rs.obstacleCursor).toBe(2);
    expect(obstacleReports(rs)).toEqual([]);
  });

  it('only the dismissals after the cursor', () => {
    expect(obstacleReports(state(1))).toHaveLength(1);
  });
});

describe('report builders', () => {
  const rs = { peekRouteTemplate: () => '/items/:id' } as unknown as RunState;

  it('gateEvent: an allowed navigate carries the shaped URL and no rule', () => {
    const d = { allowed: true, classification: { safetyClass: 'read' } };
    const r = gateEvent(rs, { kind: 'navigate', url: 'http://h/items/7' }, d as never);
    expect(r).toMatchObject({
      event: 'gate_decision',
      attrs: {
        input_kind: 'navigate',
        safety_class: 'read',
        allowed: true,
        rule: null,
        reason: null,
      },
    });
    expect(r).not.toHaveProperty('attrs.policy_id');
  });

  it('gateEvent: a refused action carries rule, reason and policy id', () => {
    const d = {
      allowed: false,
      rule: 'denylist',
      reason: 'listed',
      policyId: 'p1',
      classification: { safetyClass: 'write' },
    };
    const action = { role: 'button', accessible_name: 'Kup', json: { nth: 1 } };
    const r = gateEvent(rs, { kind: 'act', action: action as never }, d as never);
    expect(r).toEqual(
      event('gate_decision', {
        input_kind: 'act',
        action: { role: 'button', accessible_name: 'Kup', nth: 1 },
        safety_class: 'write',
        allowed: false,
        rule: 'denylist',
        reason: 'listed',
        policy_id: 'p1',
      }),
    );
  });

  it('settleReports: nothing when the page settled, a timeout event with rounded times otherwise', () => {
    expect(
      settleReports(rs, { result: 'stable', waitedMs: 10 } as unknown as SettleOutcome),
    ).toEqual([]);
    const outcome = {
      result: 'timeout',
      waitedMs: 3000.4,
      diagnostics: {
        inFlight: [{ url: 'http://h/items/7', resourceType: 'xhr', ageMs: 2999.6 }],
        sinceMutationMs: null,
        runningAnimations: 1,
      },
    } as unknown as SettleOutcome;
    const [r] = settleReports(rs, outcome) as [Extract<Report, { event: string }>];
    expect(r.event).toBe('stabilization_timeout');
    expect(r.attrs).toMatchObject({
      timeout_ms: 3000,
      in_flight: [{ resource_type: 'xhr', age_ms: 3000 }],
      since_mutation_ms: null,
      running_animations: 1,
    });
  });

  it('frontierReports: enqueue events first, then a skip event and a skip decision per skipped item', () => {
    const issued = [
      { actionId: 'a1', role: 'link', name: 'Home', nth: 0 },
      { actionId: 'a2', role: 'button', name: 'Kup', nth: 0 },
    ];
    const reports = frontierReports(
      {
        enqueued: [{ frontierId: 'f1', actionId: 'a1', safetyClass: 'read' }],
        skipped: [
          {
            frontierId: 'f2',
            actionId: 'a2',
            safetyClass: 'purchase',
            refusal: { status: 'skipped_unsafe', rule: 'class', reason: 'too high' },
          },
          {
            frontierId: 'f3',
            actionId: 'gone',
            safetyClass: 'read',
            refusal: { status: 'skipped_policy', rule: 'p', reason: 'r', policyId: 'pol' },
          },
        ],
      } as never,
      issued,
      { priority: 3, depth: 2 },
    );
    expect(reports.map((r) => ('event' in r ? r.event : `decision:${r.decision.kind}`))).toEqual([
      'frontier_enqueue',
      'frontier_skip',
      'decision:skip',
      'frontier_skip',
      'decision:skip',
    ]);
    expect(reports[0]).toEqual(
      event('frontier_enqueue', {
        frontier_id: 'f1',
        action: { role: 'link', accessible_name: 'Home', nth: 0 },
        safety_class: 'read',
        priority: 3,
        depth: 2,
      }),
    );
    // An action id the page no longer issued is described by its id.
    expect(reports[3]).toMatchObject({ attrs: { action: { action_id: 'gone' } } });
    expect(reports[4]).toEqual(
      decision({
        kind: 'skip',
        rule: 'p',
        reason: 'r',
        subject_ref: 'f3',
        detail: { status: 'skipped_policy', safety_class: 'read', policy_id: 'pol' },
      }),
    );
  });
});
