// Spec 040 T035 (design § 11.5): a mined rule's boundary tests become one open probe suite for
// the owner: a valid trace, a variant per test, a note naming the expected screen; once only.
import { TraceSpecEntry } from '@pathfinder/config';
import { describe, expect, it } from 'vitest';
import { proposeBoundarySuites } from '../src/boundary-suites.js';
import { T, withRule } from '../../store/tests/seed-threshold.js';

describe('boundary tests as a probe suite', () => {
  it('writes one open suite per rule, a variant per test, and never twice', async () => {
    const o = withRule(18);
    expect(proposeBoundarySuites(o.raw, 'ins', T(800))).toEqual(['rule-h-0001']);
    const row = o.raw.prepare('SELECT status, trace_json, notes_json FROM probe_suites').get() as {
      status: string;
      trace_json: string;
      notes_json: string;
    };
    expect(row.status).toBe('open');
    const trace = TraceSpecEntry.parse(JSON.parse(row.trace_json));
    const tests = (
      o.raw.prepare('SELECT count(*) AS n FROM hypothesis_tests').get() as { n: number }
    ).n;
    expect(trace.variants).toHaveLength(tests);
    expect(new Set(trace.variants.map((v) => v.expect))).toEqual(new Set(['proceed', 'branch']));
    const fills = trace.steps.filter((s) => s.kind === 'fill').map((s) => s.name);
    expect(fills).toContain('data_urodzenia');
    expect(trace.steps.at(-1)).toMatchObject({ kind: 'click' });
    const notes = JSON.parse(row.notes_json) as { variant: string; why: string }[];
    expect(notes[0]!.why).toMatch(
      /^data_urodzenia \d{4}-\d{2}-\d{2}: expects SC-\d+ .*\(boundary test of H-0001\)$/,
    );
    expect(proposeBoundarySuites(o.raw, 'ins', T(810))).toEqual([]);
    await o.close();
  });

  it('gives a rule a person rejected no suite', async () => {
    const o = withRule(18);
    o.raw
      .prepare(
        "INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at) SELECT 'x', id, 'proposed', 'rejected', 'Anna', 'no', ? FROM hypotheses",
      )
      .run(T(790));
    expect(proposeBoundarySuites(o.raw, 'ins', T(800))).toEqual([]);
    await o.close();
  });
});
