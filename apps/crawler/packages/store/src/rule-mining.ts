/**
 * Decision mining in the store (spec 039 design § 11): the observation tables of a portal's
 * decision points, and the import of what the miner (`apps/miner`) returns, validated with Zod
 * before it is written (constitution 6.0.0: Python writes only through this command). A mined
 * rule is a `decision_rule` hypothesis waiting for a person, with its boundary tests.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@pathfinder/core';
import {
  boundaryTests,
  claimHash,
  observationTables,
  type AttributeWrite,
  type DecisionTable,
  type Execution,
  type JourneyLink,
  type ObservationTable,
} from '@pathfinder/model';
import { z } from 'zod';

type Raw = BetterSqlite3.Database;

/** What `pathfinder-miner rules` prints: a decision table, or "needs data". */
export const MinedRule = z.union([
  z
    .object({
      decisionPoint: z
        .object({ screen: z.string().min(1), action: z.string().min(1) })
        .passthrough(),
      hitPolicy: z.enum(['U', 'C']),
      inputs: z.array(
        z.object({
          name: z.string().min(1),
          type: z.enum(['number', 'date', 'enum', 'bool', 'text']),
        }),
      ),
      outputs: z.array(z.object({ name: z.string(), type: z.string() })),
      rules: z
        .array(z.object({ when: z.record(z.string(), z.string()), then: z.string().min(1) }))
        .min(1),
      fitness: z.number().min(0).max(1),
      precision: z.number().min(0).max(1),
      rows: z.number().int().positive(),
    })
    .strict(),
  z
    .object({ needs_data: z.literal(true), rows_per_target: z.record(z.string(), z.number()) })
    .strict(),
]);
export type MinedRule = z.infer<typeof MinedRule>;

/** A table as the miner reads it, with the decision point named by screen key and element key. */
export interface MinerTable {
  decision_point: { screen: string; action: string; actionClass: string; epoch: string };
  types: Record<string, string>;
  rows: ObservationTable['rows'];
}

/** The observation tables of every decision point of the portal's current model. */
export function loadObservationTables(raw: Raw, portal: string): MinerTable[] {
  const screenOf = new Map<string, { id: string; key: string }>();
  for (const r of raw
    .prepare(
      `SELECT m.state_id, s.id, s.key FROM screen_members m JOIN model_screens s ON s.id = m.screen_id
       WHERE s.portal_id = ? AND m.to_model_version IS NULL`,
    )
    .all(portal) as { state_id: string; id: string; key: string }[])
    screenOf.set(r.state_id, { id: r.id, key: r.key });
  const executions: Execution[] = [];
  for (const e of raw
    .prepare(
      `SELECT e.journey_id, e.seq, e.from_state, e.to_state, e.element_key, e.kind, e.result, e.created_at,
         r.environment,
         (SELECT group_concat(x, '&') FROM (SELECT b.scope || '=' || b.id AS x FROM observation_builds ob
            JOIN builds b ON b.id = ob.build_id WHERE ob.observation_id = e.from_observation_id ORDER BY x)) AS builds
       FROM transitions e JOIN runs r ON r.id = e.run_id
       WHERE r.portal_id = ? AND e.journey_id IS NOT NULL AND e.status = 'executed'
         AND e.element_key IS NOT NULL AND e.kind IS NOT NULL AND e.result IS NOT NULL`,
    )
    .all(portal) as {
    journey_id: string;
    seq: number;
    from_state: string;
    to_state: string | null;
    element_key: string;
    kind: string;
    result: string;
    created_at: string;
    environment: string;
    builds: string | null;
  }[]) {
    const from = screenOf.get(e.from_state);
    if (!from) continue;
    const to = e.to_state ? screenOf.get(e.to_state) : undefined;
    executions.push({
      actionClass: `${from.id}\u0000${e.element_key}\u0000${e.kind}`,
      journeyId: e.journey_id,
      seq: e.seq,
      outcome: `${to?.key ?? 'none'} ${e.result}`,
      epoch: `${e.environment}|${e.builds ?? ''}`,
      at: e.created_at,
    });
  }
  const writes: AttributeWrite[] = (
    raw
      .prepare(
        `SELECT w.journey_id, w.seq, w.name, w.source, w.value_type, w.value_num, w.value_text
         FROM attribute_writes w JOIN journeys j ON j.id = w.journey_id JOIN runs r ON r.id = j.run_id
         WHERE r.portal_id = ?`,
      )
      .all(portal) as {
      journey_id: string;
      seq: number;
      name: string;
      source: AttributeWrite['source'];
      value_type: AttributeWrite['valueType'];
      value_num: number | null;
      value_text: string | null;
    }[]
  ).map((w) => ({
    journeyId: w.journey_id,
    seq: w.seq,
    name: w.name,
    source: w.source,
    valueType: w.value_type,
    valueNum: w.value_num,
    valueText: w.value_text,
  }));
  const journeys = new Map<string, JourneyLink>(
    (
      raw
        .prepare(
          `SELECT j.id, j.parent_journey_id, j.branch_seq FROM journeys j JOIN runs r ON r.id = j.run_id
           WHERE r.portal_id = ?`,
        )
        .all(portal) as {
        id: string;
        parent_journey_id: string | null;
        branch_seq: number | null;
      }[]
    ).map((j) => [j.id, { id: j.id, parentId: j.parent_journey_id, branchSeq: j.branch_seq }]),
  );
  const keyOfScreen = new Map([...screenOf.values()].map((s) => [s.id, s.key]));
  return observationTables(executions, writes, journeys).map((t) => {
    const [screen, action] = t.decisionPoint.actionClass.split('\u0000') as [string, string];
    return {
      decision_point: {
        screen: keyOfScreen.get(screen) ?? screen,
        action,
        actionClass: t.decisionPoint.actionClass,
        epoch: t.decisionPoint.epoch,
      },
      types: t.types,
      rows: t.rows,
    };
  });
}

/**
 * Write one mined rule as a `decision_rule` hypothesis (rule R7: a known action that leads to
 * different screens depending on data), waiting for a person, with its boundary tests. A rule
 * equal to one already recorded is not written again. Returns the key, or null when skipped.
 */
export function importMinedRule(
  raw: Raw,
  portal: string,
  table: MinerTable,
  minedRaw: unknown,
  now = nowIso(),
): string | null {
  const mined = MinedRule.parse(minedRaw);
  const version = raw
    .prepare('SELECT id FROM model_versions WHERE portal_id = ? ORDER BY seq DESC LIMIT 1')
    .get(portal) as { id: string } | undefined;
  if (!version) throw new Error(`portal ${portal} has no model version: reconcile first`);
  const claimJson = 'needs_data' in mined ? { table: table.decision_point, ...mined } : mined;
  const hash = claimHash('decision_rule', claimJson);
  const exists = raw
    .prepare(
      "SELECT 1 FROM hypotheses WHERE portal_id = ? AND kind = 'decision_rule' AND claim_hash = ?",
    )
    .get(portal, hash);
  if (exists) return null;
  const max = raw
    .prepare('SELECT max(CAST(substr(key, 3) AS INTEGER)) AS n FROM hypotheses WHERE portal_id = ?')
    .get(portal) as { n: number | null };
  const key = `H-${String((max.n ?? 0) + 1).padStart(4, '0')}`;
  const id = newId();
  const where = `${table.decision_point.action} on ${table.decision_point.screen}`;
  const claim =
    'needs_data' in mined
      ? `${where} leads to different screens depending on data; more rows are needed to state the rule.`
      : `A business rule decides where ${where} leads (${mined.rules.length} conditions, fitness ${mined.fitness}).`;
  raw
    .prepare(
      `INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin, rule, derived,
         confidence, fitness, precision, support, model_version_id, created_at)
       VALUES (?, ?, ?, 'decision_rule', ?, ?, ?, 'rule', 'R7', 0, 'needs_confirmation', ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      key,
      portal,
      claim,
      JSON.stringify(claimJson),
      hash,
      'needs_data' in mined ? null : mined.fitness,
      'needs_data' in mined ? null : mined.precision,
      table.rows.length,
      version.id,
      now,
    );
  raw
    .prepare(
      `INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at)
       VALUES (?, ?, NULL, 'proposed', 'miner', ?, ?)`,
    )
    .run(
      newId(),
      id,
      `mined from ${table.rows.length} executions; a person confirms the rule`,
      now,
    );
  if (!('needs_data' in mined)) writeBoundaryTests(raw, id, table, mined, now);
  return key;
}

function writeBoundaryTests(
  raw: Raw,
  hypothesisId: string,
  table: MinerTable,
  mined: DecisionTable,
  now: string,
): void {
  // The reference row: the first execution that followed the most common outcome.
  const counts = new Map<string, number>();
  for (const r of table.rows) counts.set(r.target, (counts.get(r.target) ?? 0) + 1);
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const reference = Object.fromEntries(
    Object.entries(table.rows.find((r) => r.target === common)!.features).filter(
      (e): e is [string, number | string] => e[1] !== null,
    ),
  );
  const seen: Record<string, string[]> = {};
  for (const input of mined.inputs)
    if (input.type !== 'number')
      seen[input.name] = [
        ...new Set(
          table.rows
            .map((r) => r.features[input.name])
            .filter((v) => v !== null)
            .map(String),
        ),
      ];
  const insert = raw.prepare(
    `INSERT INTO hypothesis_tests (id, hypothesis_id, inputs_json, refutes_if_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const t of boundaryTests(mined, reference, seen))
    insert.run(newId(), hypothesisId, JSON.stringify(t.inputs), JSON.stringify(t.refutesIf), now);
}
