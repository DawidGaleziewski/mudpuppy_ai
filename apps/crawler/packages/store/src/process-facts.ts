/**
 * What the portal model knows about one process (spec 039 design § 13, § 14.2, § 16; T078), for
 * its export: the model version, the triggers its instances entered by, how they ended, the trace
 * variants, the explored bound of the latest pass, and the decision rules on its screens as DMN.
 */
import type BetterSqlite3 from 'better-sqlite3';
import {
  compare,
  explorationBound,
  toDmnXml,
  type HypothesisStatus,
  type ProcessInstance,
} from '@mudpuppy/model';
import { findProcessInstances, processShapes, screenOfState } from './process-instances.js';
import { decisionRules, EXPORTED_RULE_STATUSES } from './rule-export.js';

type Raw = BetterSqlite3.Database;

export interface ProcessModelFacts {
  /** The model version the facts come from (its `seq`); null before the first reconcile. */
  modelVersion: number | null;
  /** Ways in: the screen a trigger was pressed on and the element pressed, with how often. */
  triggers: { screen: string; element: string; count: number }[];
  /** Instances per outcome. */
  outcomes: Record<string, number>;
  /** Distinct screen sequences (screen keys), the most walked first. */
  variants: { screens: string[]; outcome: string; count: number }[];
  /** The latest pass's bound sentence, or null when the process was never explored. */
  explored: string | null;
  /** Decision rules decided on the process's screens, in an exported status, as DMN XML. */
  rules: { key: string; status: HypothesisStatus; dmn: string }[];
}

/** The trigger "screen" of instances entered by a URL (owner answer 10). */
export const DEEP_LINK = 'deep link';

/** The facts of the process with id `processId` (a PRC row). */
export function processModelFacts(raw: Raw, portal: string, processId: string): ProcessModelFacts {
  const version = raw
    .prepare('SELECT seq FROM model_versions WHERE portal_id = ? ORDER BY seq DESC LIMIT 1')
    .get(portal) as { seq: number } | undefined;
  const keyOf = new Map(
    (
      raw.prepare('SELECT id, key FROM model_screens WHERE portal_id = ?').all(portal) as {
        id: string;
        key: string;
      }[]
    ).map((r) => [r.id, r.key]),
  );
  const screenOf = screenOfState(raw, portal);
  const shape = processShapes(raw, portal, screenOf).find((p) => p.id === processId);
  const instances = findProcessInstances(raw, portal).filter((i) => i.processId === processId);
  const { triggers, outcomes, variants } = tallyInstances(raw, instances, keyOf, screenOf);
  const members = new Set([...(shape?.members ?? [])].map((s) => keyOf.get(s) ?? s));
  return {
    modelVersion: version?.seq ?? null,
    triggers,
    outcomes,
    variants,
    explored: exploredBound(raw, processId),
    rules: decisionRules(raw, portal)
      .filter(
        (r) =>
          EXPORTED_RULE_STATUSES.includes(r.status) && members.has(r.table.decisionPoint.screen),
      )
      .map((r) => ({ key: r.key, status: r.status, dmn: toDmnXml(r.table, r.key) })),
  };
}

const byCount = <T extends { count: number }>(a: T, b: T, ka: string, kb: string) =>
  b.count - a.count || compare(ka, kb);

/** Triggers, outcomes and trace variants of a process's instances, the most frequent first. */
function tallyInstances(
  raw: Raw,
  instances: readonly ProcessInstance[],
  keyOf: ReadonlyMap<string, string>,
  screenOf: ReadonlyMap<string, string>,
): Pick<ProcessModelFacts, 'triggers' | 'outcomes' | 'variants'> {
  const triggerOf = raw.prepare('SELECT from_state, element_key FROM transitions WHERE id = ?');
  const triggers = new Map<string, { screen: string; element: string; count: number }>();
  const outcomes: Record<string, number> = {};
  const variants = new Map<string, { screens: string[]; outcome: string; count: number }>();
  for (const i of instances) {
    const t = i.triggerTransitionId
      ? (triggerOf.get(i.triggerTransitionId) as
          { from_state: string; element_key: string | null } | undefined)
      : undefined;
    // A deep link has no screen it came from: the URL is the trigger.
    const screen =
      i.trigger === 'deep_link'
        ? DEEP_LINK
        : (keyOf.get(screenOf.get(t?.from_state ?? '') ?? '') ?? 'outside the model');
    const element = t?.element_key ?? '—';
    const k = `${screen}|${element}`;
    triggers.set(k, { screen, element, count: (triggers.get(k)?.count ?? 0) + 1 });
    outcomes[i.outcome] = (outcomes[i.outcome] ?? 0) + 1;
    const screens = i.screens.map((s) => keyOf.get(s) ?? s);
    const v = `${screens.join('>')}|${i.outcome}`;
    variants.set(v, { screens, outcome: i.outcome, count: (variants.get(v)?.count ?? 0) + 1 });
  }
  return {
    triggers: [...triggers.values()].sort((a, b) =>
      byCount(a, b, `${a.screen}|${a.element}`, `${b.screen}|${b.element}`),
    ),
    outcomes,
    variants: [...variants.values()].sort((a, b) =>
      byCount(a, b, a.screens.join('>'), b.screens.join('>')),
    ),
  };
}

/** The latest exploration pass's bound sentence, or null when the process was never explored. */
function exploredBound(raw: Raw, processId: string): string | null {
  const pass = raw
    .prepare(
      `SELECT epoch_set, depth, random_walks, new_deviations FROM process_explorations
       WHERE process_id = ? ORDER BY completed_at DESC LIMIT 1`,
    )
    .get(processId) as
    { epoch_set: string; depth: number; random_walks: number; new_deviations: number } | undefined;
  return pass
    ? explorationBound({
        depth: pass.depth,
        randomWalks: pass.random_walks,
        builds: buildsOf(raw, JSON.parse(pass.epoch_set) as string[]),
        newDeviations: pass.new_deviations,
      })
    : null;
}

/** `scope build` per epoch, as the bound names them ("shell 3e1a"). */
export function buildsOf(raw: Raw, epochs: readonly string[]): string[] {
  const get = raw.prepare(
    `SELECT e.scope, substr(replace(b.signature, 'marker:', ''), 1, 4) AS build
     FROM build_epochs e JOIN builds b ON b.id = e.build_id WHERE e.id = ?`,
  );
  return epochs.flatMap((id) => {
    const r = get.get(id) as { scope: string; build: string } | undefined;
    return r ? [`${r.scope} ${r.build}`] : [];
  });
}
