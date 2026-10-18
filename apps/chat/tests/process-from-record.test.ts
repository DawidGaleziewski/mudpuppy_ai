// "Open in Processes" (spec 027 US6.2): a BA process record becomes a workspace process whose A
// walks the record's screens in its export's order, linked by record_key; a second open finds it.
import { makeFixtureStore, seedDocRecords, type FixtureStore } from '@pathfinder/docs/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { resolveProcessSteps } from '@pathfinder/docs';
import { createProcessService } from '../src/process-service.js';

let fx: FixtureStore;
beforeAll(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer' });
  seedDocRecords(fx);
});
afterAll(() => fx.close());

it('opens PROC-001 as a PRC with A in walking order, then finds it again', async () => {
  const svc = createProcessService({ db: fx.db, raw: fx.raw });
  const first = await svc.fromRecord(fx.portalId, { record_key: 'PROC-001', author: 'Anna' });
  expect(first.existing).toBe(false);
  expect(first.process).toMatchObject({ key: 'PRC-001', record_key: 'PROC-001', stage: 'scoped' });
  const walked = resolveProcessSteps(fx.raw, fx.portalId, 'PROC-001')!
    .steps.filter((s) => !s.also_cited)
    .map((s) => s.state_id);
  expect(first.revision?.steps.map((s) => s.state_id)).toEqual(walked);

  const again = await svc.fromRecord(fx.portalId, { record_key: 'PROC-001', author: 'Anna' });
  expect(again).toMatchObject({ existing: true, process: { key: 'PRC-001' } });
  expect(fx.raw.prepare('SELECT count(*) AS n FROM ba_processes').get()).toEqual({ n: 1 });

  await expect(
    svc.fromRecord(fx.portalId, { record_key: 'PROC-999', author: 'Anna' }),
  ).rejects.toMatchObject({ status: 404 });
});
