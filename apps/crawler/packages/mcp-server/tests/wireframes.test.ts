import { readFileSync, rmSync } from 'node:fs';
import { makeFixtureStore } from '@mudpuppy/docs/testing';
import { GENERATOR_VERSION } from '@mudpuppy/wireframe';
import { describe, expect, it } from 'vitest';
import { rebuildWireframes } from '../src/index.js';

/** `wireframes:build` (spec 008 T032): draws missing or stale wireframes, idempotently. */
describe('rebuildWireframes', () => {
  it('draws every state without a current wireframe, then nothing; --all redraws', async () => {
    const fx = await makeFixtureStore({ portalId: 'reference-insurer' });
    try {
      const first = await rebuildWireframes(fx, fx.portalId);
      expect(first).toMatchObject({ states: 4, drawn: 4, missing_snapshot: [] });
      const rows = fx.raw
        .prepare('SELECT state_id, generator_version, svg_ref FROM state_wireframes')
        .all() as { state_id: string; generator_version: string; svg_ref: string }[];
      expect(rows).toHaveLength(4);
      expect(rows.every((r) => r.generator_version === GENERATOR_VERSION)).toBe(true);
      expect(readFileSync(fx.evidence.resolve(rows[0]!.svg_ref), 'utf8')).toMatch(/^<svg /);

      expect((await rebuildWireframes(fx, fx.portalId)).drawn).toBe(0);
      fx.raw.prepare("UPDATE state_wireframes SET generator_version = '0'").run();
      expect((await rebuildWireframes(fx, fx.portalId)).drawn).toBe(4);
      expect((await rebuildWireframes(fx, fx.portalId, { all: true })).drawn).toBe(4);
      // Another portal's states are untouched.
      expect((await rebuildWireframes(fx, fx.otherPortalId)).states).toBe(1);
    } finally {
      await fx.close();
    }
  });

  it('reports states whose snapshot file is gone', async () => {
    const fx = await makeFixtureStore({ portalId: 'reference-insurer' });
    try {
      const ref = (
        fx.raw.prepare('SELECT evidence_ref FROM states WHERE id = ?').get(fx.states.home) as {
          evidence_ref: string;
        }
      ).evidence_ref;
      rmSync(fx.evidence.resolve(ref));
      const report = await rebuildWireframes(fx, fx.portalId);
      expect(report.missing_snapshot).toEqual([fx.states.home]);
      expect(report.drawn).toBe(3);
    } finally {
      await fx.close();
    }
  });
});
