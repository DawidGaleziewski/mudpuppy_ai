import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadGroundTruth, processTracesFor, SUITE, taskFor } from '../tasks.js';

const root = resolve(import.meta.dirname, '../../../..');

describe('eval suite', () => {
  it.each(SUITE.map((t) => [t.portal, t] as const))(
    '%s: the ground truth parses and names the same portal',
    (portal, t) => {
      expect(loadGroundTruth(root, t).portal_id).toBe(portal);
    },
  );

  it.each(SUITE.map((t) => [t.portal, t] as const))(
    '%s: every rule keeps its statement, the text a judge reads (spec 017 F-06)',
    (_portal, t) => {
      for (const rule of loadGroundTruth(root, t).rules) expect(rule.statement).toBeTruthy();
    },
  );

  it('has no task for another portal', () => {
    expect(taskFor('liveinsurer')).toBeUndefined();
  });

  it('passes the session timeout to the proving-ground estate only', () => {
    const estate = taskFor('proving-ground-bank')!.server!;
    expect(estate.takesSessionTimeout).toBe(true);
    expect(estate.args('/r', 20)).toEqual([
      '/r/apps/proving-ground/scripts/start.mjs',
      '--session-timeout',
      '20',
    ]);
    expect(estate.args('/r', undefined)).toEqual(['/r/apps/proving-ground/scripts/start.mjs']);
    expect(taskFor('reference-insurer')!.server!.takesSessionTimeout).toBe(false);
  });

  it.each(SUITE.filter((t) => t.trace).map((t) => [t.portal, t] as const))(
    '%s: the traced process has its steps in the ground truth',
    (_portal, t) => {
      const process = loadGroundTruth(root, t).processes.find((p) => p.id === t.trace!.processId);
      expect(process?.steps?.length).toBeGreaterThan(0);
    },
  );

  it.each(SUITE.filter((t) => t.processTraces).map((t) => [t.portal, t] as const))(
    '%s: every process trace names a ground-truth process with steps (spec 025)',
    (_portal, t) => {
      const processes = loadGroundTruth(root, t).processes;
      for (const spec of t.processTraces!)
        expect(processes.find((p) => p.id === spec.processId)?.steps?.length).toBeGreaterThan(0);
    },
  );

  it('runs process traces for the guest persona only, unless turned off', () => {
    const task = taskFor('reference-insurer')!;
    expect(processTracesFor(task, 'guest', true).map((t) => t.processId)).toEqual([
      'P01',
      'P02',
      'P03',
      'P04',
    ]);
    expect(processTracesFor(task, 'client', true)).toEqual([]);
    expect(processTracesFor(task, 'guest', false)).toEqual([]);
    expect(processTracesFor(taskFor('proving-ground-shop')!, 'guest', true)).toEqual([]);
  });

  it('a live site has no server to start', () => {
    expect(taskFor('wikipedia')!.server).toBeUndefined();
  });
});
