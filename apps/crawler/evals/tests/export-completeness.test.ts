import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GroundTruth } from '@mudpuppy/docs';
import {
  addStepVariant,
  makeFixtureStore,
  seedDocRecords,
  type FixtureStore,
} from '@mudpuppy/docs/testing';
import { scoreExport } from '../graders/code/export-completeness.js';
import { scoreVariants } from '../graders/code/process-variants.js';

// Spec 034 R-68 FR-016: the export grader over the docs fixture (two process records, no
// evidence files, so no step is pictured).

let fx: FixtureStore;
beforeAll(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
  seedDocRecords(fx);
});
afterAll(() => fx.close());

describe('scoreExport', () => {
  it('scores every documented process', () => {
    const s = scoreExport(fx.raw, fx.portalId, { environment: 'sandbox' });
    expect(s.export_steps_pictured.total).toBeGreaterThan(0);
    expect(s.export_steps_pictured.matched).toBe(0); // no evidence root: no picture
    expect(s.export_records_once.total).toBeGreaterThan(0);
    expect(s.export_records_once.matched).toBe(s.export_records_once.total);
    expect(s.export_ears).toEqual({ matched: 0, total: s.export_records_once.total, pct: 0 });
  });

  it('counts no repeated step on the fixture', () => {
    const s = scoreExport(fx.raw, fx.portalId, { environment: 'sandbox' });
    expect(s.export_steps_distinct.matched).toBe(s.export_steps_distinct.total);
  });

  it('scores a ground-truth variant only once the export shows it as one step with it', () => {
    // The grader reads only the processes' variants.
    const gt = {
      processes: [
        {
          id: 'P01',
          variants: [{ step: '/kalkulator/pojazd', field: 'Wartość pojazdu (zł)', when: 'Z AC' }],
        },
      ],
    } as unknown as GroundTruth;
    const before = scoreVariants(fx.raw, fx.portalId, gt, { environment: 'sandbox' });
    expect(before.process_variants).toEqual({ matched: 0, total: 1, pct: 0 });
    addStepVariant(fx, {
      id: 'vehicle-ac',
      from: fx.states.car,
      label: 'Z AC',
      extraField: 'Wartość pojazdu (zł)',
    });
    const after = scoreVariants(fx.raw, fx.portalId, gt, { environment: 'sandbox' });
    expect(after.process_variants).toEqual({ matched: 1, total: 1, pct: 100 });
  });

  it('scores 0, not 100 %, for a portal without processes', () => {
    const s = scoreExport(fx.raw, 'no-such-portal', { environment: 'sandbox' });
    expect(s.export_steps_pictured).toEqual({ matched: 0, total: 0, pct: 0 });
  });
});
