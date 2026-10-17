import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { statesOfStep } from '../src/process-export/step-states.js';
import { addStepVariant, makeFixtureStore, type FixtureStore } from '../src/testing/index.js';

// Owner review of the first real export (2026-10-17): a page the process passes is one step, its
// recordings with other typed values one row, and a form that differs by an earlier choice a
// variant (4a/4b) told apart by the actions that led to it.

let fx: FixtureStore;
beforeAll(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
});
afterAll(() => fx.close());

const head = () =>
  fx.raw
    .prepare(
      'SELECT id, screen_id, title, route_template, form_step_id, portal_id, state_kind FROM states WHERE id = ?',
    )
    .get(fx.states.vehicle) as Parameters<typeof statesOfStep>[1];

describe('statesOfStep', () => {
  it('folds recordings of the same form into one row, a differing form into variant b', () => {
    addStepVariant(fx, {
      id: 'vehicle-typed',
      from: fx.states.home,
      label: 'Oblicz składkę',
      extraField: null,
    });
    addStepVariant(fx, {
      id: 'vehicle-ac',
      from: fx.states.contact,
      label: 'OC + Autocasco (AC)',
      extraField: 'Wartość pojazdu (zł)',
    });
    const states = statesOfStep(fx.raw, head());
    const mains = states.filter((s) => s.kind === 'main');
    expect(mains.map((s) => s.variant)).toEqual(['a', 'b']);
    expect(mains[0]!.state_id).toBe(fx.states.vehicle);
    expect(mains[0]!.state_ids).toEqual([fx.states.vehicle, 'vehicle-typed']);
    expect(mains[1]!.state_ids).toEqual(['vehicle-ac']);
    expect(mains[1]!.reached_by).toEqual(['"OC + Autocasco (AC)" on /kontakt']);
  });
});
