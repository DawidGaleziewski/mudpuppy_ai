/**
 * The labelling queue and τ calibration over the store (spec 039 design § 6.1, T037). Pairs are
 * compared within a route template (clustering never merges across routes); a person's label goes
 * in with `pnpm model:decide label`. Once each side has enough labels, the reconciler clusters
 * with the calibrated τ (`calibratedTau`).
 */
import type BetterSqlite3 from 'better-sqlite3';
import {
  calibrateTau,
  labellingQueue,
  MODEL_DEFAULTS,
  similarity,
  type Calibration,
  type CandidatePair,
} from '@pathfinder/model';

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

function states(raw: Raw, portal: string): StateRow[] {
  return raw
    .prepare(
      `SELECT s.id, s.route_template, s.title, c.minhash,
         (SELECT ms.key FROM screen_members m JOIN model_screens ms ON ms.id = m.screen_id
          WHERE m.state_id = s.id AND m.to_model_version IS NULL) AS screen
       FROM states s JOIN state_components c ON c.state_id = s.id
       WHERE s.portal_id = ? ORDER BY s.id`,
    )
    .all(portal) as StateRow[];
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
 * The calibration of the portal's labels (τ null until both sides have enough). Only labelled
 * pairs are compared: it runs on every reconcile.
 */
export function tauCalibration(raw: Raw, portal: string): Calibration {
  const rows = raw
    .prepare(
      `SELECT l.label, a.minhash AS ma, b.minhash AS mb FROM state_pair_labels l
       JOIN state_components a ON a.state_id = l.state_a JOIN state_components b ON b.state_id = l.state_b
       WHERE l.portal_id = ?`,
    )
    .all(portal) as { label: string; ma: Buffer; mb: Buffer }[];
  return calibrateTau(
    rows.map((r) => ({
      similarity: similarity(numbers(r.ma), numbers(r.mb)),
      same: r.label !== 'distinct',
    })),
  );
}

/** The τ the reconciler clusters with: calibrated when there are enough labels, else the default. */
export function calibratedTau(raw: Raw, portal: string): number {
  return tauCalibration(raw, portal).tau ?? MODEL_DEFAULTS.tau;
}

export interface QueuedPair {
  a: { id: string; title: string; screen: string | null };
  b: { id: string; title: string; screen: string | null };
  route: string;
  similarity: number;
  /** The model's current answer: both on one screen. */
  sameScreen: boolean;
}

/** The unlabelled pairs nearest the τ in use, for a person to label. */
export function pairsToLabel(
  raw: Raw,
  portal: string,
  opts: { limit?: number } = {},
): QueuedPair[] {
  const rows = states(raw, portal);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const known = labels(raw, portal);
  const open = routePairs(rows).filter((p) => !known.has(`${p.a}\u0000${p.b}`));
  return labellingQueue(open, calibratedTau(raw, portal), opts).map((p) => {
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
