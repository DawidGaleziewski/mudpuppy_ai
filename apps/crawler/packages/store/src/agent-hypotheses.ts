/**
 * Hypotheses the agents propose, and the reads the BA works from (spec 039 design § 10, T055).
 * The crawler's `add_hypothesis` and the BA's `propose_hypothesis` write here; a hypothesis needs a
 * test that could refute it, except the kinds a person's label or decision settles
 * (`NO_TEST_KINDS`). A claim equal to a refuted one is refused; an equal open one is returned.
 * Evidence goes in as typed references (`entity_refs`), never copied. Agents never confirm.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { z } from 'zod';
import { newId, nowIso } from '@pathfinder/core';
import { claimHash, NO_TEST_KINDS, statusOf, type HypothesisStatus } from '@pathfinder/model';
import { hypothesisKeys } from './interpret-writer.js';
import { hypothesisEvents } from './model-decide.js';

type Raw = BetterSqlite3.Database;

/** What an agent may propose (design § 10.3: the rest are a rule's or a person's). */
export const AGENT_HYPOTHESIS_KINDS = [
  'decision_rule',
  'ambiguous',
  'business_error_template',
  'same_as',
  'different_from',
  'process_boundary',
  'correlation_id',
  'ab_test',
  'nondeterministic',
  'backend_drift',
] as const;
export const AgentHypothesisKind = z.enum(AGENT_HYPOTHESIS_KINDS);
export type AgentHypothesisKind = z.infer<typeof AgentHypothesisKind>;

/** The kinds the crawler proposes (design § 10.4); the BA may propose every agent kind. */
export const CRAWLER_HYPOTHESIS_KINDS = [
  'decision_rule',
  'ambiguous',
  'business_error_template',
] as const;

/** A typed reference to evidence or a model object (design § 15). */
export const EvidenceRefInput = z
  .object({
    kind: z.enum([
      'observation',
      'transition',
      'state',
      'screen',
      'action_class',
      'model_transition',
      'network_call',
      'hypothesis',
    ]),
    /** The row id; a screen may be given by its key (`SC-0003`), a hypothesis by its (`H-0007`). */
    id: z.string().min(1),
    /** Only with `screen`: the model element key the claim is about. */
    element_key: z.string().min(1).optional(),
    role: z.enum(['supports', 'contradicts', 'context']).default('supports'),
  })
  .strict();
export type EvidenceRefInput = z.input<typeof EvidenceRefInput>;

/** A test that could refute the claim: the inputs a replay types, and what would refute it. */
export const HypothesisTestInput = z
  .object({
    inputs: z.record(z.string().min(1), z.union([z.string(), z.number()])).default({}),
    /** e.g. `{ "notIn": ["SC-0040 ok"] }`: an outcome outside the list refutes the claim. */
    refutes_if: z.record(z.string(), z.unknown()).refine((o) => Object.keys(o).length > 0, {
      message: 'say what would refute the claim',
    }),
  })
  .strict();
export type HypothesisTestInput = z.input<typeof HypothesisTestInput>;

export class HypothesisInputError extends Error {
  constructor(
    readonly code:
      'NO_MODEL' | 'TEST_REQUIRED' | 'CLAIM_REFUTED' | 'UNKNOWN_REF' | 'UNKNOWN_HYPOTHESIS',
    message: string,
  ) {
    super(message);
  }
}

const COLUMN: Record<z.infer<typeof EvidenceRefInput>['kind'], string> = {
  observation: 'observation_id',
  transition: 'transition_id',
  state: 'state_id',
  screen: 'screen_id',
  action_class: 'action_class_id',
  model_transition: 'model_transition_id',
  network_call: 'network_call_id',
  hypothesis: 'hypothesis_id',
};

/** The row id behind a reference, checked to belong to the portal. */
function resolveRef(raw: Raw, portal: string, ref: z.infer<typeof EvidenceRefInput>): string {
  const one = (sql: string, ...args: unknown[]) =>
    (raw.prepare(sql).get(...args) as { id: string } | undefined)?.id;
  const runOf = (table: string) =>
    one(
      `SELECT t.id FROM ${table} t JOIN runs r ON r.id = t.run_id WHERE t.id = ? AND r.portal_id = ?`,
      ref.id,
      portal,
    );
  const id = {
    observation: () => runOf('observations'),
    transition: () => runOf('transitions'),
    network_call: () => runOf('network_calls'),
    state: () => one('SELECT id FROM states WHERE id = ? AND portal_id = ?', ref.id, portal),
    screen: () =>
      one(
        'SELECT id FROM model_screens WHERE portal_id = ? AND (id = ? OR key = ?)',
        portal,
        ref.id,
        ref.id,
      ),
    action_class: () =>
      one(
        `SELECT a.id FROM action_classes a JOIN model_screens s ON s.id = a.screen_id
         WHERE a.id = ? AND s.portal_id = ?`,
        ref.id,
        portal,
      ),
    model_transition: () =>
      one(
        `SELECT t.id FROM model_transitions t JOIN model_screens s ON s.id = t.from_screen_id
         WHERE t.id = ? AND s.portal_id = ?`,
        ref.id,
        portal,
      ),
    hypothesis: () =>
      one(
        'SELECT id FROM hypotheses WHERE portal_id = ? AND (id = ? OR key = ?)',
        portal,
        ref.id,
        ref.id,
      ),
  }[ref.kind]();
  if (!id) throw new HypothesisInputError('UNKNOWN_REF', `no ${ref.kind} ${ref.id} on ${portal}`);
  if (ref.element_key !== undefined && ref.kind !== 'screen')
    throw new HypothesisInputError('UNKNOWN_REF', 'element_key goes with a screen reference');
  return id;
}

/** Write a typed reference and link it to the hypothesis. */
function linkEvidence(
  raw: Raw,
  hypothesisId: string,
  ref: z.infer<typeof EvidenceRefInput>,
  rowId: string,
): void {
  const refId = newId();
  raw
    .prepare(`INSERT INTO entity_refs (id, ${COLUMN[ref.kind]}, element_key) VALUES (?, ?, ?)`)
    .run(refId, rowId, ref.element_key ?? null);
  raw
    .prepare(
      'INSERT OR IGNORE INTO hypothesis_evidence (hypothesis_id, ref_id, role) VALUES (?, ?, ?)',
    )
    .run(hypothesisId, refId, ref.role);
}

function insertTest(
  raw: Raw,
  hypothesisId: string,
  t: z.infer<typeof HypothesisTestInput>,
  now: string,
) {
  const id = newId();
  raw
    .prepare(
      `INSERT INTO hypothesis_tests (id, hypothesis_id, inputs_json, refutes_if_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, hypothesisId, JSON.stringify(t.inputs), JSON.stringify(t.refutes_if), now);
  return id;
}

export const ProposeHypothesisInput = z
  .object({
    portal: z.string().min(1),
    kind: AgentHypothesisKind,
    /** One sentence a BA can read, in the portal's words. */
    claim: z.string().trim().min(1).max(600),
    /** The structured claim (a DMN table, two screens, a correlation key…); hashed to refuse repeats. */
    claim_json: z.record(z.string(), z.unknown()).default({}),
    evidence: z.array(EvidenceRefInput).min(1).max(30),
    tests: z.array(HypothesisTestInput).max(20).default([]),
    actor: z.string().min(1),
  })
  .strict();
export type ProposeHypothesisInput = z.input<typeof ProposeHypothesisInput>;

/**
 * Propose a hypothesis on the portal's latest model version. Returns its key, and whether it is
 * new (an equal open claim is returned as it is).
 */
export function proposeHypothesis(
  raw: Raw,
  input: ProposeHypothesisInput,
  now = nowIso(),
): { key: string; created: boolean } {
  const h = ProposeHypothesisInput.parse(input);
  if (h.tests.length === 0 && !NO_TEST_KINDS.has(h.kind))
    throw new HypothesisInputError(
      'TEST_REQUIRED',
      `a ${h.kind} hypothesis needs a test that could refute it (inputs and refutes_if)`,
    );
  return raw.transaction(() => {
    const version = raw
      .prepare('SELECT id FROM model_versions WHERE portal_id = ? ORDER BY seq DESC LIMIT 1')
      .get(h.portal) as { id: string } | undefined;
    if (!version) throw new HypothesisInputError('NO_MODEL', `${h.portal} has no portal model yet`);
    const claimJson = { claim: h.claim, ...h.claim_json };
    const hash = claimHash(h.kind, claimJson);
    for (const prior of raw
      .prepare('SELECT id, key FROM hypotheses WHERE portal_id = ? AND kind = ? AND claim_hash = ?')
      .all(h.portal, h.kind, hash) as { id: string; key: string }[]) {
      const status = statusOf(hypothesisEvents(raw, prior.id));
      if (status === 'refuted')
        throw new HypothesisInputError(
          'CLAIM_REFUTED',
          `${prior.key} made this claim and was refuted`,
        );
      if (status !== 'rejected' && status !== 'superseded')
        return { key: prior.key, created: false };
    }
    const refs = h.evidence.map((e) => ({ ref: e, row: resolveRef(raw, h.portal, e) }));
    const id = newId();
    const key = hypothesisKeys(raw, h.portal)();
    raw
      .prepare(
        `INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin, rule, derived,
           confidence, model_version_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'agent', NULL, 0, 'needs_confirmation', ?, ?)`,
      )
      .run(id, key, h.portal, h.kind, h.claim, JSON.stringify(claimJson), hash, version.id, now);
    for (const { ref, row } of refs) linkEvidence(raw, id, ref, row);
    for (const t of h.tests) insertTest(raw, id, t, now);
    raw
      .prepare(
        `INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at)
         VALUES (?, ?, NULL, 'proposed', ?, ?, ?)`,
      )
      .run(newId(), id, h.actor, `proposed by ${h.actor}`, now);
    return { key, created: true };
  })();
}

function hypothesisRow(raw: Raw, portal: string, key: string) {
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

/** Add a test to an open hypothesis (it then waits for the headless driver). */
export function addHypothesisTest(
  raw: Raw,
  input: { portal: string; key: string; test: HypothesisTestInput },
  now = nowIso(),
): { test_id: string } {
  const t = HypothesisTestInput.parse(input.test);
  const h = hypothesisRow(raw, input.portal, input.key);
  const status = statusOf(hypothesisEvents(raw, h.id));
  if (status !== 'proposed' && status !== 'testing' && status !== 'supported')
    throw new HypothesisInputError('UNKNOWN_HYPOTHESIS', `${input.key} is ${status}: no new tests`);
  return { test_id: insertTest(raw, h.id, t, now) };
}

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
