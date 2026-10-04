import { readFile } from 'node:fs/promises';
import { nowIso, type EvidenceStore, type PathfinderDb } from '@pathfinder/core';
import { GENERATOR_VERSION, renderWireframe } from '@pathfinder/wireframe';

/**
 * Draw a state's wireframe from its stored snapshot and record it (spec 008 FR-014–FR-016).
 * Derived data: an existing row is replaced, so a newer generator can redraw every state.
 */
export async function saveWireframe(
  ctx: { db: PathfinderDb; evidence: EvidenceStore },
  state: { id: string; title: string; ariaYaml: string },
): Promise<{ svg_ref: string; excalidraw_ref: string }> {
  const { svg, excalidraw } = renderWireframe(state.ariaYaml, { title: state.title });
  const svg_ref = await ctx.evidence.storeText(svg, 'svg');
  const excalidraw_ref = await ctx.evidence.storeText(excalidraw, 'excalidraw');
  const row = {
    generator_version: GENERATOR_VERSION,
    svg_ref,
    excalidraw_ref,
    created_at: nowIso(),
  };
  await ctx.db
    .insertInto('state_wireframes')
    .values({ state_id: state.id, ...row })
    .onConflict((oc) => oc.column('state_id').doUpdateSet(row))
    .execute();
  return { svg_ref, excalidraw_ref };
}

export interface RebuildReport {
  portal_id: string;
  states: number;
  drawn: number;
  /** States whose snapshot file could not be read. */
  missing_snapshot: string[];
}

/**
 * (Re)draw the wireframes of a portal's states (`wireframes:build`, spec 008 T032): states with no
 * wireframe or one from an older generator, or every state with `all`. Never touches Layer A facts.
 */
export async function rebuildWireframes(
  ctx: { db: PathfinderDb; evidence: EvidenceStore },
  portalId: string,
  opts: { all?: boolean } = {},
): Promise<RebuildReport> {
  const states = await ctx.db
    .selectFrom('states')
    .leftJoin('state_wireframes', 'state_wireframes.state_id', 'states.id')
    .select([
      'states.id',
      'states.title',
      'states.evidence_ref',
      'state_wireframes.generator_version',
    ])
    .where('states.portal_id', '=', portalId)
    .orderBy('states.id')
    .execute();
  const report: RebuildReport = {
    portal_id: portalId,
    states: states.length,
    drawn: 0,
    missing_snapshot: [],
  };
  for (const s of states) {
    if (!opts.all && s.generator_version === GENERATOR_VERSION) continue;
    let ariaYaml: string;
    try {
      ariaYaml = await readFile(ctx.evidence.resolve(s.evidence_ref), 'utf8');
    } catch {
      report.missing_snapshot.push(s.id);
      continue;
    }
    await saveWireframe(ctx, { id: s.id, title: s.title, ariaYaml });
    report.drawn += 1;
  }
  return report;
}
