// The to-be editor's step operations (spec 059), ported from the htmx editor: pure functions over
// the steps as stored.
import { describe, expect, it } from 'vitest';
import { stepOps, type RawStep } from '../src/app/stepOps';

const step = (id: string, title: string, route: string, state: string | null = `st-${id}`): RawStep => ({
  id,
  title,
  route,
  state_id: state,
  screen_id: null,
  observed: state !== null,
  from: [id],
  annotations: [],
});
const steps = [step('s1', 'Home', '/'), step('s2', 'Car', '/car'), step('s3', 'Driver', '/driver')];

describe('stepOps', () => {
  it('moves a step and leaves the ends alone', () => {
    expect(stepOps.down(steps, 's1').map((s) => s.id)).toEqual(['s2', 's1', 's3']);
    expect(stepOps.up(steps, 's1').map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(stepOps.down(steps, 's3').map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('merges a step with the next into one designed step built from both', () => {
    const out = stepOps.merge(steps, 's2');
    expect(out.map((s) => s.id)).toEqual(['s1', 'n1']);
    expect(out[1]).toMatchObject({ title: 'Car', route: '/car', observed: false, state_id: null, from: ['s2', 's3'] });
    expect(stepOps.merge(steps, 's3')).toEqual(steps);
  });

  it('adds a designed step with a fresh id, edits and annotates', () => {
    const added = stepOps.add(stepOps.merge(steps, 's2'), { title: 'Offer', route: '' });
    expect(added.at(-1)).toMatchObject({ id: 'n2', title: 'Offer', route: null, observed: false });
    const edited = stepOps.edit(steps, 's2', { title: 'Your car', route: '/car' });
    expect(edited[1]).toMatchObject({ title: 'Your car', observed: false, state_id: null });
    expect(stepOps.edit(steps, 's2', { title: 'Car', route: '/car' })[1]).toBe(steps[1]); // unchanged stays observed
    const noted = stepOps.annotate(steps, 's1', 'Ask for the postcode here', 'Anna', '2026-10-23T00:00:00.000Z');
    expect(noted[0]!.annotations).toEqual([{ text: 'Ask for the postcode here', author: 'Anna', at: '2026-10-23T00:00:00.000Z' }]);
    expect(stepOps.remove(steps, 's2').map((s) => s.id)).toEqual(['s1', 's3']);
  });
});
