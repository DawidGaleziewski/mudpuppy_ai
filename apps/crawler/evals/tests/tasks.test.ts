import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadGroundTruth, SUITE, taskFor } from '../tasks.js';

const root = resolve(import.meta.dirname, '../../../..');

describe('eval suite', () => {
  it.each(SUITE.map((t) => [t.portal, t] as const))(
    '%s: the ground truth parses and names the same portal',
    (portal, t) => {
      expect(loadGroundTruth(root, t).portal_id).toBe(portal);
    },
  );

  it('has no task for another portal', () => {
    expect(taskFor('liveinsurer')).toBeUndefined();
  });

  it('passes the session timeout to the proving-ground estate only', () => {
    const estate = taskFor('proving-ground-bank')!.server;
    expect(estate.takesSessionTimeout).toBe(true);
    expect(estate.args('/r', 20)).toEqual([
      '/r/apps/proving-ground/scripts/start.mjs',
      '--session-timeout',
      '20',
    ]);
    expect(estate.args('/r', undefined)).toEqual(['/r/apps/proving-ground/scripts/start.mjs']);
    expect(taskFor('reference-insurer')!.server.takesSessionTimeout).toBe(false);
  });
});
