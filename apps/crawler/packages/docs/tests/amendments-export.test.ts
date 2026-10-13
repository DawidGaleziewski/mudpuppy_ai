import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportSrs } from '../src/export.js';
import { makeFixtureStore, seedDocRecords, type FixtureStore } from '../src/testing/index.js';

/** R-30 T034 (spec 010 FR-018, FR-023, SC-007, SC-008). */
let fx: FixtureStore;
let before: Map<string, string>;
let after: Map<string, string>;
const T = '2026-10-06T00:00:00.000Z';

function amend(
  id: string,
  key: string,
  status: string,
  extra: Record<string, string | null> = {},
): void {
  const row: Record<string, string | null> = {
    id,
    key,
    portal_id: fx.portalId,
    target_kind: 'state',
    target_id: fx.states.car,
    kind: 'note',
    text: `note ${key}`,
    author: 'BA',
    created_at: T,
    status,
    superseded_at: null,
    superseded_reason: null,
    superseded_detail: null,
    superseded_by_run: null,
    dismissed_at: null,
    withdrawn_at: null,
    reapplies: null,
    ...extra,
  };
  const cols = Object.keys(row);
  fx.raw
    .prepare(
      `INSERT INTO amendments (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`,
    )
    .run(row);
}

beforeAll(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
  seedDocRecords(fx);
  before = exportSrs(fx.raw, fx.portalId, { environment: 'sandbox' }) as Map<string, string>;
  amend('a1', 'AMD-001', 'needs_reanchor', {
    superseded_at: T,
    superseded_reason: 'element_changed',
    superseded_detail: 'button "Kup" is now button "Kup teraz"',
    superseded_by_run: fx.runId,
  });
  amend('a2', 'AMD-002', 'active', { text: 'Button should be green', reapplies: 'a1' });
  fx.raw.prepare(`UPDATE amendments SET reapplied_as = 'a2' WHERE id = 'a1'`).run();
  amend('a3', 'AMD-003', 'dismissed', { dismissed_at: T });
  amend('a4', 'AMD-004', 'withdrawn', { withdrawn_at: T });
  after = exportSrs(fx.raw, fx.portalId, { environment: 'sandbox' }) as Map<string, string>;
});
afterAll(() => fx.close());

describe('amendments in the export', () => {
  it('as-is chapters are byte-identical with and without amendments (SC-007)', () => {
    for (const [file, content] of before) {
      if (file === 'records.json') continue;
      expect(after.get(file), file).toBe(content);
    }
  });

  it('an export without amendments has no amendment files or key', () => {
    expect(before.has('13-to-be-amendments.md')).toBe(false);
    expect(before.has('appendix-superseded-amendments.md')).toBe(false);
    expect(JSON.parse(before.get('records.json')!)).not.toHaveProperty('amendments');
  });

  it('the to-be chapter holds active amendments only, marked to-be', () => {
    const chapter = after.get('13-to-be-amendments.md')!;
    expect(chapter).toContain('**to-be**');
    expect(chapter).toContain('**AMD-002**');
    expect(chapter).toContain('Button should be green');
    expect(chapter).toContain('AMD-001'); // as the original it re-applies
    expect(chapter).not.toContain('**AMD-001**');
    expect(chapter).not.toContain('AMD-003');
    expect(chapter).not.toContain('AMD-004');
  });

  it('the appendix lists amendments to re-anchor and dismissed ones with reason and run (SC-008)', () => {
    const appendix = after.get('appendix-superseded-amendments.md')!;
    expect(appendix).toContain('**AMD-001**');
    expect(appendix).toContain('element_changed: button "Kup" is now button "Kup teraz"');
    expect(appendix).toContain(fx.runId);
    expect(appendix).toContain('**AMD-003**');
    expect(appendix).not.toContain('AMD-004');
  });

  it('records.json carries every non-withdrawn amendment with status and to_be', () => {
    const json = JSON.parse(after.get('records.json')!) as {
      amendments: { key: string; status: string; to_be: boolean; reapplied_as: string | null }[];
    };
    expect(json.amendments.map((a) => [a.key, a.status, a.to_be])).toEqual([
      ['AMD-001', 'needs_reanchor', true],
      ['AMD-002', 'active', true],
      ['AMD-003', 'dismissed', true],
    ]);
    expect(json.amendments[0]?.reapplied_as).toBe('AMD-002');
  });

  it('a scoped export keeps only amendments on in-scope states', () => {
    const scoped = exportSrs(fx.raw, fx.portalId, {
      environment: 'sandbox',
      scope: { name: 'Contact', stateIds: [fx.states.contact] },
    }) as Map<string, string>;
    expect(scoped.has('13-to-be-amendments.md')).toBe(false);
  });
});
