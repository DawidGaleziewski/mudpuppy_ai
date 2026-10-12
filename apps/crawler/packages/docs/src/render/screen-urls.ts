import type { RawDb } from '../keys.js';
import { parameterInventory, type StateInventory, type VisitRow } from '../param-inventory.js';
import type { ExportRecord } from './model.js';

/**
 * Per screen record, the URLs its cited states were reached under and the parameters they carried
 * (spec 019, R-37/R-38), from the runs the BA's sessions read. A screen whose states were never
 * visited since spec 019 has no entry, so older exports render unchanged.
 */
export function screenUrls(
  raw: RawDb,
  rendered: readonly ExportRecord[],
  runIds: ReadonlySet<string>,
): Record<string, StateInventory> {
  const visitsOf = raw.prepare(
    `SELECT id, run_id, state_id, edge_id, via, url, hops_json FROM page_visits
     WHERE state_id = ? ORDER BY created_at, rowid`,
  );
  const out: Record<string, StateInventory> = {};
  for (const screen of rendered) {
    if (screen.kind !== 'screen') continue;
    const states = new Set(
      screen.evidence
        .filter(
          (e) => (e.target_kind === 'state' || e.target_kind === 'screen_region') && !e.broken,
        )
        .map((e) => e.target_id),
    );
    const visits: VisitRow[] = [];
    for (const stateId of states)
      for (const v of visitsOf.all(stateId) as (Omit<VisitRow, 'hops'> & {
        run_id: string;
        hops_json: string;
      })[])
        if (runIds.size === 0 || runIds.has(v.run_id))
          visits.push({
            id: v.id,
            // one inventory per screen: its states' visits are pooled under the screen's key
            state_id: screen.key,
            edge_id: v.edge_id,
            via: v.via,
            url: v.url,
            hops: JSON.parse(v.hops_json) as VisitRow['hops'],
          });
    const [inventory] = parameterInventory(visits);
    if (inventory) out[screen.key] = inventory;
  }
  return out;
}
