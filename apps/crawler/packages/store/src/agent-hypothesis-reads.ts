/**
 * The reads the BA works from (spec 039 design § 8, § 10, T055): the portal's hypotheses with
 * their test counts, one hypothesis in full, the deviations. The writes are in
 * `agent-hypotheses.ts`.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { statusOf, type HypothesisStatus } from '@mudpuppy/model';
import { hypothesisRow } from './hypothesis-row.js';
import { hypothesisEvents } from './model-decide.js';

type Raw = BetterSqlite3.Database;

export interface HypothesisSummary {
  key: string;
  kind: string;
  claim: string;
  status: HypothesisStatus;
  origin: string;
  rule: string | null;
  derived: boolean;
  tests: { total: number; pass: number; fail: number; inconclusive: number; untested: number };
}

/** The portal's hypotheses, newest first, optionally of one status or kind. */
export function listHypotheses(
  raw: Raw,
  portal: string,
  opts: { status?: HypothesisStatus; kind?: string; limit?: number } = {},
): HypothesisSummary[] {
  const rows = raw
    .prepare(
      `SELECT h.id, h.key, h.kind, h.claim, h.origin, h.rule, h.derived,
         (SELECT count(*) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id) AS total,
         (SELECT count(*) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id AND t.verdict = 'pass') AS pass,
         (SELECT count(*) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id AND t.verdict = 'fail') AS fail,
         (SELECT count(*) FROM hypothesis_tests t WHERE t.hypothesis_id = h.id AND t.verdict = 'inconclusive') AS inconclusive
       FROM hypotheses h WHERE h.portal_id = ? AND (? IS NULL OR h.kind = ?)
       ORDER BY h.created_at DESC, h.key DESC`,
    )
    .all(portal, opts.kind ?? null, opts.kind ?? null) as {
    id: string;
    key: string;
    kind: string;
    claim: string;
    origin: string;
    rule: string | null;
    derived: number;
    total: number;
    pass: number;
    fail: number;
    inconclusive: number;
  }[];
  return rows
    .map((r) => ({
      key: r.key,
      kind: r.kind,
      claim: r.claim,
      status: statusOf(hypothesisEvents(raw, r.id)),
      origin: r.origin,
      rule: r.rule,
      derived: r.derived === 1,
      tests: {
        total: r.total,
        pass: r.pass,
        fail: r.fail,
        inconclusive: r.inconclusive,
        untested: r.total - r.pass - r.fail - r.inconclusive,
      },
    }))
    .filter((h) => opts.status === undefined || h.status === opts.status)
    .slice(0, opts.limit ?? 100);
}

/** One hypothesis with its claim, evidence, tests and events. */
export function getHypothesis(raw: Raw, portal: string, key: string) {
  const h = hypothesisRow(raw, portal, key);
  const evidence = raw
    .prepare(
      `SELECT e.role, r.observation_id, r.transition_id, r.state_id, r.network_call_id, r.element_key,
         (SELECT key FROM model_screens WHERE id = r.screen_id) AS screen,
         (SELECT key FROM hypotheses WHERE id = r.hypothesis_id) AS hypothesis,
         r.action_class_id, r.model_transition_id
       FROM hypothesis_evidence e JOIN entity_refs r ON r.id = e.ref_id WHERE e.hypothesis_id = ?`,
    )
    .all(h.id) as Record<string, string | null>[];
  const tests = (
    raw
      .prepare(
        `SELECT id, inputs_json, refutes_if_json, result_json, verdict, run_id, created_at
         FROM hypothesis_tests WHERE hypothesis_id = ? ORDER BY created_at, id`,
      )
      .all(h.id) as {
      id: string;
      inputs_json: string;
      refutes_if_json: string;
      result_json: string | null;
      verdict: string | null;
      run_id: string | null;
      created_at: string;
    }[]
  ).map((t) => ({
    id: t.id,
    inputs: JSON.parse(t.inputs_json) as unknown,
    refutes_if: JSON.parse(t.refutes_if_json) as unknown,
    result: t.result_json ? (JSON.parse(t.result_json) as unknown) : null,
    verdict: t.verdict,
    run_id: t.run_id,
  }));
  const events = hypothesisEvents(raw, h.id);
  return {
    key: h.key,
    kind: h.kind,
    claim: h.claim,
    claim_json: JSON.parse(h.claim_json) as unknown,
    status: statusOf(events),
    origin: h.origin,
    rule: h.rule,
    derived: h.derived === 1,
    confidence: h.confidence,
    fit: { fitness: h.fitness, precision: h.precision, support: h.support },
    evidence: evidence.map((e) =>
      Object.fromEntries(Object.entries(e).filter(([, v]) => v !== null)),
    ),
    tests,
    events,
  };
}

/** The portal's deviations (design § 8), newest model version first. */
export function listDeviations(
  raw: Raw,
  portal: string,
  opts: { status?: 'open' | 'waiting_test' | 'explained'; limit?: number } = {},
) {
  return (
    raw
      .prepare(
        `SELECT d.kind, d.status, d.subject_key, d.before_json, d.after_json, mv.seq AS model_version,
           (SELECT key FROM model_screens WHERE id = d.screen_id) AS screen,
           (SELECT element_key FROM action_classes WHERE id = d.action_class_id) AS element_key,
           (SELECT group_concat(key) FROM hypotheses WHERE deviation_id = d.id) AS hypotheses
         FROM deviations d JOIN model_versions mv ON mv.id = d.model_version_id
         WHERE d.portal_id = ? AND (? IS NULL OR d.status = ?)
         ORDER BY mv.seq DESC, d.created_at DESC, d.id LIMIT ?`,
      )
      .all(portal, opts.status ?? null, opts.status ?? null, opts.limit ?? 100) as {
      kind: string;
      status: string;
      subject_key: string;
      before_json: string | null;
      after_json: string | null;
      model_version: number;
      screen: string | null;
      element_key: string | null;
      hypotheses: string | null;
    }[]
  ).map((d) => ({
    kind: d.kind,
    status: d.status,
    subject: d.subject_key,
    model_version: d.model_version,
    ...(d.screen ? { screen: d.screen } : {}),
    ...(d.element_key ? { element_key: d.element_key } : {}),
    before: d.before_json ? (JSON.parse(d.before_json) as unknown) : null,
    after: d.after_json ? (JSON.parse(d.after_json) as unknown) : null,
    hypotheses: d.hypotheses ? d.hypotheses.split(',') : [],
  }));
}
