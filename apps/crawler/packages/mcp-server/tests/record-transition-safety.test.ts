import { describe, expect, it } from 'vitest';
import { ToolError, recordState, recordTransition } from '../src/index.js';
import { FP, REF, makeCtx, seedRun } from './helpers.js';

async function setup(environment = 'production') {
  const ctx = await makeCtx();
  const run = await seedRun(ctx, { environment });
  const a = await recordState(ctx, {
    run_id: run,
    fingerprint: FP('a'),
    cluster_id: 'c',
    route_template: '/a',
    title: 'A',
    evidence_ref: REF,
    confidence: 'observed',
  });
  const b = await recordState(ctx, {
    run_id: run,
    fingerprint: FP('b'),
    cluster_id: 'c2',
    route_template: '/b',
    title: 'B',
    evidence_ref: REF,
    confidence: 'observed',
  });
  const base = (over: Record<string, unknown> = {}) => ({
    run_id: run,
    from_state: a.state_id,
    to_state: b.state_id,
    action: {
      role: 'link',
      accessible_name: 'Moda',
      href: '/oferty/moda',
      locators: [{ kind: 'role', value: 'link[name="Moda"]', rank: 0 }],
    },
    safety_class: 'read',
    status: 'executed',
    evidence_ref: REF,
    confidence: 'observed',
    ...over,
  });
  return { ctx, run, a, b, base };
}
const bid = {
  role: 'button',
  accessible_name: 'Licytuj',
  locators: [{ kind: 'role', value: 'button[name="Licytuj"]', rank: 0 }],
};

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as ToolError).code;
  }
  return 'none';
}

describe('record_transition safety', () => {
  it('records an executed read transition', async () => {
    const { ctx, base } = await setup();
    const r = await recordTransition(ctx, base());
    expect(r.edge_id).toBeTruthy();
    expect(
      (await ctx.db.selectFrom('edges').selectAll().executeTakeFirstOrThrow()).safety_class,
    ).toBe('read');
  });

  it('rejects UNSAFE_ACTION_EXECUTED for an executed non-read action on a production run', async () => {
    const { ctx, base } = await setup('production');
    expect(
      await code(
        recordTransition(ctx, base({ action: bid, safety_class: 'external-side-effect' })),
      ),
    ).toBe('UNSAFE_ACTION_EXECUTED');
    expect(await ctx.db.selectFrom('edges').selectAll().execute()).toHaveLength(0);
  });

  it('rejects a supplied class that differs from the re-derived one (agent claims read for a bid button)', async () => {
    const { ctx, base } = await setup('production');
    expect(
      await code(
        recordTransition(ctx, base({ action: bid, safety_class: 'read', status: 'skipped' })),
      ),
    ).toBe('SAFETY_CLASS_MISMATCH');
    expect(await code(recordTransition(ctx, base({ action: bid, safety_class: 'read' })))).toBe(
      'SAFETY_CLASS_MISMATCH',
    );
  });

  it('accepts skipped transitions of any class when the class is the derived one', async () => {
    const { ctx, base } = await setup('production');
    const cases = [
      { action: bid, safety_class: 'external-side-effect' },
      {
        action: { role: 'button', accessible_name: 'Usuń ofertę', locators: bid.locators },
        safety_class: 'destructive',
      },
      {
        action: { role: 'button', accessible_name: 'Dodaj do ulubionych', locators: bid.locators },
        safety_class: 'mutating',
      },
    ];
    for (const c of cases)
      await recordTransition(ctx, base({ ...c, status: 'skipped', to_state: null }));
    expect(await ctx.db.selectFrom('edges').selectAll().execute()).toHaveLength(3);
  });

  it('allows an executed non-read action off production only when the derived class matches', async () => {
    const { ctx, base } = await setup('sandbox');
    await recordTransition(ctx, base({ action: bid, safety_class: 'external-side-effect' }));
    expect(await ctx.db.selectFrom('edges').selectAll().execute()).toHaveLength(1);
  });

  it('requires evidence, confidence and at least one ranked locator', async () => {
    const { ctx, base } = await setup();
    expect(await code(recordTransition(ctx, base({ evidence_ref: '' })))).toBe('MISSING_EVIDENCE');
    expect(await code(recordTransition(ctx, base({ confidence: 'x' })))).toBe('INVALID_CONFIDENCE');
    expect(
      await code(
        recordTransition(
          ctx,
          base({ action: { role: 'link', accessible_name: 'Moda', href: '/x', locators: [] } }),
        ),
      ),
    ).toBe('SCHEMA_INVALID');
  });

  it('rejects unknown states and a client-chosen id', async () => {
    const { ctx, base } = await setup();
    expect(await code(recordTransition(ctx, base({ from_state: 'ghost' })))).toBe('UNKNOWN_REF');
    expect(await code(recordTransition(ctx, base({ id: 'mine' })))).toBe('SCHEMA_INVALID');
  });
});
