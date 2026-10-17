import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupRuns, type RunGroupInput, type RunGroups } from '../src/services/ba/run-groups.js';
import { startBa, type BaHarness } from './ba-harness.js';

// Spec 034 R-70 (1)–(2): runs grouped into processes by the screens they walked; the BA's update
// mode returns a documented process with every run of it and what no record cites yet.

const CASES = JSON.parse(
  readFileSync(new URL('../../../tests/fixtures/run-groups/cases.json', import.meta.url), 'utf8'),
) as { input: RunGroupInput; expected: RunGroups };

describe('groupRuns (shared fixture with the dashboard)', () => {
  it('matches the shared case', () => {
    expect(groupRuns(CASES.input)).toEqual(CASES.expected);
  });

  it('never proposes a group of one, and a process without screens owns only its cited runs', () => {
    const out = groupRuns({
      runs: ['a', 'b'],
      screens_of_run: { a: ['s1'], b: ['s2'] },
      processes: [{ key: 'PROC-001', title: 'p', screens: [], runs: ['b'] }],
    });
    expect(out).toEqual({
      processes: [{ key: 'PROC-001', title: 'p', runs: ['b'] }],
      unassigned: ['a'],
      proposed: [],
    });
  });
});

const PROCESS = {
  title: 'Get a car insurance quote',
  goal: 'Get a premium',
  persona: 'guest',
  trigger: 'Oblicz',
  outcome: 'The premium is shown',
  observed_extent: 'full',
};

async function documented(): Promise<{ h: BaHarness; key: string }> {
  const h = await startBa();
  const s = await h.session();
  const { key } = await h.must('create_record', {
    session_id: s,
    kind: 'process',
    content: PROCESS,
    confidence: 'observed',
    evidence: [
      { target_kind: 'state', target_id: h.fx.states.car },
      { target_kind: 'state', target_id: h.fx.states.vehicle },
    ],
  });
  return { h, key: key as string };
}

describe('open_process_update (spec 034 R-70 (2))', () => {
  it('returns the process, its records, its runs and the screens no record cites', async () => {
    const { h, key } = await documented();
    const out = await h.must('open_process_update', { portal_id: h.fx.portalId, key });
    expect(out.process).toMatchObject({ key, title: PROCESS.title });
    expect(out.records.map((r: { key: string }) => r.key)).toContain(key);
    expect(out.runs.map((r: { id: string }) => r.id)).toEqual([h.fx.runId]);
    const uncited = out.uncited_screens.map((s: { state_id: string }) => s.state_id);
    expect(uncited).toContain(h.fx.states.home);
    expect(uncited).not.toContain(h.fx.states.car);
    expect(out.error_branches).toEqual([]);
  });

  it('adds a later run that walked the process and marks it new', async () => {
    const { h, key } = await documented();
    const trace = h.fx.addTraceRun();
    // The fixture dates its runs in the past; this one ran after the record was written.
    h.fx.raw
      .prepare("UPDATE runs SET started_at = '2999-01-01T00:00:00.000Z' WHERE id = ?")
      .run(trace.runId);
    const out = await h.must('open_process_update', { portal_id: h.fx.portalId, key });
    const runs = out.runs as { id: string; new_since_last_change: boolean }[];
    expect(runs.map((r) => r.id)).toEqual([h.fx.runId, trace.runId]);
    expect(runs.find((r) => r.id === trace.runId)?.new_since_last_change).toBe(true);
  });

  it('lists error pages of the process runs as error branches', async () => {
    const { h, key } = await documented();
    h.fx.raw
      .prepare("UPDATE states SET state_kind = 'technical' WHERE id = ?")
      .run(h.fx.states.contact);
    const out = await h.must('open_process_update', { portal_id: h.fx.portalId, key });
    expect(out.error_branches.map((s: { state_id: string }) => s.state_id)).toEqual([
      h.fx.states.contact,
    ]);
  });

  it('refuses an unknown process with the known keys', async () => {
    const { h, key } = await documented();
    const out = await h.refused('open_process_update', {
      portal_id: h.fx.portalId,
      key: 'PROC-404',
    });
    expect(out).toMatchObject({ code: 'PROCESS_UNKNOWN', known: [key] });
  });
});
