/**
 * Fingerprint profiles and the τ in force (spec 039 T112, T115; owner answers 3 and 7 of
 * 2026-10-20). The reconciler clusters the states of one profile only, never two; the τ it uses is
 * the one a person accepted for the portal and that profile, else the profile's
 * `cluster_threshold`. A calibrated τ is only a proposal until `pnpm model:decide accept-tau`.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { ROWS_V2, ROWS_V2_PROFILE } from '@pathfinder/fingerprint';

type Raw = BetterSqlite3.Database;

/** Rows from before 0033 carry no profile: they were fingerprinted with the built-in rows-v2. */
export const LEGACY_PROFILE = ROWS_V2_PROFILE.id;

/**
 * The profile the portal's model is built under: the one asked for, else the profile of the
 * portal's latest observation (what its YAML says now), else rows-v2.
 */
export function activeProfile(raw: Raw, portal: string, asked?: string): string {
  if (asked !== undefined) return asked;
  const latest = raw
    .prepare(
      `SELECT v.fingerprint_profile AS p FROM observations v JOIN runs r ON r.id = v.run_id
       WHERE r.portal_id = ? AND v.fingerprint_profile IS NOT NULL ORDER BY v.id DESC LIMIT 1`,
    )
    .get(portal) as { p: string } | undefined;
  return latest?.p ?? LEGACY_PROFILE;
}

/** The profile's own threshold, from its recorded rules (rows-v2's when it was never recorded). */
export function profileThreshold(raw: Raw, portal: string, profile: string): number {
  const row = raw
    .prepare('SELECT rules_json FROM fingerprint_profiles WHERE portal_id = ? AND id = ?')
    .get(portal, profile) as { rules_json: string } | undefined;
  const t = row
    ? (JSON.parse(row.rules_json) as { cluster_threshold?: unknown }).cluster_threshold
    : undefined;
  return typeof t === 'number' ? t : ROWS_V2.cluster_threshold;
}

export interface AcceptedTau {
  tau: number;
  labels: number;
  f1: number | null;
  acceptedBy: string;
  acceptedAt: string;
}

/** The latest τ a person accepted for the portal and profile; null when none. */
export function acceptedTau(raw: Raw, portal: string, profile: string): AcceptedTau | null {
  const row = raw
    .prepare(
      `SELECT tau, labels, f1, accepted_by, accepted_at FROM tau_acceptances
       WHERE portal_id = ? AND profile = ? ORDER BY accepted_at DESC, id DESC LIMIT 1`,
    )
    .get(portal, profile) as
    | { tau: number; labels: number; f1: number | null; accepted_by: string; accepted_at: string }
    | undefined;
  return row
    ? {
        tau: row.tau,
        labels: row.labels,
        f1: row.f1,
        acceptedBy: row.accepted_by,
        acceptedAt: row.accepted_at,
      }
    : null;
}

/** The τ the reconciler clusters with: accepted, else the profile's threshold. */
export function tauInForce(raw: Raw, portal: string, profile: string): number {
  return acceptedTau(raw, portal, profile)?.tau ?? profileThreshold(raw, portal, profile);
}
