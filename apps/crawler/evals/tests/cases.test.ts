import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CASES, caseFor, loadGroundTruth } from '../cases.js';

const root = resolve(import.meta.dirname, '../../../..');

describe('eval cases', () => {
  it.each(CASES.map((c) => [c.portal, c] as const))(
    '%s: the ground truth parses and names the same portal',
    (portal, c) => {
      expect(loadGroundTruth(root, c).portal_id).toBe(portal);
    },
  );

  it('knows no other portal', () => {
    expect(caseFor('liveinsurer')).toBeUndefined();
  });

  it('passes the session timeout to the proving-ground estate only', () => {
    const estate = caseFor('proving-ground-bank')!.server;
    expect(estate.takesSessionTimeout).toBe(true);
    expect(estate.args('/r', 20)).toEqual([
      '/r/apps/proving-ground/scripts/start.mjs',
      '--session-timeout',
      '20',
    ]);
    expect(estate.args('/r', undefined)).toEqual(['/r/apps/proving-ground/scripts/start.mjs']);
    expect(caseFor('reference-insurer')!.server.takesSessionTimeout).toBe(false);
  });
});
