import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  Hypothesis,
  ProposedVerdict,
  ReconcileGroupKind,
  ReconciliationRow,
  ReconciliationStatus,
  Verdict,
} from '../src/index.js';

const SCHEMA_SQL = readFileSync(
  fileURLToPath(new URL('../../../../../data/schema/schema.sql', import.meta.url)),
  'utf-8',
);

/** The string list of `CHECK (<column> IN (...))` inside the `reconciliations` table. */
function checkList(column: string): string[] {
  const body = SCHEMA_SQL.match(/CREATE TABLE reconciliations \(([\s\S]+?)\) STRICT/)![1]!;
  const re = new RegExp(`\\b${column}\\s+TEXT[^\\n]*CHECK \\(${column} IN \\(([^)]+)\\)\\)`);
  return body
    .match(re)![1]!
    .split(',')
    .map((v) => v.trim().replace(/^'|'$/g, ''));
}

const ts = '2026-10-17T10:00:00.000Z';
const id = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('reconciliation schemas (spec 033)', () => {
  it('Zod enums equal the CHECK lists in schema.sql', () => {
    expect(ReconcileGroupKind.options).toEqual(checkList('group_kind'));
    expect(ReconciliationStatus.options).toEqual(checkList('status'));
    expect(Verdict.options).toHaveLength(8);
    expect(Hypothesis.options).toHaveLength(6);
  });

  it('ReconciliationRow: confirmed fields are set iff confirmed; reason is 1-400 chars', () => {
    const proposed = { state_id: id, verdict: 'main', hypothesis: 'persona', reason: 'Same form.' };
    const base = {
      id,
      portal_id: 'shop',
      group_key: 'action:abc',
      group_kind: 'action',
      snapshot_json: {},
      proposal_json: [proposed],
      proposed_by: 'BA',
      proposed_at: ts,
      status: 'proposed',
      confirmed_json: null,
      confirmed_by: null,
      confirmed_at: null,
    };
    expect(ReconciliationRow.safeParse(base).success).toBe(true);
    expect(ReconciliationRow.safeParse({ ...base, status: 'confirmed' }).success).toBe(false);
    const confirmed = {
      ...base,
      status: 'confirmed',
      confirmed_json: [{ state_id: id, verdict: 'main' }],
      confirmed_by: 'Ola',
      confirmed_at: ts,
    };
    expect(ReconciliationRow.safeParse(confirmed).success).toBe(true);
    expect(ReconciliationRow.safeParse({ ...confirmed, status: 'proposed' }).success).toBe(false);
    expect(ProposedVerdict.safeParse({ ...proposed, reason: '' }).success).toBe(false);
    expect(ProposedVerdict.safeParse({ ...proposed, reason: 'x'.repeat(401) }).success).toBe(false);
    expect(ProposedVerdict.safeParse({ ...proposed, verdict: 'other' }).success).toBe(false);
  });
});
