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

type StateById = ReadonlyMap<string, ReconcileState>;

interface LayerATransition extends ReconcileTransition {
  fromScreen: string;
  toScreen: string | null;
}

/** 1. Parameter roles and route keys (design § 6.4, § 6.1 step 1). */
function routeKeysOf(
  input: ReconcileInput,
  stateById: StateById,
): Pick<ReconcileOutput, 'roles' | 'routeKeys'> {
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
  return { roles, routeKeys };
}

/** 2. Canonical clustering and stable ids (design § 6.1–6.2). */
function screensOf(
  input: ReconcileInput,
  routeKeys: ReadonlyMap<string, string>,
): Pick<ReconcileOutput, 'screens' | 'lineage' | 'conflicts'> {
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
    input.tau ?? MODEL_DEFAULTS.tau,
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
  return { screens, lineage, conflicts: clustering.conflicts };
}

/** Layer A transitions lifted to the screens of their states. */
function layerATransitions(
  transitions: readonly ReconcileTransition[],
  screenOfState: ReadonlyMap<string, string>,
): LayerATransition[] {
  return transitions.flatMap((t) => {
    const from = screenOfState.get(t.fromState);
    if (!from) return [];
    const to = t.toState === null ? null : (screenOfState.get(t.toState) ?? null);
    return [{ ...t, fromScreen: from, toScreen: to }];
  });
}

/**
 * A release is in force on every screen its portal part serves, visited since or not (spec 040
 * T036, F-10): a screen's current epoch is its parts' newest builds anywhere in the portal, so
 * a screen nobody looked at on the new release is untested there, not still active.
 */
function currentEpochs(
  visits: readonly ReconcileVisit[],
  screens: readonly ModelScreen[],
  screenOfState: ReadonlyMap<string, string>,
): Map<string, string> {
  const newest = new Map<string, { at: string; build: string }>();
  for (const v of visits)
    for (const b of v.builds) {
      const seen = newest.get(b.scope);
      if (!seen || compare(v.at, seen.at) > 0) newest.set(b.scope, { at: v.at, build: b.build });
    }
  const currentEpoch = new Map<string, string>();
  for (const s of screens) {
    const latest = visits
      .filter((v) => screenOfState.get(v.stateId) === s.id)
      .sort((a, b) => compare(b.at, a.at) || compare(b.id, a.id))[0];
    const now = latest?.builds.map((b) => ({ scope: b.scope, build: newest.get(b.scope)!.build }));
    currentEpoch.set(s.id, latest ? epochOfVisit({ ...latest, builds: now! }) : '');
  }
  return currentEpoch;
}

/** What coverage reads about the screens: visits per run and screen, executed keys. */
interface CoverageContext {
  stateById: StateById;
  visitsByRunScreen: ReadonlyMap<string, ReconcileVisit[]>;
  executed: ReadonlySet<string>;
}

/** Each run's look at one element key of a screen, per audience (design § 6.6). */
function looksAt(ctx: CoverageContext, screenId: string, key: string): RunLook[] {
  const looks: RunLook[] = [];
  for (const [rk, visits] of ctx.visitsByRunScreen) {
    const [runId, screen] = rk.split('\u0000') as [string, string];
    if (screen !== screenId) continue;
    for (const audience of new Set(visits.map((v) => v.audience))) {
      const mine = visits.filter((v) => v.audience === audience);
      const last = [...mine].sort((a, b) => compare(b.at, a.at))[0]!;
      looks.push({
        runId,
        runAt: [...mine].sort((a, b) => compare(a.at, b.at))[0]!.at,
        audience,
        epoch: epochOfVisit(last),
        present: mine.some((v) => ctx.stateById.get(v.stateId)?.elementKeys.includes(key)),
        executed: ctx.executed.has(`${runId}\u0000${screenId}\u0000${key}`),
      });
    }
  }
  return looks;
}

/** 3–4. Action classes and their coverage per audience (design § 6.5–6.6). */
function actionClassesOf(
  input: ReconcileInput,
  stateById: StateById,
  screens: readonly ModelScreen[],
  screenOfState: ReadonlyMap<string, string>,
  layerA: readonly LayerATransition[],
): ActionClassRow[] {
  // Every element key a member shows, plus every executed one (design § 6.5).
  const keysByScreen = new Map<string, string[]>();
  for (const s of screens)
    keysByScreen.set(s.id, [
      ...new Set(s.members.flatMap((m) => [...(stateById.get(m)?.elementKeys ?? [])])),
    ]);
  const global = globalKeys(keysByScreen, input.globalNavShare ?? MODEL_DEFAULTS.globalNavShare);
  const kindsByKey = new Map<string, Set<string>>();
  for (const t of layerA) {
    const k = `${t.fromScreen}\u0000${t.elementKey}`;
    kindsByKey.set(k, new Set([...(kindsByKey.get(k) ?? []), t.kind]));
  }
  const visitsByRunScreen = new Map<string, ReconcileVisit[]>();
  for (const v of input.visits) {
    const screen = screenOfState.get(v.stateId);
    if (!screen) continue;
    const k = `${v.runId}\u0000${screen}`;
    visitsByRunScreen.set(k, [...(visitsByRunScreen.get(k) ?? []), v]);
  }
  const ctx: CoverageContext = {
    stateById,
    visitsByRunScreen,
    executed: new Set(layerA.map((t) => `${t.runId}\u0000${t.fromScreen}\u0000${t.elementKey}`)),
  };
  const currentEpoch = currentEpochs(input.visits, screens, screenOfState);
  const actionClasses: ActionClassRow[] = [];
  for (const s of [...screens].sort((a, b) => compare(a.id, b.id))) {
    for (const key of [...(keysByScreen.get(s.id) ?? [])].sort(compare)) {
      const kinds = [...(kindsByKey.get(`${s.id}\u0000${key}`) ?? new Set(['click']))].sort(
        compare,
      );
      for (const kind of kinds) {
        const cov = coverageOf(
          looksAt(ctx, s.id, key),
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
  return actionClasses;
}

/** 6. Build epochs per scope and environment (design § 6.7). */
const epochsOf = (visits: readonly ReconcileVisit[]): BuildEpoch[] =>
  buildEpochs(
    visits.flatMap((v) =>
      v.builds.map((b) => ({
        id: v.id,
        at: v.at,
        scope: b.scope,
        environment: v.environment,
        build: b.build,
      })),
    ),
  );

export function reconcile(input: ReconcileInput): ReconcileOutput {
  const stateById = new Map(input.states.map((s) => [s.id, s]));
  const { roles, routeKeys } = routeKeysOf(input, stateById);
  const { screens, lineage, conflicts } = screensOf(input, routeKeys);
  const screenOfState = new Map<string, string>();
  for (const s of screens) for (const m of s.members) screenOfState.set(m, s.id);
  const layerA = layerATransitions(input.transitions, screenOfState);
  const actionClasses = actionClassesOf(input, stateById, screens, screenOfState, layerA);
  const statusOf = new Map(
    actionClasses.map((a) => [classKey(a.screen, a.elementKey, a.kind), a.status]),
  );

  // 5. Model transitions; their status follows their action class (design § 6.5–6.6).
  const transitions = foldTransitions(layerA).map((t) => ({
    ...t,
    status: statusOf.get(classKey(t.fromScreen, t.elementKey, t.kind)) ?? 'active',
  }));

  return {
    routeKeys,
    roles,
    screens,
    lineage,
    conflicts,
    actionClasses,
    transitions,
    epochs: epochsOf(input.visits),
  };
}
