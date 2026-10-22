/**
 * Re-fingerprint a portal under another profile, and compare two profiles (spec 039 T113, owner
 * answer 3 of 2026-10-20), from the snapshots the store already holds: no recrawl.
 *
 * A state keeps one snapshot (the first sighting: `states.evidence_ref`), and pages that were one
 * state under the capture profile share it. So a re-fingerprint can merge states into fewer
 * screens but never split one: a profile finer than the capture's needs a new scan (F-31@039).
 */
import type BetterSqlite3 from 'better-sqlite3';
import { maskText, nowIso } from '@mudpuppy/core';
import { computeComponents, minhashBlob, type FingerprintProfile } from '@mudpuppy/fingerprint';
import { clusterPortal, comparePartitions, type PartitionDifference } from '@mudpuppy/model';

type Raw = BetterSqlite3.Database;

/** The text of an evidence file, or null when it is gone. */
export type SnapshotReader = (evidenceRef: string) => string | null;

interface StateRow {
  id: string;
  fingerprint: string;
  route_template: string;
  title: string;
  evidence_ref: string;
}

function portalStates(raw: Raw, portal: string): StateRow[] {
  return raw
    .prepare(
      'SELECT id, fingerprint, route_template, title, evidence_ref FROM states WHERE portal_id = ? ORDER BY id',
    )
    .all(portal) as StateRow[];
}

/** Each state's snapshot, masked as the pipeline fingerprints it; the ids whose file is gone. */
function snapshotsOf(rows: readonly StateRow[], read: SnapshotReader) {
  const found = new Map<string, string>();
  const missing: string[] = [];
  for (const r of rows) {
    const text = read(r.evidence_ref);
    if (text === null) missing.push(r.id);
    else found.set(r.id, maskText(text));
  }
  return { found, missing };
}

export interface RefingerprintResult {
  profile: string;
  states: number;
  updated: number;
  /** States whose snapshot is gone; nothing is changed while there is one. */
  missing: string[];
}

/**
 * Recompute every state's components under `profile` and record it, so the next reconcile
 * clusters the portal under that profile. Refuses (changes nothing) while a snapshot is missing.
 * The calls and mounts hashes stay: a profile does not change what a page requested.
 */
export function refingerprintPortal(
  raw: Raw,
  portal: string,
  profile: FingerprintProfile,
  read: SnapshotReader,
): RefingerprintResult {
  const rows = portalStates(raw, portal);
  const { found, missing } = snapshotsOf(rows, read);
  const result = { profile: profile.id, states: rows.length, updated: 0, missing };
  if (missing.length > 0) return result;
  const empty = computeComponents({ routeTemplate: '', ariaSnapshot: '' });
  raw.transaction(() => {
    raw
      .prepare(
        `INSERT INTO fingerprint_profiles (portal_id, id, name, rules_json, first_seen)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT (portal_id, id) DO NOTHING`,
      )
      .run(portal, profile.id, profile.name, JSON.stringify(profile.rules), nowIso());
    const upsert = raw.prepare(
      `INSERT INTO state_components (state_id, structure_hash, content_hash, overlay_hash, calls_hash,
         mounts_hash, minhash, element_keys, profile) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (state_id) DO UPDATE SET structure_hash = excluded.structure_hash,
         content_hash = excluded.content_hash, overlay_hash = excluded.overlay_hash,
         minhash = excluded.minhash, element_keys = excluded.element_keys, profile = excluded.profile`,
    );
    for (const r of rows) {
      const c = computeComponents(
        { routeTemplate: r.route_template, ariaSnapshot: found.get(r.id)! },
        profile,
      );
      upsert.run(
        r.id,
        c.structureHash,
        c.contentHash,
        c.overlayHash,
        empty.callsHash,
        empty.mountsHash,
        minhashBlob(c.minhash),
        JSON.stringify(c.elementKeys),
        profile.id,
      );
      result.updated += 1;
    }
  })();
  return result;
}

export interface ProfileComparison extends PartitionDifference {
  a: string;
  b: string;
  /** Screens (clusters) under each profile. */
  screens: { a: number; b: number };
  /** State id → route and title, to print the differences. */
  states: Record<string, { route: string; title: string }>;
  missing: string[];
}

/**
 * Cluster the portal's states under both profiles (each with its own threshold, labels as
 * constraints, route templates as partitions) and say which screens merge or split differently.
 * Reads only.
 */
export function compareProfiles(
  raw: Raw,
  portal: string,
  a: FingerprintProfile,
  b: FingerprintProfile,
  read: SnapshotReader,
): ProfileComparison {
  const rows = portalStates(raw, portal);
  const { found, missing } = snapshotsOf(rows, read);
  const labels = raw
    .prepare('SELECT state_a, state_b, label FROM state_pair_labels WHERE portal_id = ?')
    .all(portal) as { state_a: string; state_b: string; label: string }[];
  const constraints = {
    mustLink: labels
      .filter((l) => l.label !== 'distinct')
      .map((l) => [l.state_a, l.state_b] as const),
    cannotLink: labels
      .filter((l) => l.label === 'distinct')
      .map((l) => [l.state_a, l.state_b] as const),
  };
  const usable = rows.filter((r) => found.has(r.id));
  const clusters = (p: FingerprintProfile) =>
    clusterPortal(
      usable.map((r) => ({
        id: r.id,
        fingerprint: r.fingerprint,
        routeKey: r.route_template,
        minhash: computeComponents(
          { routeTemplate: r.route_template, ariaSnapshot: found.get(r.id)! },
          p,
        ).minhash,
      })),
      constraints,
      p.rules.cluster_threshold,
    ).clusters;
  const ca = clusters(a);
  const cb = clusters(b);
  return {
    a: a.id,
    b: b.id,
    ...comparePartitions(ca, cb),
    screens: { a: ca.length, b: cb.length },
    states: Object.fromEntries(
      usable.map((r) => [r.id, { route: r.route_template, title: r.title }]),
    ),
    missing,
  };
}
