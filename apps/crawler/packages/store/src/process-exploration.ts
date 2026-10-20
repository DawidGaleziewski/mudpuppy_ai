/**
 * Exploring a process (spec 039 design § 14.2, T075): what depth 1 and depth 2 still miss and the
 * random walks, as replays for the headless driver, each starting from a recorded way into the
 * screen it needs; the record of a completed pass (`process_explorations`); and the processes not
 * explored in the current build epochs (planner priority 6). A pass is complete when every gap had
 * a replay; it is "explored" when the pass found no new deviation.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@pathfinder/core';
import {
  explorationGaps,
  MODEL_DEFAULTS,
  randomWalks,
  type ExplorationGaps,
} from '@pathfinder/model';
import { processShapes, screenOfState } from './process-instances.js';
import { journeyPath } from './replay-tests.js';

type Raw = BetterSqlite3.Database;

/** One replay of an exploration pass. */
export interface ExplorationReplay {
  kind: 'depth1' | 'depth2' | 'walk';
  persona: string;
  environment: string;
  startUrl: string;
  /** Element keys pressed in order: the way in, then what the pass explores. */
  steps: string[];
  inputs: Record<string, string>;
  purpose: string;
}

export interface ExplorationPlan {
  processId: string;
  processKey: string;
  gaps: ExplorationGaps;
  replays: ExplorationReplay[];
  /** Gaps no recorded journey leads to (a focused map run would be needed). */
  unreachable: string[];
}

interface Arrival {
  persona: string;
  environment: string;
  startUrl: string;
  steps: string[];
}

/** The pressable action classes of the process's screens, with where each mostly leads. */
function classesOf(raw: Raw, members: ReadonlySet<string>) {
  const list = [...members];
  if (list.length === 0) return [];
  const marks = list.map(() => '?').join(',');
  const rows = raw
    .prepare(
      `SELECT a.id, a.screen_id, a.element_key, a.kind,
         (SELECT t.to_screen_id FROM model_transitions t WHERE t.action_class_id = a.id
            AND t.to_screen_id IS NOT NULL ORDER BY t.support DESC, t.id LIMIT 1) AS leads_to
       FROM action_classes a WHERE a.screen_id IN (${marks}) AND a.is_global = 0
         AND a.status <> 'retired' AND a.kind NOT IN ('fill', 'select', 'check') ORDER BY a.id`,
    )
    .all(...list) as {
    id: string;
    screen_id: string;
    element_key: string;
    kind: string;
    leads_to: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    screen: r.screen_id,
    leadsTo: r.leads_to,
    key: r.element_key,
    kind: r.kind,
  }));
}

/** What the portal's journeys executed (per persona) and executed back to back. */
function executions(
  raw: Raw,
  portal: string,
  screenOf: ReadonlyMap<string, string>,
  classOf: ReadonlyMap<string, string>,
) {
  const rows = raw
    .prepare(
      `SELECT t.journey_id, t.seq, t.from_state, t.element_key, t.kind, r.persona_id
       FROM transitions t JOIN runs r ON r.id = t.run_id
       WHERE r.portal_id = ? AND t.journey_id IS NOT NULL AND t.status = 'executed'
       ORDER BY t.journey_id, t.seq`,
    )
    .all(portal) as {
    journey_id: string;
    seq: number;
    from_state: string;
    element_key: string | null;
    kind: string | null;
    persona_id: string;
  }[];
  const executed = new Set<string>();
  const pairs = new Set<string>();
  let prev: { journey: string; cls: string | undefined } | null = null;
  for (const t of rows) {
    const cls = classOf.get(`${screenOf.get(t.from_state)}|${t.element_key}|${t.kind}`);
    if (cls) executed.add(`${t.persona_id}\u0000${cls}`);
    if (prev && prev.journey === t.journey_id && prev.cls && cls)
      pairs.add(`${prev.cls}\u0000${cls}`);
    prev = { journey: t.journey_id, cls };
  }
  return { executed, pairs };
}

/** The first recorded way onto each screen, per persona: a journey's first page or a transition. */
function arrivals(raw: Raw, portal: string, screenOf: ReadonlyMap<string, string>) {
  const out = new Map<string, Arrival>();
  const add = (
    persona: string,
    environment: string,
    screen: string | undefined,
    way: Pick<Arrival, 'startUrl' | 'steps'> | null,
  ) => {
    const k = `${persona}|${screen}`;
    if (screen && way && !out.has(k)) out.set(k, { ...way, persona, environment });
  };
  const starts = raw
    .prepare(
      `SELECT o.journey_id, o.state_id, r.persona_id, r.environment FROM observations o
       JOIN runs r ON r.id = o.run_id
       WHERE r.portal_id = ? AND o.journey_id IS NOT NULL
         AND o.seq = (SELECT min(x.seq) FROM observations x WHERE x.journey_id = o.journey_id)
       ORDER BY o.journey_id`,
    )
    .all(portal) as {
    journey_id: string;
    state_id: string;
    persona_id: string;
    environment: string;
  }[];
  for (const s of starts) {
    add(s.persona_id, s.environment, screenOf.get(s.state_id), journeyPath(raw, s.journey_id, 0));
  }
  const moves = raw
    .prepare(
      `SELECT t.journey_id, t.seq, t.to_state, r.persona_id, r.environment FROM transitions t
       JOIN runs r ON r.id = t.run_id
       WHERE r.portal_id = ? AND t.journey_id IS NOT NULL AND t.status = 'executed' AND t.to_state IS NOT NULL
       ORDER BY t.journey_id, t.seq`,
    )
    .all(portal) as {
    journey_id: string;
    seq: number;
    to_state: string;
    persona_id: string;
    environment: string;
  }[];
  for (const m of moves) {
    add(
      m.persona_id,
      m.environment,
      screenOf.get(m.to_state),
      journeyPath(raw, m.journey_id, m.seq),
    );
  }
  return out;
}

/** The replays a pass over process `processKey` needs; null when it has no A to explore. */
export function explorationPlan(
  raw: Raw,
  portal: string,
  processKey: string,
  opts: { walks?: number; walkLength?: number; seed?: number } = {},
): ExplorationPlan | null {
  const proc = raw
    .prepare('SELECT id, persona FROM ba_processes WHERE portal_id = ? AND key = ?')
    .get(portal, processKey) as { id: string; persona: string } | undefined;
  if (!proc) return null;
  const screenOf = screenOfState(raw, portal);
  const shape = processShapes(raw, portal, screenOf).find((p) => p.id === proc.id);
  if (!shape) return null;
  const classes = classesOf(raw, shape.members);
  const classOf = new Map(classes.map((c) => [`${c.screen}|${c.key}|${c.kind}`, c.id]));
  const byId = new Map(classes.map((c) => [c.id, c]));
  const { executed, pairs } = executions(raw, portal, screenOf, classOf);
  const ways = arrivals(raw, portal, screenOf);
  const personas = [
    ...new Set(
      [...ways.entries()]
        .filter(([k]) => shape.members.has(k.slice(k.indexOf('|') + 1)))
        .map(([, w]) => w.persona),
    ),
  ].sort();
  const audiences = personas.length > 0 ? personas : [proc.persona];
  const gaps = explorationGaps(classes, audiences, executed, pairs);
  const replays: ExplorationReplay[] = [];
  const unreachable: string[] = [];
  const plan = (
    kind: ExplorationReplay['kind'],
    persona: string,
    screen: string,
    keys: string[],
    gap: string,
  ) => {
    const way =
      ways.get(`${persona}|${screen}`) ??
      audiences.map((a) => ways.get(`${a}|${screen}`)).find(Boolean);
    if (!way) return void unreachable.push(gap);
    replays.push({
      kind,
      persona: way.persona,
      environment: way.environment,
      startUrl: way.startUrl,
      steps: [...way.steps, ...keys],
      inputs: {},
      purpose: `Explore ${processKey} (${kind}): ${keys.join(' → ')}`,
    });
  };
  for (const g of gaps.depth1) {
    const [persona, id] = g.split('\u0000') as [string, string];
    const c = byId.get(id)!;
    plan('depth1', persona, c.screen, [c.key], g);
  }
  for (const g of gaps.depth2) {
    const [a, b] = g.split('\u0000').map((x) => byId.get(x)!) as [
      (typeof classes)[number],
      (typeof classes)[number],
    ];
    plan('depth2', audiences[0]!, a.screen, [a.key, b.key], g);
  }
  const walks = randomWalks(classes, shape.startScreen, shape.members, {
    walks: opts.walks ?? MODEL_DEFAULTS.exploration.randomWalks,
    length: opts.walkLength ?? MODEL_DEFAULTS.exploration.walkLength,
    seed: opts.seed ?? 0,
  });
  walks.forEach((w, i) =>
    plan(
      'walk',
      audiences[0]!,
      shape.startScreen,
      w.map((id) => byId.get(id)!.key),
      `walk ${i + 1}`,
    ),
  );
  return { processId: proc.id, processKey, gaps, replays, unreachable };
}

/** The current build epoch of each scope and environment of the portal (ids, sorted). */
export function currentEpochs(raw: Raw, portal: string): string[] {
  const rows = raw
    .prepare(
      `SELECT e.id FROM build_epochs e JOIN model_versions v ON v.id = e.model_version_id
       WHERE e.portal_id = ? AND v.seq = (
         SELECT max(v2.seq) FROM build_epochs e2 JOIN model_versions v2 ON v2.id = e2.model_version_id
         WHERE e2.portal_id = e.portal_id AND e2.scope = e.scope AND e2.environment = e.environment)
       ORDER BY e.id`,
    )
    .all(portal) as { id: string }[];
  return rows.map((r) => r.id);
}

/** Record a completed pass over a process. */
export function recordExploration(
  raw: Raw,
  processId: string,
  pass: { epochs: readonly string[]; depth: number; randomWalks: number; newDeviations: number },
  now = nowIso(),
): string {
  const id = newId();
  raw
    .prepare(
      `INSERT INTO process_explorations (id, process_id, epoch_set, depth, random_walks, new_deviations, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      processId,
      JSON.stringify(pass.epochs),
      pass.depth,
      pass.randomWalks,
      pass.newDeviations,
      now,
    );
  return id;
}

/**
 * Planner priority 6 (design § 14.1): the portal's processes (with an A) that no pass explored
 * without new deviations on the current build epochs.
 */
export function unexploredProcesses(raw: Raw, portal: string): string[] {
  const epochs = JSON.stringify(currentEpochs(raw, portal));
  const rows = raw
    .prepare(
      `SELECT p.key FROM ba_processes p
       WHERE p.portal_id = ? AND p.archived_at IS NULL
         AND EXISTS (SELECT 1 FROM process_models m WHERE m.process_id = p.id AND m.label = 'A')
         AND NOT EXISTS (SELECT 1 FROM process_explorations x WHERE x.process_id = p.id
           AND x.epoch_set = ? AND x.new_deviations = 0)
       ORDER BY p.key`,
    )
    .all(portal, epochs) as { key: string }[];
  return rows.map((r) => r.key);
}
