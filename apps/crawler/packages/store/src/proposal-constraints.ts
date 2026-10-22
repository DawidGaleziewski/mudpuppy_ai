/**
 * A person's decisions on processes as constraints of the next `pnpm model:propose` (spec 039
 * design § 13.3, R-78 (d), T072; spec 040 T034): a later regroup never undoes a person's edit or
 * rejection. A community alike a dismissed proposal (80 % shared, or one screen more or less) is
 * not proposed again, and one that mostly lies inside a process a person keeps (accepted or
 * created, its as-is model as edited) is not proposed beside it. Screens are model screens.
 */
import type BetterSqlite3 from 'better-sqlite3';

type Raw = BetterSqlite3.Database;

/** Share of screens from which two sets count as the same process. */
export const SAME_PROCESS = 0.8;

export interface ProposalConstraints {
  dismissed: { name: string; screens: Set<string> }[];
  processes: { key: string; name: string; screens: Set<string> }[];
}

function screensOfStates(raw: Raw, states: readonly string[]): Set<string> {
  const of = raw.prepare(
    'SELECT screen_id FROM screen_members WHERE state_id = ? AND to_model_version IS NULL',
  );
  const out = new Set<string>();
  for (const s of states) {
    const row = of.get(s) as { screen_id: string } | undefined;
    if (row) out.add(row.screen_id);
  }
  return out;
}

const stateIds = (steps: string): string[] =>
  (JSON.parse(steps) as { state_id?: string | null }[])
    .map((s) => s.state_id)
    .filter((s): s is string => typeof s === 'string');

export function proposalConstraints(raw: Raw, portal: string): ProposalConstraints {
  const dismissed = (
    raw
      .prepare(
        "SELECT name, steps FROM grouping_suggestions WHERE portal_id = ? AND status = 'dismissed'",
      )
      .all(portal) as { name: string; steps: string }[]
  ).map((d) => ({ name: d.name, screens: screensOfStates(raw, stateIds(d.steps)) }));
  const processes = (
    raw
      .prepare(
        `SELECT p.key, p.name, r.steps FROM ba_processes p JOIN process_models m
           ON m.process_id = p.id AND m.label = 'A'
         JOIN process_model_revisions r ON r.model_id = m.id AND r.rev = m.rev
         WHERE p.portal_id = ? AND p.archived_at IS NULL`,
      )
      .all(portal) as { key: string; name: string; steps: string }[]
  ).map((p) => ({ key: p.key, name: p.name, screens: screensOfStates(raw, stateIds(p.steps)) }));
  return { dismissed, processes };
}

/** The same process: 80 % of the screens of both shared, or one screen more or less (F-19@039). */
function alike(a: Set<string>, b: Set<string>): boolean {
  const shared = [...a].filter((x) => b.has(x)).length;
  const union = a.size + b.size - shared;
  return shared > 0 && (shared / union >= SAME_PROCESS || union - shared <= 1);
}

/** Why a community of model screens is not proposed, or null when it may be. */
export function blockedBy(c: ProposalConstraints, community: readonly string[]): string | null {
  const set = new Set(community);
  const gone = c.dismissed.find((d) => alike(set, d.screens));
  if (gone) return `like the dismissed proposal "${gone.name}"`;
  const kept = c.processes.find(
    (p) => [...set].filter((s) => p.screens.has(s)).length >= SAME_PROCESS * set.size,
  );
  if (kept) return `inside ${kept.key} "${kept.name}", a process a person keeps`;
  return null;
}
