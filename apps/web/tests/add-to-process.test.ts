// Spec 079 FR-003 (owner D-6 (a)): Add to process lists the processes of the personas whose scans
// recorded the screens, a group per persona; the default persona only when no scan names one.
import { describe, expect, it } from 'vitest';
import { addEntries, seenBy } from '../src/app/addToProcess';
import type { Target } from '../src/app/api-processes';

const target = (id: string, persona: string, states: string[] = []): Target => ({ id, key: id, name: `Process ${id}`, persona, steps: 2, states });
const targets = [target('a', 'guest'), target('b', 'client', ['st-1']), target('c', 'admin')];
const noop = () => undefined;
const labels = (personas: string[]) => addEntries(targets, personas, ['st-1'], noop, noop).map((e) => ('label' in e ? e.label : '—'));

describe('Add to process ▾', () => {
  it('names who saw the screens, else the default persona', () => {
    const loose = [
      { state: 'st-1', personas: ['guest', 'client'] },
      { state: 'st-2', personas: ['client'] },
      { state: 'st-3' },
    ];
    expect(seenBy(loose, ['st-1', 'st-2'], 'guest')).toEqual(['client', 'guest']);
    expect(seenBy(loose, ['st-3'], 'guest')).toEqual(['guest']);
  });

  it("groups the processes per persona that saw them and leaves the others' out", () => {
    expect(labels(['client', 'guest'])).toEqual(['Processes · client', 'Process b', 'Processes · guest', 'Process a', '—', 'New process from these…']);
    expect(labels(['guest'])).toEqual(['Processes · guest', 'Process a', '—', 'New process from these…']);
  });

  it('marks a process that has every screen already as already in', () => {
    const b = addEntries(targets, ['client'], ['st-1'], noop, noop).find((e) => 'key' in e && e.key === 'b');
    expect(b).toMatchObject({ aside: 'already in', disabled: true });
  });
});
