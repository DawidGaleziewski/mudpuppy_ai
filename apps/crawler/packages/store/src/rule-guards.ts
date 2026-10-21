/**
 * Guard intersection after mining (spec 039 design § 11.6, T064): the decision rules still in play
 * are chained along the model's paths and each path whose guards cannot all hold becomes an
 * `ambiguous` hypothesis for a person, citing the rules on the path. A conflict already recorded
 * is not written again.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@pathfinder/core';
import { claimHash, guardConflicts, type HypothesisStatus } from '@pathfinder/model';
import { decisionRules } from './rule-export.js';

type Raw = BetterSqlite3.Database;

/** Rules whose guards count: everything not refuted, rejected or replaced. */
const IN_PLAY: readonly HypothesisStatus[] = ['proposed', 'testing', 'supported', 'confirmed'];

/** Write the portal's guard conflicts; returns the keys of the new `ambiguous` hypotheses. */
export function writeGuardConflicts(raw: Raw, portal: string, now = nowIso()): string[] {
  const rules = decisionRules(raw, portal).filter((r) => IN_PLAY.includes(r.status));
  const conflicts = guardConflicts(rules.map((r) => ({ key: r.key, table: r.table })));
  if (conflicts.length === 0) return [];
  const version = raw
    .prepare('SELECT id FROM model_versions WHERE portal_id = ? ORDER BY seq DESC LIMIT 1')
    .get(portal) as { id: string } | undefined;
  if (!version) return [];
  const idOf = new Map(
    (
      raw
        .prepare("SELECT id, key FROM hypotheses WHERE portal_id = ? AND kind = 'decision_rule'")
        .all(portal) as { id: string; key: string }[]
    ).map((r) => [r.key, r.id]),
  );
  const written: string[] = [];
  for (const c of conflicts) {
    const claimJson = { guard_conflict: c };
    const hash = claimHash('ambiguous', claimJson);
    const exists = raw
      .prepare(
        "SELECT 1 FROM hypotheses WHERE portal_id = ? AND kind = 'ambiguous' AND claim_hash = ?",
      )
      .get(portal, hash);
    if (exists) continue;
    const max = raw
      .prepare(
        'SELECT max(CAST(substr(key, 3) AS INTEGER)) AS n FROM hypotheses WHERE portal_id = ?',
      )
      .get(portal) as { n: number | null };
    const key = `H-${String((max.n ?? 0) + 1).padStart(4, '0')}`;
    const id = newId();
    const path = c.path
      .map((s) => s.screen)
      .concat(c.path.at(-1)!.to)
      .join(' → ');
    const claim =
      `The rules along ${path} cannot all hold for ${c.attributes.join(', ')}: ` +
      'one of them is wrong, or the value changes on the way.';
    raw
      .prepare(
        `INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin, rule,
           derived, confidence, model_version_id, created_at)
         VALUES (?, ?, ?, 'ambiguous', ?, ?, ?, 'rule', 'R7', 0, 'needs_confirmation', ?, ?)`,
      )
      .run(id, key, portal, claim, JSON.stringify(claimJson), hash, version.id, now);
    raw
      .prepare(
        `INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at)
         VALUES (?, ?, NULL, 'proposed', 'reconciler', ?, ?)`,
      )
      .run(newId(), id, 'the guards of the rules on this path have no value in common', now);
    for (const rule of new Set(c.path.map((s) => s.rule))) {
      const refId = newId();
      raw
        .prepare('INSERT INTO entity_refs (id, hypothesis_id, element_key) VALUES (?, ?, NULL)')
        .run(refId, idOf.get(rule)!);
      raw
        .prepare(
          "INSERT INTO hypothesis_evidence (hypothesis_id, ref_id, role) VALUES (?, ?, 'supports')",
        )
        .run(id, refId);
    }
    written.push(key);
  }
  return written;
}
