/**
 * The labelling queue and τ calibration over the store (spec 039 design § 6.1, T037). Pairs are
 * compared within a route template (clustering never merges across routes) and one fingerprint
 * profile (T112); a person's label goes in with `pnpm model:decide label`. Once each side has
 * enough labels the calibrated τ is proposed, and a person accepts it (`acceptTau`, T115).
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@mudpuppy/core';
import {
  calibrateTau,
  labellingQueue,
  similarity,
  type Calibration,
  type CandidatePair,
} from '@mudpuppy/model';
import {
  activeProfile,
  LEGACY_PROFILE,
  tauInForce,
  type AcceptedTau,
} from './fingerprint-profiles.js';
import { ModelDecisionError } from './model-decide.js';

type Raw = BetterSqlite3.Database;

interface StateRow {
  id: string;
  route_template: string;
  title: string;
  minhash: Buffer;
  screen: string | null;
}

function numbers(blob: Buffer): number[] {
  const out: number[] = [];
  for (let i = 0; i + 4 <= blob.length; i += 4) out.push(blob.readUInt32BE(i));
  return out;
}

/** The portal's states fingerprinted with `profile` (T112: never two profiles at once). */
function states(raw: Raw, portal: string, profile: string): StateRow[] {
  return raw
    .prepare(
      `SELECT s.id, s.route_template, s.title, c.minhash,
         (SELECT ms.key FROM screen_members m JOIN model_screens ms ON ms.id = m.screen_id
          WHERE m.state_id = s.id AND m.to_model_version IS NULL) AS screen
       FROM states s JOIN state_components c ON c.state_id = s.id
       WHERE s.portal_id = ? AND coalesce(c.profile, ?) = ? ORDER BY s.id`,
    )
    .all(portal, LEGACY_PROFILE, profile) as StateRow[];
}

function labels(raw: Raw, portal: string): Map<string, string> {
  const rows = raw
    .prepare('SELECT state_a, state_b, label FROM state_pair_labels WHERE portal_id = ?')
    .all(portal) as { state_a: string; state_b: string; label: string }[];
  return new Map(rows.map((r) => [`${r.state_a}\u0000${r.state_b}`, r.label]));
}

/** Every pair of page versions on one route template, with its similarity (ids in order). */
function routePairs(rows: readonly StateRow[]): CandidatePair[] {
  const byRoute = new Map<string, StateRow[]>();
  for (const r of rows)
    byRoute.set(r.route_template, [...(byRoute.get(r.route_template) ?? []), r]);
  const out: CandidatePair[] = [];
  const sig = new Map(rows.map((r) => [r.id, numbers(r.minhash)]));
  for (const group of byRoute.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        out.push({
          a: group[i]!.id,
          b: group[j]!.id,
          similarity:
            Math.round(similarity(sig.get(group[i]!.id)!, sig.get(group[j]!.id)!) * 1000) / 1000,
        });
  return out;
}

/**
 * The calibration of the portal's labels under one fingerprint profile (τ null until both sides
 * have enough). Only a proposal: the reconciler uses it once a person accepts it (T115).
 */
export function tauCalibration(raw: Raw, portal: string, profile?: string): Calibration {
  const p = activeProfile(raw, portal, profile);
  const rows = raw
    .prepare(
      `SELECT l.label, a.minhash AS ma, b.minhash AS mb FROM state_pair_labels l
       JOIN state_components a ON a.state_id = l.state_a JOIN state_components b ON b.state_id = l.state_b
       WHERE l.portal_id = ? AND coalesce(a.profile, ?) = ? AND coalesce(b.profile, ?) = ?`,
    )
    .all(portal, LEGACY_PROFILE, p, LEGACY_PROFILE, p) as {
    label: string;
    ma: Buffer;
    mb: Buffer;
  }[];
  return calibrateTau(
    rows.map((r) => ({
      similarity: similarity(numbers(r.ma), numbers(r.mb)),
      same: r.label !== 'distinct',
    })),
  );
}

/**
 * A person accepts the τ the pair labels calibrate to, for the portal and its profile (owner
 * answer 7, R-82). Refused while the labels do not calibrate one yet. The next reconcile clusters
 * with it.
 */
export function acceptTau(
  raw: Raw,
  portal: string,
  opts: { by: string; profile?: string; now?: string },
): AcceptedTau & { profile: string } {
  const profile = activeProfile(raw, portal, opts.profile);
  const cal = tauCalibration(raw, portal, profile);
  if (cal.tau === null)
    throw new ModelDecisionError(
      `no calibrated τ for ${portal} (${profile}) yet: ${cal.same} same / ${cal.distinct} distinct labels, ${cal.needed} of each needed (pnpm model:pairs)`,
    );
  const at = opts.now ?? nowIso();
  const labels = cal.same + cal.distinct;
  raw
    .prepare(
      `INSERT INTO tau_acceptances (id, portal_id, profile, tau, labels, f1, accepted_by, accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(newId(), portal, profile, cal.tau, labels, cal.f1, opts.by, at);
  return { profile, tau: cal.tau, labels, f1: cal.f1, acceptedBy: opts.by, acceptedAt: at };
}

export interface QueuedPair {
  a: { id: string; title: string; screen: string | null };
  b: { id: string; title: string; screen: string | null };
  route: string;
  similarity: number;
  /** The model's current answer: both on one screen. */
  sameScreen: boolean;
}

/** The unlabelled pairs nearest the τ in force, for a person to label. */
export function pairsToLabel(
  raw: Raw,
  portal: string,
  opts: { limit?: number; profile?: string } = {},
): QueuedPair[] {
  const profile = activeProfile(raw, portal, opts.profile);
  const rows = states(raw, portal, profile);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const known = labels(raw, portal);
  const open = routePairs(rows).filter((p) => !known.has(`${p.a}\u0000${p.b}`));
  const limit = opts.limit === undefined ? {} : { limit: opts.limit };
  return labellingQueue(open, tauInForce(raw, portal, profile), limit).map((p) => {
    const a = byId.get(p.a)!;
    const b = byId.get(p.b)!;
    return {
      a: { id: a.id, title: a.title, screen: a.screen },
      b: { id: b.id, title: b.title, screen: b.screen },
      route: a.route_template,
      similarity: p.similarity,
      sameScreen: a.screen !== null && a.screen === b.screen,
    };
  });
}
