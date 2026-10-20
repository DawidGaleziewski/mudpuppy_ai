/**
 * The reconciler's pure core (spec 039 design § 7): Layer A evidence plus recorded decisions in,
 * the portal model out. The same inputs give the same model whatever order the runs happened in;
 * the store's model writer loads the inputs and writes the difference. Pure.
 */
import { MODEL_DEFAULTS } from '../defaults.js';
import type { SimilarityClassifier } from './classifier.js';
import { clusterPortal, compare, type ClusterConstraints } from './clustering.js';
import {
  dominantRouteKey,
  parameterRoles,
  routeKey,
  type ParameterRole,
  type ParamId,
} from './parameter-roles.js';
import { assignScreens, lineageFor, type ExistingScreen, type Lineage } from './stable-ids.js';
import {
  buildEpochs,
  coverageOf,
  foldTransitions,
  globalKeys,
  type BuildEpoch,
  type CoverageStatus,
  type ModelTransitionRow,
  type RunLook,
} from './transitions.js';

export interface ReconcileState {
  id: string;
  fingerprint: string;
  routeTemplate: string;
  structureHash: string;
  minhash: readonly number[];
  elementKeys: readonly string[];
  /** Content, overlay, calls and mounts hashes, for the similarity classifier (T090). */
  hashes?: { content: string; overlay: string; calls: string; mounts: string };
}

export interface ReconcileVisit {
  id: string;
  runId: string;
  stateId: string;
  url: string;
  at: string;
  /** Who looked: persona and environment (F-12@039). */
  audience: string;
  environment: string;
  /** Build id per scope that served the visit. */
  builds: readonly { scope: string; build: string }[];
}

export interface ReconcileTransition {
  id: string;
  runId: string;
  fromState: string;
  toState: string | null;
  elementKey: string;
  kind: string;
  result: string;
  createdAt: string;
}

export interface ReconcileInput {
  states: readonly ReconcileState[];
  visits: readonly ReconcileVisit[];
  transitions: readonly ReconcileTransition[];
  /** The screen registry: ids survive through it (design § 6.2). */
  screens: readonly ExistingScreen[];
  constraints: ClusterConstraints;
  /** A person's parameter roles, keyed `template\u0000param`. */
  roleOverrides: ReadonlyMap<string, ParameterRole>;
  /** Action classes a confirmed `removed` hypothesis retired, keyed `screen\u0000elementKey\u0000kind`. */
  retired: ReadonlySet<string>;
  tau?: number;
  /** The similarity classifier the portal switched on (T090); replaces τ when given. */
  classifier?: SimilarityClassifier;
  globalNavShare?: number;
}

export interface ModelScreen {
  /** The existing screen's id, or `new:<n>` for one the writer creates. */
  id: string;
  members: string[];
  routeKey: string;
}

export interface ActionClassRow {
  screen: string;
  elementKey: string;
  kind: string;
  isGlobal: boolean;
  status: CoverageStatus;
  /** Consecutive runs that looked and missed it, per audience. */
  streak: Record<string, number>;
}

export interface ReconcileOutput {
  routeKeys: Map<string, string>;
  roles: Map<string, Map<ParamId, ParameterRole>>;
  screens: ModelScreen[];
  lineage: Lineage[];
  conflicts: string[][];
  actionClasses: ActionClassRow[];
  transitions: (ModelTransitionRow & { status: CoverageStatus })[];
  epochs: BuildEpoch[];
}

const classKey = (screen: string, elementKey: string, kind: string): string =>
  `${screen}\u0000${elementKey}\u0000${kind}`;

/** The epoch of a visit: the set of builds that served it (F-13@039). */
const epochOfVisit = (v: ReconcileVisit): string =>
  v.builds
    .map((b) => `${b.scope}=${b.build}`)
    .sort(compare)
    .join('&');

export function reconcile(input: ReconcileInput): ReconcileOutput {
  const tau = input.tau ?? MODEL_DEFAULTS.tau;
  const stateById = new Map(input.states.map((s) => [s.id, s]));

  // 1. Parameter roles and route keys (design § 6.4, § 6.1 step 1).
  const roles = parameterRoles(
    input.visits.flatMap((v) => {
      const s = stateById.get(v.stateId);
      return s
        ? [{ routeTemplate: s.routeTemplate, url: v.url, structureHash: s.structureHash }]
        : [];
    }),
    input.roleOverrides,
  );
  const keysOfState = new Map<string, string[]>();
  for (const v of input.visits) {
    const s = stateById.get(v.stateId);
    if (!s) continue;
    const k = routeKey(s.routeTemplate, v.url, roles.get(s.routeTemplate));
    keysOfState.set(s.id, [...(keysOfState.get(s.id) ?? []), k]);
  }
  const routeKeys = new Map<string, string>();
  for (const s of input.states)
    routeKeys.set(
      s.id,
      keysOfState.has(s.id) ? dominantRouteKey(keysOfState.get(s.id)!) : s.routeTemplate,
    );

  // 2. Canonical clustering and stable ids (design § 6.1–6.2).
  const clustering = clusterPortal(
    input.states.map((s) => ({
      id: s.id,
      fingerprint: s.fingerprint,
      routeKey: routeKeys.get(s.id)!,
      minhash: s.minhash,
      components: {
        minhash: s.minhash,
        structureHash: s.structureHash,
        elementKeys: s.elementKeys,
        ...(s.hashes ? { hashes: s.hashes } : {}),
      },
    })),
    input.constraints,
    tau,
    input.classifier,
  );
  const assigned = assignScreens(clustering.clusters, input.screens);
  let fresh = 0;
  const finalIds = assigned.map((id) => id ?? `new:${++fresh}`);
  const lineage = lineageFor(clustering.clusters, finalIds, input.screens);
  const screens: ModelScreen[] = clustering.clusters.map((members, i) => ({
    id: finalIds[i]!,
    members: [...members],
    routeKey: routeKeys.get(members[0]!)!,
  }));
  const screenOfState = new Map<string, string>();
  for (const s of screens) for (const m of s.members) screenOfState.set(m, s.id);

  // 3. Action classes: every element key a member shows, plus every executed one (design § 6.5).
  const keysByScreen = new Map<string, string[]>();
  for (const s of screens)
    keysByScreen.set(s.id, [
      ...new Set(s.members.flatMap((m) => [...(stateById.get(m)?.elementKeys ?? [])])),
    ]);
  const global = globalKeys(keysByScreen, input.globalNavShare ?? MODEL_DEFAULTS.globalNavShare);
  const layerA = input.transitions.flatMap((t) => {
    const from = screenOfState.get(t.fromState);
    if (!from) return [];
    const to = t.toState === null ? null : (screenOfState.get(t.toState) ?? null);
    return [{ ...t, fromScreen: from, toScreen: to }];
  });
  const kindsByKey = new Map<string, Set<string>>();
  for (const t of layerA) {
    const k = `${t.fromScreen}\u0000${t.elementKey}`;
    kindsByKey.set(k, new Set([...(kindsByKey.get(k) ?? []), t.kind]));
  }

  // 4. Coverage per action class and audience (design § 6.6).
  const visitsByRunScreen = new Map<string, ReconcileVisit[]>();
  for (const v of input.visits) {
    const screen = screenOfState.get(v.stateId);
    if (!screen) continue;
    const k = `${v.runId}\u0000${screen}`;
    visitsByRunScreen.set(k, [...(visitsByRunScreen.get(k) ?? []), v]);
  }
  const executed = new Set(
    layerA.map((t) => `${t.runId}\u0000${t.fromScreen}\u0000${t.elementKey}`),
  );
  const currentEpoch = new Map<string, string>();
  for (const s of screens) {
    const latest = input.visits
      .filter((v) => screenOfState.get(v.stateId) === s.id)
      .sort((a, b) => compare(b.at, a.at) || compare(b.id, a.id))[0];
    currentEpoch.set(s.id, latest ? epochOfVisit(latest) : '');
  }
  const actionClasses: ActionClassRow[] = [];
  for (const s of [...screens].sort((a, b) => compare(a.id, b.id))) {
    for (const key of [...(keysByScreen.get(s.id) ?? [])].sort(compare)) {
      const kinds = [...(kindsByKey.get(`${s.id}\u0000${key}`) ?? new Set(['click']))].sort(
        compare,
      );
      for (const kind of kinds) {
        const looks: RunLook[] = [];
        for (const [rk, visits] of visitsByRunScreen) {
          const [runId, screen] = rk.split('\u0000') as [string, string];
          if (screen !== s.id) continue;
          for (const audience of new Set(visits.map((v) => v.audience))) {
            const mine = visits.filter((v) => v.audience === audience);
            const last = [...mine].sort((a, b) => compare(b.at, a.at))[0]!;
            looks.push({
              runId,
              runAt: [...mine].sort((a, b) => compare(a.at, b.at))[0]!.at,
              audience,
              epoch: epochOfVisit(last),
              present: mine.some((v) => stateById.get(v.stateId)?.elementKeys.includes(key)),
              executed: executed.has(`${runId}\u0000${s.id}\u0000${key}`),
            });
          }
        }
        const cov = coverageOf(
          looks,
          currentEpoch.get(s.id)!,
          input.retired.has(classKey(s.id, key, kind)),
        );
        actionClasses.push({
          screen: s.id,
          elementKey: key,
          kind,
          isGlobal: global.has(key),
          status: cov.status,
          streak: Object.fromEntries([...cov.streak.entries()].sort((a, b) => compare(a[0], b[0]))),
        });
      }
    }
  }
  const statusOf = new Map(
    actionClasses.map((a) => [classKey(a.screen, a.elementKey, a.kind), a.status]),
  );

  // 5. Model transitions; their status follows their action class (design § 6.5–6.6).
  const transitions = foldTransitions(layerA).map((t) => ({
    ...t,
    status: statusOf.get(classKey(t.fromScreen, t.elementKey, t.kind)) ?? 'active',
  }));

  // 6. Build epochs per scope and environment (design § 6.7).
  const epochs = buildEpochs(
    input.visits.flatMap((v) =>
      v.builds.map((b) => ({
        id: v.id,
        at: v.at,
        scope: b.scope,
        environment: v.environment,
        build: b.build,
      })),
    ),
  );

  return {
    routeKeys,
    roles,
    screens,
    lineage,
    conflicts: clustering.conflicts,
    actionClasses,
    transitions,
    epochs,
  };
}
