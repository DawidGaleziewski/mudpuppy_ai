/**
 * The similarity classifier in the store (spec 039 FR-050, T090): the labelled pairs of a portal
 * and profile with their component features (what `pathfinder-miner classify` trains on), the
 * record of a training with its held-out F1 against τ, and the classifier the reconciler uses: the
 * latest training's, when it beat τ.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@pathfinder/core';
import {
  PAIR_FEATURES,
  pairFeatures,
  type PairComponents,
  type SimilarityClassifier,
} from '@pathfinder/model';
import { z } from 'zod';
import { LEGACY_PROFILE, activeProfile, tauInForce } from './fingerprint-profiles.js';
import { ModelDecisionError } from './model-decide.js';

type Raw = BetterSqlite3.Database;

/** What `pathfinder-miner classify` prints, checked before it is written. */
export const TrainedClassifier = z.object({
  ok: z.literal(true),
  names: z.array(z.string()),
  weights: z.array(z.number()),
  intercept: z.number(),
  labels: z.number().int().nonnegative(),
  held_out: z.number().int().nonnegative(),
  f1: z.number().min(0).max(1),
  tau_f1: z.number().min(0).max(1),
  better: z.boolean(),
});
export type TrainedClassifier = z.infer<typeof TrainedClassifier>;

const words = (blob: Buffer): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 4 <= blob.length; i += 4) out.push(blob.readUInt32BE(i));
  return out;
};

/** The components of every state of the portal under `profile`. */
export function stateComponents(raw: Raw, portal: string, profile: string) {
  const rows = raw
    .prepare(
      `SELECT c.state_id, c.structure_hash, c.content_hash, c.overlay_hash, c.calls_hash,
         c.mounts_hash, c.minhash, c.element_keys
       FROM state_components c JOIN states s ON s.id = c.state_id
       WHERE s.portal_id = ? AND coalesce(c.profile, ?) = ?`,
    )
    .all(portal, LEGACY_PROFILE, profile) as {
    state_id: string;
    structure_hash: string;
    content_hash: string;
    overlay_hash: string;
    calls_hash: string;
    mounts_hash: string;
    minhash: Buffer;
    element_keys: string;
  }[];
  return new Map(
    rows.map((r): [string, PairComponents] => [
      r.state_id,
      {
        minhash: words(r.minhash),
        structureHash: r.structure_hash,
        elementKeys: JSON.parse(r.element_keys) as string[],
        hashes: {
          content: r.content_hash,
          overlay: r.overlay_hash,
          calls: r.calls_hash,
          mounts: r.mounts_hash,
        },
      },
    ]),
  );
}

/** The miner's input: every labelled pair with both states' components, and τ in force. */
export function classifierTrainingSet(raw: Raw, portal: string, profile: string) {
  const components = stateComponents(raw, portal, profile);
  const labels = raw
    .prepare(
      `SELECT state_a, state_b, label FROM state_pair_labels WHERE portal_id = ?
       ORDER BY state_a, state_b`,
    )
    .all(portal) as { state_a: string; state_b: string; label: string }[];
  const pairs = labels.flatMap((l) => {
    const [a, b] = [components.get(l.state_a), components.get(l.state_b)];
    if (!a || !b) return [];
    return [
      {
        id: `${l.state_a}|${l.state_b}`,
        features: pairFeatures(a, b),
        same: l.label !== 'distinct',
      },
    ];
  });
  return {
    names: [...PAIR_FEATURES],
    pairs,
    tau: tauInForce(raw, portal, profile),
    similarity_index: PAIR_FEATURES.indexOf('minhash'),
  };
}

/** Record a training (the miner's output); returns its id. */
export function recordClassifier(
  raw: Raw,
  portal: string,
  profile: string,
  trainedRaw: unknown,
  tau: number,
  now = nowIso(),
): string {
  const t = TrainedClassifier.parse(trainedRaw);
  if (t.names.join(',') !== PAIR_FEATURES.join(','))
    throw new Error(`the classifier's features (${t.names.join(', ')}) are not this version's`);
  const id = newId();
  raw
    .prepare(
      `INSERT INTO similarity_classifiers (id, portal_id, profile, features, weights, intercept, labels,
         held_out, f1, tau, tau_f1, better, trained_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      portal,
      profile,
      JSON.stringify(t.names),
      JSON.stringify(t.weights),
      t.intercept,
      t.labels,
      t.held_out,
      t.f1,
      tau,
      t.tau_f1,
      t.better ? 1 : 0,
      now,
    );
  return id;
}

/**
 * The classifier the reconciler uses for the portal and profile: the latest one a person accepted
 * (owner answer 14: like τ, a classifier is in force only once a person accepts it).
 */
export function activeClassifier(
  raw: Raw,
  portal: string,
  profile: string,
): SimilarityClassifier | undefined {
  const row = raw
    .prepare(
      `SELECT weights, intercept FROM similarity_classifiers
       WHERE portal_id = ? AND profile = ? AND accepted_at IS NOT NULL
       ORDER BY accepted_at DESC, id DESC LIMIT 1`,
    )
    .get(portal, profile) as { weights: string; intercept: number } | undefined;
  if (!row) return undefined;
  return { weights: JSON.parse(row.weights) as number[], intercept: row.intercept };
}

/**
 * A person puts the latest training of the portal and profile in force (`pnpm model:decide …
 * accept-classifier`, or the τ page). Refused when there is none, or when it did not beat τ on the
 * held-out labels.
 */
export function acceptClassifier(
  raw: Raw,
  portal: string,
  opts: { by: string; profile?: string; now?: string },
): { id: string; profile: string; f1: number; tauF1: number } {
  const profile = activeProfile(raw, portal, opts.profile);
  const row = raw
    .prepare(
      `SELECT id, f1, tau_f1, better FROM similarity_classifiers
       WHERE portal_id = ? AND profile = ? ORDER BY trained_at DESC, id DESC LIMIT 1`,
    )
    .get(portal, profile) as { id: string; f1: number; tau_f1: number; better: number } | undefined;
  if (!row)
    throw new ModelDecisionError(
      `no classifier trained for ${portal} (${profile}) yet (pnpm model:classify)`,
    );
  if (row.better !== 1)
    throw new ModelDecisionError(
      `the latest classifier (F1 ${row.f1}) does not beat τ (F1 ${row.tau_f1}); τ stays in force`,
    );
  raw
    .prepare('UPDATE similarity_classifiers SET accepted_by = ?, accepted_at = ? WHERE id = ?')
    .run(opts.by, opts.now ?? nowIso(), row.id);
  return { id: row.id, profile, f1: row.f1, tauF1: row.tau_f1 };
}
