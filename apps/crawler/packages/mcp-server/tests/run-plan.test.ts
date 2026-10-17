import { describe, expect, it } from 'vitest';
import {
  actionKey,
  mayQueue,
  parsePlan,
  skippedItem,
  type ResolvedPlan,
} from '../src/services/run-plan.js';

// Spec 034 R-66: what a directed run may queue (pure).

const plan = (over: Partial<ResolvedPlan> = {}): ResolvedPlan => ({
  type: 'focused',
  parent_run_id: null,
  start_state_ids: ['s1'],
  depth: 2,
  skip_states: [],
  skip_actions: [],
  only_action: null,
  variation: 'none',
  target_edge_id: null,
  parent_done: [],
  mark_ids: [],
  ...over,
});
const next = { state_id: 's1', role: 'button', name: 'Dalej' };
const logout = { state_id: 's1', role: 'link', name: 'Wyloguj' };

describe('mayQueue', () => {
  it('queues everything in a plain run and nothing in a recheck', () => {
    expect(mayQueue(null, next)).toBe(true);
    expect(mayQueue(plan({ type: 'recheck' }), next)).toBe(false);
  });

  it('a retry queues only the failed action', () => {
    const p = plan({ type: 'retry', only_action: actionKey(next) });
    expect(mayQueue(p, next)).toBe(true);
    expect(mayQueue(p, logout)).toBe(false);
  });

  it('leaves out Skip-marked actions and states, and what the parent already did', () => {
    expect(mayQueue(plan({ skip_actions: [actionKey(logout)] }), logout)).toBe(false);
    expect(mayQueue(plan({ skip_states: ['s1'] }), next)).toBe(false);
    expect(mayQueue(plan({ type: 'continue', parent_done: [actionKey(next)] }), next)).toBe(false);
    expect(mayQueue(plan({ skip_actions: [actionKey(logout)] }), next)).toBe(true);
  });
});

describe('skippedItem', () => {
  it('skips an item on a Skip-marked action or leading to a Skip-marked state', () => {
    expect(skippedItem(plan({ skip_actions: [actionKey(logout)] }), logout, null)).toBe(true);
    expect(skippedItem(plan({ skip_states: ['s9'] }), next, 's9')).toBe(true);
    expect(skippedItem(plan(), next, 's9')).toBe(false);
    expect(skippedItem(null, next, 's9')).toBe(false);
  });
});

describe('parsePlan', () => {
  it('reads a stored plan and ignores a missing or broken one', () => {
    expect(parsePlan(JSON.stringify(plan()))?.type).toBe('focused');
    expect(parsePlan(null)).toBeNull();
    expect(parsePlan('{"type":"nope"}')).toBeNull();
  });
});
