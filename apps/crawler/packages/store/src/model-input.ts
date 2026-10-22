/**
 * What the reconciler reads for one portal (spec 039 design § 7): Layer A evidence and recorded
 * decisions as `reconcile`'s input, under one fingerprint profile (T112). Read-only; the model
 * writer (`model-writer.ts`) runs `reconcile` on it and writes the difference.
 */
import type BetterSqlite3 from 'better-sqlite3';
import type {
  ExistingScreen,
  ParameterRole,
  ReconcileInput,
  ReconcileState,
  ReconcileTransition,
  ReconcileVisit,
  SimilarityClassifier,
} from '@mudpuppy/model';

import { activeProfile, LEGACY_PROFILE, tauInForce } from './fingerprint-profiles.js';
import { activeClassifier } from './similarity-classifier.js';

type Raw = BetterSqlite3.Database;

/** Big-endian 128 × uint32 (fingerprint `minhashBlob`) back to numbers. */
function minhashOf(blob: Buffer): number[] {
  const out: number[] = [];
  for (let i = 0; i + 4 <= blob.length; i += 4) out.push(blob.readUInt32BE(i));
  return out;
}

function loadStates(raw: Raw, portal: string, profile: string): ReconcileState[] {
  return (
    raw
      .prepare(
        `SELECT s.id, s.fingerprint, s.route_template, c.structure_hash, c.minhash, c.element_keys,
           c.content_hash, c.overlay_hash, c.calls_hash, c.mounts_hash
         FROM states s JOIN state_components c ON c.state_id = s.id
         WHERE s.portal_id = ? AND coalesce(c.profile, ?) = ?`,
      )
      .all(portal, LEGACY_PROFILE, profile) as {
      id: string;
      fingerprint: string;
      route_template: string;
      structure_hash: string;
      minhash: Buffer;
      element_keys: string;
      content_hash: string;
      overlay_hash: string;
      calls_hash: string;
      mounts_hash: string;
    }[]
  ).map((s) => ({
    id: s.id,
    fingerprint: s.fingerprint,
    routeTemplate: s.route_template,
    structureHash: s.structure_hash,
    minhash: minhashOf(s.minhash),
    elementKeys: JSON.parse(s.element_keys) as string[],
    hashes: {
      content: s.content_hash,
      overlay: s.overlay_hash,
      calls: s.calls_hash,
      mounts: s.mounts_hash,
    },
  }));
}

function loadVisits(raw: Raw, portal: string, profile: string): ReconcileVisit[] {
  const buildsOf = new Map<string, { scope: string; build: string }[]>();
  for (const b of raw
    .prepare(
      `SELECT ob.observation_id AS visit, b.scope, b.id AS build FROM observation_builds ob
       JOIN builds b ON b.id = ob.build_id WHERE b.portal_id = ?`,
    )
    .all(portal) as { visit: string; scope: string; build: string }[])
    buildsOf.set(b.visit, [...(buildsOf.get(b.visit) ?? []), { scope: b.scope, build: b.build }]);
  return (
    raw
      .prepare(
        `SELECT v.id, v.run_id, v.state_id, v.url, v.created_at, r.persona_id, r.environment
         FROM observations v JOIN runs r ON r.id = v.run_id
         JOIN state_components c ON c.state_id = v.state_id
         WHERE r.portal_id = ? AND coalesce(c.profile, ?) = ?`,
      )
      .all(portal, LEGACY_PROFILE, profile) as {
      id: string;
      run_id: string;
      state_id: string;
      url: string;
      created_at: string;
      persona_id: string;
      environment: string;
    }[]
  ).map((v) => ({
    id: v.id,
    runId: v.run_id,
    stateId: v.state_id,
    url: v.url,
    at: v.created_at,
    audience: `${v.persona_id}@${v.environment}`,
    environment: v.environment,
    builds: buildsOf.get(v.id) ?? [],
  }));
}

function loadTransitions(raw: Raw, portal: string, profile: string): ReconcileTransition[] {
  return (
    raw
      .prepare(
        `SELECT e.id, e.run_id, e.from_state, e.to_state, e.element_key, e.kind, e.result, e.created_at
         FROM transitions e JOIN runs r ON r.id = e.run_id
         JOIN state_components c ON c.state_id = e.from_state
         WHERE r.portal_id = ? AND e.element_key IS NOT NULL AND e.kind IS NOT NULL AND e.result IS NOT NULL
           AND coalesce(c.profile, ?) = ?`,
      )
      .all(portal, LEGACY_PROFILE, profile) as {
      id: string;
      run_id: string;
      from_state: string;
      to_state: string | null;
      element_key: string;
      kind: string;
      result: string;
      created_at: string;
    }[]
  ).map((t) => ({
    id: t.id,
    runId: t.run_id,
    fromState: t.from_state,
    toState: t.to_state,
    elementKey: t.element_key,
    kind: t.kind,
    result: t.result,
    createdAt: t.created_at,
  }));
}

/** The screen registry with each screen's open members: ids survive through it. */
function loadScreenRegistry(raw: Raw, portal: string): ExistingScreen[] {
  const members = new Map<string, string[]>();
  for (const m of raw
    .prepare(
      `SELECT sm.screen_id, sm.state_id FROM screen_members sm JOIN model_screens s ON s.id = sm.screen_id
       WHERE s.portal_id = ? AND sm.to_model_version IS NULL`,
    )
    .all(portal) as { screen_id: string; state_id: string }[])
    members.set(m.screen_id, [...(members.get(m.screen_id) ?? []), m.state_id]);
  return (
    raw.prepare('SELECT id, status FROM model_screens WHERE portal_id = ?').all(portal) as {
      id: string;
      status: ExistingScreen['status'];
    }[]
  ).map((s) => ({ id: s.id, status: s.status, members: members.get(s.id) ?? [], anchoredDocs: 0 }));
}

/** A person's decisions: pair labels as must / cannot links, parameter roles. */
function loadDecisions(
  raw: Raw,
  portal: string,
): Pick<ReconcileInput, 'constraints' | 'roleOverrides'> {
  const labels = raw
    .prepare('SELECT state_a, state_b, label FROM state_pair_labels WHERE portal_id = ?')
    .all(portal) as { state_a: string; state_b: string; label: string }[];
  const roleOverrides = new Map<string, ParameterRole>(
    (
      raw
        .prepare(
          "SELECT route_template, param, role FROM parameter_roles WHERE portal_id = ? AND decided_by = 'person'",
        )
        .all(portal) as { route_template: string; param: string; role: ParameterRole }[]
    ).map((r) => [`${r.route_template}\u0000${r.param}`, r.role]),
  );
  return {
    constraints: {
      mustLink: labels
        .filter((l) => l.label !== 'distinct')
        .map((l) => [l.state_a, l.state_b] as const),
      cannotLink: labels
        .filter((l) => l.label === 'distinct')
        .map((l) => [l.state_a, l.state_b] as const),
    },
    roleOverrides,
  };
}

const withClassifier = (c: SimilarityClassifier | undefined) => (c ? { classifier: c } : {});

/**
 * Everything `reconcile` reads for one portal, under one fingerprint profile (T112): states whose
 * components another profile computed, and their observations and transitions, stay out.
 */
export function loadReconcileInput(
  raw: Raw,
  portal: string,
  profile: string = activeProfile(raw, portal),
): ReconcileInput {
  return {
    states: loadStates(raw, portal, profile),
    visits: loadVisits(raw, portal, profile),
    transitions: loadTransitions(raw, portal, profile),
    screens: loadScreenRegistry(raw, portal),
    ...loadDecisions(raw, portal),
    retired: new Set(),
    // The τ a person accepted for this profile (T115), else the profile's own threshold.
    tau: tauInForce(raw, portal, profile),
    // A classifier that beat τ on held-out labels replaces it (T090).
    ...withClassifier(activeClassifier(raw, portal, profile)),
  };
}
