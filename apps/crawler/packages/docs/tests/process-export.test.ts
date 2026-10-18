import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  exportPortal,
  exportProcess,
  processKeys,
  resolveProcessSteps,
} from '../src/process-export/index.js';
import { noiseKind, schemaOfShape } from '../src/process-export/contracts.js';
import {
  makeFixtureStore,
  seedDocRecords,
  type FixtureStore,
  type SeededDocs,
} from '../src/testing/index.js';

// Spec 034 R-68: the rebuild-grade export of one process and of a whole portal.

let fx: FixtureStore;
let seeded: SeededDocs;
beforeAll(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
  seeded = seedDocRecords(fx);
});
afterAll(() => fx.close());

const FILES = [
  'README.md',
  'PROCESS_STEPS.md',
  'BUSINESS_REQUIREMENTS.md',
  'FUNCTIONAL_REQUIREMENTS.md',
  'EARS.md',
  'CONTRACTS.md',
  'openapi.yaml',
  'GAPS.md',
  'process.json',
];

describe('resolveProcessSteps', () => {
  it('walks a process record in the order of the trace it cites', () => {
    const p = resolveProcessSteps(fx.raw, fx.portalId, 'PROC-001')!;
    expect(p.kind).toBe('record');
    expect(p.runs).toContain(seeded.trace.runId);
    const order = p.steps.map((s) => s.state_id);
    // The fixture's trace opens the car product page, then the calculator's vehicle step.
    expect(order.slice(0, 2)).toEqual([fx.states.car, fx.states.vehicle]);
    expect(new Set(order).size).toBe(order.length);
    expect(p.steps.every((s, i) => s.n === i + 1)).toBe(true);
  });

  it('starts at the first screen the process contains, not where the trace set off (F-15@034)', () => {
    const idOf = (key: string): string =>
      (fx.raw.prepare('SELECT id FROM doc_records WHERE key = ?').get(key) as { id: string }).id;
    const rev = (
      fx.raw
        .prepare(
          `SELECT v.id FROM doc_revisions v JOIN doc_records r ON r.id = v.record_id
           WHERE r.key = 'PROC-001' AND v.rev_no = r.latest_rev`,
        )
        .get() as { id: string }
    ).id;
    // SCR-002 is the vehicle calculator; the trace walked the car product page before it.
    const add = fx.raw.prepare(
      "INSERT INTO doc_relations (from_revision_id, to_record_id, type) VALUES (?, ?, 'contains')",
    );
    add.run(rev, idOf('SCR-002'));
    try {
      const order = resolveProcessSteps(fx.raw, fx.portalId, 'PROC-001')!.steps.map(
        (s) => s.state_id,
      );
      expect(order[0]).toBe(fx.states.vehicle);
      expect(order).not.toContain(fx.states.car);
    } finally {
      fx.raw
        .prepare(
          "DELETE FROM doc_relations WHERE from_revision_id = ? AND to_record_id = ? AND type = 'contains'",
        )
        .run(rev, idOf('SCR-002'));
    }
  });

  it('knows nothing of an unknown process and lists the documented ones', () => {
    expect(resolveProcessSteps(fx.raw, fx.portalId, 'PROC-999')).toBeNull();
    expect(processKeys(fx.raw, fx.portalId)).toEqual(['PROC-001', 'PROC-002']);
  });
});

describe('exportProcess', () => {
  it('writes the folder of the owner-rated layout, byte-identical for the same store', () => {
    const a = exportProcess(fx.raw, fx.portalId, 'PROC-001', { environment: 'sandbox' })!;
    const b = exportProcess(fx.raw, fx.portalId, 'PROC-001', { environment: 'sandbox' })!;
    expect([...a.keys()]).toEqual(FILES);
    for (const f of FILES) expect(b.get(f)).toEqual(a.get(f));
  });

  it('puts every step in PROCESS_STEPS and the process facts in the README', () => {
    const files = exportProcess(fx.raw, fx.portalId, 'PROC-001', { environment: 'sandbox' })!;
    const steps = files.get('PROCESS_STEPS.md') as string;
    const p = resolveProcessSteps(fx.raw, fx.portalId, 'PROC-001')!;
    for (const s of p.steps) expect(steps).toContain(`<a id="step-${s.n}"></a>Step ${s.n}`);
    expect(files.get('README.md')).toMatch(/## What this service does/);
    const json = JSON.parse(files.get('process.json') as string) as { steps: unknown[] };
    expect(json.steps).toHaveLength(p.steps.length);
  });

  it("prints the BA's EARS statements and lists the records without one", () => {
    const ears = exportProcess(fx.raw, fx.portalId, 'PROC-001', { environment: 'sandbox' })!.get(
      'EARS.md',
    ) as string;
    expect(ears).toMatch(/Without an EARS statement|No EARS statement stored yet/);
  });

  it('refuses an unknown process', () => {
    expect(exportProcess(fx.raw, fx.portalId, 'PRC-404', { environment: 'sandbox' })).toBeNull();
  });
});

describe('exportPortal', () => {
  it('writes the shared files and one folder per documented process', () => {
    const files = exportPortal(fx.raw, fx.portalId, { environment: 'sandbox' });
    for (const f of ['README.md', 'GLOSSARY.md', 'APIS.md', 'SCREENS.md'])
      expect(files.has(f)).toBe(true);
    for (const k of ['proc-001', 'proc-002']) expect(files.has(`${k}/README.md`)).toBe(true);
    expect(files.get('README.md')).toContain('[proc-001/](proc-001/README.md)');
  });
});

describe('contracts helpers', () => {
  it('tells static files and analytics from API calls', () => {
    expect(noiseKind({ url_template: '/static/app.js', url: null })).toBe('static');
    expect(
      noiseKind({ url_template: '/g/collect', url: 'https://www.google-analytics.com/g/collect' }),
    ).toBe('analytics');
    expect(noiseKind({ url_template: '/api/quotes', url: 'https://x.test/api/quotes' })).toBeNull();
  });

  it('turns a recorded shape into a JSON schema', () => {
    expect(schemaOfShape({ id: 'integer', tags: ['string'], seller: { email: 'string' } })).toEqual(
      {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          seller: { type: 'object', properties: { email: { type: 'string' } } },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    );
  });
});
