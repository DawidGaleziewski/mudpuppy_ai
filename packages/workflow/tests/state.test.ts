import { describe, expect, it } from 'vitest';
import { workflowState, type StepState, type WorkflowInput } from '../src/index.js';

const empty: WorkflowInput = {
  portal: null,
  portalConfigured: false,
  personas: [],
  credentialsStored: false,
  runs: [],
  statesRecorded: 0,
  frontierPending: 0,
  processes: [],
  sessions: [],
  docRecords: 0,
  scopes: [],
  activeAmendments: 0,
  supersededAmendments: 0,
  recordedSteps: [],
};

const ready: WorkflowInput = {
  ...empty,
  portal: 'reference',
  portalConfigured: true,
  personas: ['guest'],
  credentialsStored: true,
};

const scanned: WorkflowInput = {
  ...ready,
  runs: [
    {
      id: 'run-1',
      mode: 'map',
      status: 'completed',
      startedAt: '2026-10-05T10:00:00Z',
      endedAt: '2026-10-05T10:20:00Z',
    },
  ],
  statesRecorded: 12,
};

function step(state: ReturnType<typeof workflowState>, name: StepState['step']): StepState {
  const found = state.steps.find((s) => s.step === name);
  if (found === undefined) throw new Error(`no step ${name}`);
  return found;
}

function move(state: ReturnType<typeof workflowState>, name: string) {
  const found = state.moves.find((m) => m.move === name);
  if (found === undefined) throw new Error(`no move ${name}`);
  return found;
}

describe('workflowState', () => {
  it('no scan: every step to do, scan blocked on its missing inputs only', () => {
    const s = workflowState(empty);
    expect(s.steps.map((x) => x.status)).toEqual(['todo', 'todo', 'todo', 'todo', 'todo']);
    expect(move(s, 'scan')).toEqual({
      move: 'scan',
      valid: false,
      missing: ['portal', 'portal URL', 'persona', 'test-user credentials'],
    });
    expect(move(s, 'document').missing).toContain('a completed scan');
    expect(s.proposals).toEqual([]);
    expect(s.busy).toBe(false);
  });

  it('asks only for what is missing', () => {
    const s = workflowState({ ...ready, credentialsStored: false });
    expect(move(s, 'scan').missing).toEqual(['test-user credentials']);
  });

  it('all scan inputs present: scan is the proposal', () => {
    const s = workflowState(ready);
    expect(move(s, 'scan').valid).toBe(true);
    expect(s.proposals).toEqual(['scan']);
  });

  it('scanned: proposes narrowing, mapping and amending; documentation needs a scope', () => {
    const s = workflowState(scanned);
    expect(step(s, 'scan').status).toBe('done');
    // A new (e.g. focused) scan stays possible, but is not proposed (spec 011 FR-018).
    expect(move(s, 'scan')).toEqual({ move: 'scan', valid: true, missing: [] });
    expect(move(s, 'document')).toMatchObject({
      valid: false,
      missing: ['a process scope (pick its start and end)'],
    });
    expect(s.proposals).toEqual(['narrow_process', 'map_process', 'amend']);
  });

  it('scanned with queued pages: continue scan is offered', () => {
    const s = workflowState({ ...scanned, frontierPending: 4 });
    expect(move(s, 'continue_scan').valid).toBe(true);
    expect(step(s, 'scan').detail).toContain('4 pages still queued');
  });

  it('scoped: documentation becomes valid', () => {
    const s = workflowState({
      ...scanned,
      scopes: [
        {
          id: 'sc-1',
          processName: 'Car quote',
          createdAt: '2026-10-05T11:00:00Z',
        },
      ],
    });
    expect(step(s, 'narrow')).toMatchObject({
      status: 'done',
      detail: 'scope: Car quote',
    });
    expect(move(s, 'document').valid).toBe(true);
    expect(s.proposals).toEqual(['narrow_process', 'document', 'map_process', 'amend']);
  });

  it('running scan: in progress, busy, other scan moves blocked', () => {
    const s = workflowState({
      ...ready,
      runs: [
        {
          id: 'run-1',
          mode: 'map',
          status: 'running',
          startedAt: '2026-10-05T10:00:00Z',
        },
      ],
    });
    expect(step(s, 'scan').status).toBe('in_progress');
    expect(s.busy).toBe(true);
    expect(move(s, 'scan')).toMatchObject({ valid: false });
    expect(move(s, 'scan').missing).toContain('the running scan to finish');
  });

  it('failed scan: failed status, continue offered once states exist', () => {
    const s = workflowState({
      ...ready,
      runs: [
        {
          id: 'run-1',
          mode: 'map',
          status: 'stopped_warning',
          warning: 'CAPTCHA',
          startedAt: '2026-10-05T10:00:00Z',
          endedAt: '2026-10-05T10:01:00Z',
        },
      ],
      statesRecorded: 2,
    });
    expect(step(s, 'scan')).toMatchObject({
      status: 'failed',
      detail: 'scan stopped: CAPTCHA',
    });
    expect(move(s, 'continue_scan').valid).toBe(true);
  });

  it('a scan the BA stopped is stopped, not failed, with no error reference; continue is offered (spec 011 F-04)', () => {
    const interrupted: WorkflowInput = {
      ...ready,
      runs: [
        {
          id: 'run-1',
          mode: 'map',
          status: 'interrupted',
          startedAt: '2026-10-05T10:00:00Z',
          endedAt: '2026-10-05T10:05:00.000Z',
        },
      ],
      statesRecorded: 9,
    };
    // Recorded in the same millisecond as the run's end: still stopped.
    const s = workflowState({
      ...interrupted,
      recordedSteps: [{ step: 'scan', status: 'stopped', updatedAt: '2026-10-05T10:05:00.000Z' }],
    });
    expect(step(s, 'scan')).toMatchObject({ status: 'stopped', errorRef: null });
    expect(move(s, 'continue_scan').valid).toBe(true);
    expect(s.busy).toBe(false);
    // Without the BA's stop the same run is a failure.
    expect(step(workflowState(interrupted), 'scan').status).toBe('failed');
  });

  it('a recorded request newer than the data shows as pending', () => {
    const s = workflowState({
      ...ready,
      recordedSteps: [{ step: 'scan', status: 'pending', updatedAt: '2026-10-05T09:00:00Z' }],
    });
    expect(step(s, 'scan').status).toBe('pending');
    expect(s.busy).toBe(true);
  });

  it('a stale recorded pending row never hides a finished run', () => {
    const s = workflowState({
      ...scanned,
      recordedSteps: [{ step: 'scan', status: 'pending', updatedAt: '2026-10-05T09:59:00Z' }],
    });
    expect(step(s, 'scan').status).toBe('done');
  });

  it('a failure before any run keeps its error reference', () => {
    const s = workflowState({
      ...ready,
      recordedSteps: [
        {
          step: 'scan',
          status: 'failed',
          errorRef: 'ERR-01J0000000000000000000000',
          updatedAt: '2026-10-05T09:00:00Z',
        },
      ],
    });
    expect(step(s, 'scan')).toMatchObject({
      status: 'failed',
      errorRef: 'ERR-01J0000000000000000000000',
    });
  });

  it('a running trace does not count as a scan', () => {
    const s = workflowState({
      ...scanned,
      runs: [
        ...scanned.runs,
        {
          id: 'run-2',
          mode: 'trace',
          status: 'running',
          startedAt: '2026-10-05T12:00:00Z',
        },
      ],
    });
    expect(step(s, 'scan').status).toBe('done');
    expect(step(s, 'map').status).toBe('in_progress');
  });

  it('documentation running and done', () => {
    const base = {
      ...scanned,
      scopes: [
        {
          id: 'sc-1',
          processName: 'Car quote',
          createdAt: '2026-10-05T11:00:00Z',
        },
      ],
    };
    const running = workflowState({
      ...base,
      sessions: [{ id: 's-1', status: 'running', startedAt: '2026-10-05T12:00:00Z' }],
    });
    expect(step(running, 'document').status).toBe('in_progress');
    expect(move(running, 'document').valid).toBe(false);
    const done = workflowState({
      ...base,
      sessions: [
        {
          id: 's-1',
          status: 'completed',
          startedAt: '2026-10-05T12:00:00Z',
          endedAt: '2026-10-05T12:30:00Z',
        },
      ],
      docRecords: 31,
    });
    expect(step(done, 'document')).toMatchObject({
      status: 'done',
      detail: '31 documentation record(s)',
    });
  });

  it('superseded amendments are proposed first', () => {
    const s = workflowState({
      ...scanned,
      activeAmendments: 1,
      supersededAmendments: 2,
    });
    expect(s.proposals[0]).toBe('review_superseded');
    expect(step(s, 'amend').detail).toBe('1 amendment(s); 2 to re-anchor');
  });

  it('is deterministic', () => {
    expect(workflowState(scanned)).toEqual(workflowState(scanned));
  });
});
