/**
 * A hypothesis row by key, and the error the hypothesis writes and reads refuse with. Shared by
 * `agent-hypotheses.ts` and `agent-hypothesis-reads.ts`; only the error is public (`index.ts`).
 */
import type BetterSqlite3 from 'better-sqlite3';

type Raw = BetterSqlite3.Database;

export class HypothesisInputError extends Error {
  constructor(
    readonly code:
      'NO_MODEL' | 'TEST_REQUIRED' | 'CLAIM_REFUTED' | 'UNKNOWN_REF' | 'UNKNOWN_HYPOTHESIS',
    message: string,
  ) {
    super(message);
  }
}

export function hypothesisRow(raw: Raw, portal: string, key: string) {
  const h = raw
    .prepare(
      `SELECT id, key, kind, claim, claim_json, origin, rule, derived, confidence, fitness, precision,
         support, deviation_id, created_at FROM hypotheses WHERE portal_id = ? AND key = ?`,
    )
    .get(portal, key) as
    | {
        id: string;
        key: string;
        kind: string;
        claim: string;
        claim_json: string;
        origin: string;
        rule: string | null;
        derived: number;
        confidence: string;
        fitness: number | null;
        precision: number | null;
        support: number | null;
        deviation_id: string | null;
        created_at: string;
      }
    | undefined;
  if (!h) throw new HypothesisInputError('UNKNOWN_HYPOTHESIS', `no hypothesis ${key} on ${portal}`);
  return h;
}
