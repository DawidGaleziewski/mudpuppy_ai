// Spec 040 T033 (design § 14.1): the planner's work as marks of origin `planner`, replaced on
// each pass, used by the probe run that served them; people's marks are never touched.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  migrateUp,
  openDb,
  plannerWork,
  reconcilePortalModel,
  usePlannerMarks,
  writePlannerMarks,
} from '../src/index.js';
import { addRule, seedThreshold, T } from './seed-threshold.js';

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');

function seeded() {
  const o = openDb(':memory:');
  migrateUp(o.raw, MIGRATIONS);
  seedThreshold(o);
  reconcilePortalModel(o.raw, 'ins', { now: T(500) });
  addRule(o, 18); // H-0001 with its boundary tests waiting
  return o;
}

const marks = (o: ReturnType<typeof seeded>) =>
  o.raw
    .prepare(
      'SELECT origin, kind, priority, hypothesis_id, state_id, used_by_run_id FROM marks ORDER BY priority, id',
    )
    .all() as {
    origin: string;
    kind: string;
    priority: number;
    hypothesis_id: string | null;
    state_id: string | null;
    used_by_run_id: string | null;
  }[];

describe('the planner writes its marks', () => {
  it('marks the rule waiting for its tests (priority 3) on its decision screen', async () => {
    const o = seeded();
    expect(plannerWork(o.raw, 'ins').input.testing.map((t) => t.hypothesis)).toEqual(['H-0001']);
    const items = writePlannerMarks(o.raw, 'ins', { now: T(700) });
    expect(items.find((i) => i.subject === 'H-0001')).toMatchObject({ priority: 3 });
    const tested = marks(o).filter((m) => m.priority === 3);
    expect(tested).toHaveLength(1);
    expect(tested[0]).toMatchObject({ origin: 'planner', kind: 'recheck' });
    expect(tested[0]!.hypothesis_id).not.toBeNull();
    expect(tested[0]!.state_id).not.toBeNull();
    await o.close();
  });

  it('replaces its open marks on each pass, keeps used ones and people’s marks', async () => {
    const o = seeded();
    const state = (o.raw.prepare('SELECT id FROM states LIMIT 1').get() as { id: string }).id;
    o.raw
      .prepare(
        "INSERT INTO marks (id, portal_id, kind, state_id, created_by, created_at) VALUES ('pm', 'ins', 'recheck', ?, 'Anna', ?)",
      )
      .run(state, T(600));
    writePlannerMarks(o.raw, 'ins', { now: T(700) });
    const first = marks(o).filter((m) => m.origin === 'planner').length;
    writePlannerMarks(o.raw, 'ins', { now: T(710) });
    expect(marks(o).filter((m) => m.origin === 'planner')).toHaveLength(first);
    const run = (o.raw.prepare('SELECT id FROM runs LIMIT 1').get() as { id: string }).id;
    expect(usePlannerMarks(o.raw, 'ins', 'H-0001', run, T(720))).toBe(1);
    writePlannerMarks(o.raw, 'ins', { now: T(730) });
    const all = marks(o);
    expect(all.filter((m) => m.used_by_run_id === run)).toHaveLength(1); // kept
    expect(all.filter((m) => m.origin === 'person')).toHaveLength(1); // Anna's stays
    await o.close();
  });

  it("a person's Recheck and the planner's mark on one page live side by side (0047)", async () => {
    const o = seeded();
    writePlannerMarks(o.raw, 'ins', { now: T(700) });
    const planned = marks(o).find((m) => m.origin === 'planner' && m.state_id !== null)!;
    o.raw
      .prepare(
        "INSERT INTO marks (id, portal_id, kind, state_id, created_by, created_at) VALUES ('pm2', 'ins', 'recheck', ?, 'Anna', ?)",
      )
      .run(planned.state_id, T(710));
    writePlannerMarks(o.raw, 'ins', { now: T(720) }); // and the planner writes it again
    const onPage = marks(o).filter((m) => m.state_id === planned.state_id);
    expect(onPage.map((m) => m.origin).sort()).toEqual(['person', 'planner']);
    await o.close();
  });
});
