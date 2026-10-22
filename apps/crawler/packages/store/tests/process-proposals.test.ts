import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  blockedBy,
  migrateUp,
  openDb,
  processGraph,
  proposalConstraints,
  reconcilePortalModel,
  writeProposals,
  type OpenedDb,
} from '../src/index.js';
import { seedThreshold } from './seed-threshold.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');
const NOW = '2026-10-19T02:00:00.000Z';

function open(): OpenedDb {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  seedThreshold(o);
  reconcilePortalModel(o.raw, 'ins', { now: '2026-10-19T01:50:00.000Z' });
  return o;
}

const screenOfState = (o: OpenedDb, state: string): string =>
  (
    o.raw
      .prepare(
        'SELECT screen_id FROM screen_members WHERE state_id = ? AND to_model_version IS NULL',
      )
      .get(state) as { screen_id: string }
  ).screen_id;

/** The real Leiden step: opt in with `PF_MINER=1` (needs `uv`), as in rule-mining.test.ts. */
describe.skipIf(!process.env.PF_MINER)('the real miner communities (PF_MINER=1)', () => {
  it('keeps the form and its two outcomes in one process', async () => {
    const o = open();
    const g = processGraph(o.raw, 'ins');
    const dir = mkdtempSync(join(tmpdir(), 'pf-propose-'));
    const file = join(dir, 'graph.json');
    writeFileSync(file, JSON.stringify(g));
    const miner = join(import.meta.dirname, '../../../../miner');
    const out = execFileSync(
      'uv',
      ['run', '--project', miner, 'mudpuppy-miner', 'communities', '--in', file],
      { encoding: 'utf8' },
    );
    const { communities } = JSON.parse(out) as { communities: string[][] };
    expect(communities).toEqual([[...g.nodes].sort()]);
    expect(writeProposals(o.raw, 'ins', communities, g, NOW)).toEqual(['form']);
    await o.close();
  }, 60_000);
});

describe('process proposals from the portal model (spec 039 design § 13)', () => {
  it('weights the direct links between the form and its two outcomes', async () => {
    const o = open();
    const g = processGraph(o.raw, 'ins');
    expect(g.nodes).toHaveLength(3);
    const form = screenOfState(o, 'form');
    expect(g.edges.filter((e) => e.a === form || e.b === form)).toHaveLength(2);
    expect(g.edges.every((e) => e.w >= 1)).toBe(true);
    await o.close();
  });

  it('writes one open suggestion in flow order, once, and never a dismissed set again', async () => {
    const o = open();
    const g = processGraph(o.raw, 'ins');
    expect(writeProposals(o.raw, 'ins', [g.nodes], g, NOW)).toEqual(['form']);
    const row = o.raw
      .prepare('SELECT name, persona, steps, status FROM grouping_suggestions')
      .get() as {
      name: string;
      persona: string;
      steps: string;
      status: string;
    };
    expect(row).toMatchObject({ name: 'form', persona: 'guest', status: 'open' });
    const steps = JSON.parse(row.steps) as { id: string; state_id: string }[];
    // The start first; its next screens in screen order.
    expect(steps[0]!.state_id).toBe('form');
    expect(steps.map((s) => s.state_id).sort()).toEqual(['exit', 'form', 'price']);
    expect(writeProposals(o.raw, 'ins', [g.nodes], g, NOW)).toEqual([]); // already suggested
    o.raw.prepare("UPDATE grouping_suggestions SET status = 'dismissed', decided_at = ?").run(NOW);
    expect(writeProposals(o.raw, 'ins', [g.nodes], g, NOW)).toEqual([]); // dismissed before
    expect(writeProposals(o.raw, 'ins', [[g.nodes[0]!]], g, NOW)).toEqual([]); // one screen is no process
    await o.close();
  });

  it("a person's dismissal and kept process constrain the next proposals (spec 040 T034)", async () => {
    const o = open();
    const g = processGraph(o.raw, 'ins');
    writeProposals(o.raw, 'ins', [g.nodes], g, NOW);
    o.raw.prepare("UPDATE grouping_suggestions SET status = 'dismissed', decided_at = ?").run(NOW);
    const skipped: { screens: readonly string[]; reason: string }[] = [];
    // One screen less than the dismissed set is the same process to the person.
    expect(writeProposals(o.raw, 'ins', [g.nodes.slice(0, 2)], g, NOW, skipped)).toEqual([]);
    expect(skipped[0]!.reason).toBe('like the dismissed proposal "form"');
    const c = proposalConstraints(o.raw, 'ins');
    expect(c.dismissed[0]!.screens.size).toBe(3);
    const kept = {
      dismissed: [],
      processes: [{ key: 'PRC-001', name: 'Quote', screens: new Set(g.nodes) }],
    };
    expect(blockedBy(kept, g.nodes.slice(0, 2))).toBe(
      'inside PRC-001 "Quote", a process a person keeps',
    );
    expect(blockedBy(kept, ['other-1', 'other-2'])).toBeNull();
    await o.close();
  });
});
