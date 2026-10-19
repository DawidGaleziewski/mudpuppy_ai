/**
 * Decision drift (spec 039 design § 11.6, rule R8). A confirmed rule's passed boundary tests are
 * its regression suite. A new release on its decision screen (or `pnpm model:regress`) queues a
 * round: copies of the suite, replayed by the headless driver like any test. A failed regression
 * test is a `rule_mismatch` deviation (one per rule); R8 replays the failing test once: the
 * mismatch reproduces → `decision_drift`, derived, and the rule is superseded (re-mine it); it
 * does not → `flaky`. No new column: a regression test is a test row created after the rule's
 * confirmation.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@pathfinder/core';
import { classify, statusOf, type Deviation } from '@pathfinder/model';
import { hypothesisKeys, writeHypothesis } from './interpret-writer.js';
import { hypothesisEvents } from './model-decide.js';
import { outcomeOf, planForTest, type PendingReplay } from './replay-tests.js';

type Raw = BetterSqlite3.Database;

interface ConfirmedRule {
  id: string;
  key: string;
  claim_json: string;
  screen: string | null;
  confirmedAt: string;
}

function confirmedRules(raw: Raw, portal: string): ConfirmedRule[] {
  const rows = raw
    .prepare(
      `SELECT h.id, h.key, h.claim_json, s.id AS screen FROM hypotheses h
       LEFT JOIN model_screens s ON s.portal_id = h.portal_id
         AND s.key = json_extract(h.claim_json, '$.decisionPoint.screen')
       WHERE h.portal_id = ? AND h.kind = 'decision_rule' ORDER BY h.key`,
    )
    .all(portal) as { id: string; key: string; claim_json: string; screen: string | null }[];
  const out: ConfirmedRule[] = [];
  for (const r of rows) {
    const events = hypothesisEvents(raw, r.id);
    if (statusOf(events) !== 'confirmed') continue;
    const at = events.filter((e) => e.to === 'confirmed').at(-1)!.at;
    out.push({ ...r, confirmedAt: at });
  }
  return out;
}

/** The sorted `scope=build` set of the screen's latest visit at or before `at` (any time: null). */
function buildsOfScreen(raw: Raw, screen: string, at: string | null): string | null {
  const row = raw
    .prepare(
      `SELECT (SELECT group_concat(x, '&') FROM (SELECT b.scope || '=' || b.id AS x FROM observation_builds ob
                JOIN builds b ON b.id = ob.build_id WHERE ob.page_visit_id = v.id ORDER BY x)) AS builds
       FROM page_visits v JOIN screen_members m ON m.state_id = v.state_id AND m.to_model_version IS NULL
       WHERE m.screen_id = ? ${at ? 'AND v.created_at <= ?' : ''}
       ORDER BY v.created_at DESC, v.id DESC LIMIT 1`,
    )
    .get(...(at ? [screen, at] : [screen])) as { builds: string | null } | undefined;
  return row ? (row.builds ?? '') : null;
}

/**
 * Queue a regression round for every confirmed rule whose decision screen shows another release
 * since its last round (or for all of them with `all`). Returns the rule keys queued.
 */
export function queueRegressions(
  raw: Raw,
  portal: string,
  opts: { all?: boolean; now?: string } = {},
): string[] {
  const now = opts.now ?? nowIso();
  const queued: string[] = [];
  const tests = raw.prepare(
    'SELECT inputs_json, refutes_if_json, verdict, created_at FROM hypothesis_tests WHERE hypothesis_id = ? ORDER BY created_at, id',
  );
  const insert = raw.prepare(
    `INSERT INTO hypothesis_tests (id, hypothesis_id, inputs_json, refutes_if_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const rule of confirmedRules(raw, portal)) {
    const all = tests.all(rule.id) as {
      inputs_json: string;
      refutes_if_json: string;
      verdict: string | null;
      created_at: string;
    }[];
    const suite = all.filter((t) => t.created_at <= rule.confirmedAt && t.verdict === 'pass');
    const rounds = all.filter((t) => t.created_at > rule.confirmedAt);
    if (suite.length === 0 || rounds.some((t) => t.verdict === null)) continue;
    const lastRound = rounds.at(-1)?.created_at ?? rule.confirmedAt;
    const released =
      rule.screen !== null &&
      buildsOfScreen(raw, rule.screen, null) !== buildsOfScreen(raw, rule.screen, lastRound);
    if (!opts.all && !released) continue;
    for (const t of suite) insert.run(newId(), rule.id, t.inputs_json, t.refutes_if_json, now);
    queued.push(rule.key);
  }
  return queued;
}

/**
 * A `rule_mismatch` deviation for each confirmed rule a regression test failed (one per rule),
 * waiting for R8's replay. Returns the deviation ids written.
 */
export function recordRuleMismatches(raw: Raw, portal: string, now = nowIso()): string[] {
  const version = raw
    .prepare('SELECT id FROM model_versions WHERE portal_id = ? ORDER BY seq DESC LIMIT 1')
    .get(portal) as { id: string } | undefined;
  if (!version) return [];
  const written: string[] = [];
  for (const rule of confirmedRules(raw, portal)) {
    const failed = raw
      .prepare(
        `SELECT id, refutes_if_json, result_json FROM hypothesis_tests
         WHERE hypothesis_id = ? AND verdict = 'fail' AND created_at > ? ORDER BY created_at, id LIMIT 1`,
      )
      .get(rule.id, rule.confirmedAt) as
      { id: string; refutes_if_json: string; result_json: string } | undefined;
    if (!failed || rule.screen === null) continue;
    const subject = `rule_mismatch:${rule.key}`;
    const id = newId();
    const done = raw
      .prepare(
        `INSERT OR IGNORE INTO deviations (id, portal_id, model_version_id, kind, subject_key, screen_id,
           before_json, after_json, status, created_at)
         VALUES (?, ?, ?, 'rule_mismatch', ?, ?, ?, ?, 'waiting_test', ?)`,
      )
      .run(
        id,
        portal,
        version.id,
        subject,
        rule.screen,
        JSON.stringify({
          rule: rule.key,
          expected: (JSON.parse(failed.refutes_if_json) as { notIn: string[] }).notIn,
        }),
        JSON.stringify({
          test: failed.id,
          outcome: (JSON.parse(failed.result_json) as { outcome: string }).outcome,
        }),
        now,
      );
    if (done.changes > 0) written.push(id);
  }
  return written;
}

export interface PendingMismatchReplay {
  deviationId: string;
  plan: PendingReplay;
}

interface MismatchRow {
  id: string;
  subject_key: string;
  screen_id: string;
  model_version_id: string;
  before_json: string;
  after_json: string;
}

function waitingMismatches(raw: Raw, portal: string): MismatchRow[] {
  return raw
    .prepare(
      `SELECT d.id, d.subject_key, d.screen_id, d.model_version_id, d.before_json, d.after_json
       FROM deviations d WHERE d.portal_id = ? AND d.kind = 'rule_mismatch' AND d.status = 'waiting_test'
         AND NOT EXISTS (SELECT 1 FROM hypotheses h WHERE h.deviation_id = d.id)
       ORDER BY d.created_at, d.id`,
    )
    .all(portal) as MismatchRow[];
}

/** R8's replays: the failing regression test of each waiting rule mismatch, once. */
export function pendingMismatchReplays(
  raw: Raw,
  portal: string,
  opts: { limit?: number; today?: string } = {},
): PendingMismatchReplay[] {
  const out: PendingMismatchReplay[] = [];
  for (const d of waitingMismatches(raw, portal)) {
    if (opts.limit !== undefined && out.length >= opts.limit) break;
    const testId = (JSON.parse(d.after_json) as { test: string }).test;
    const t = raw
      .prepare(
        `SELECT t.id, t.inputs_json, h.key, h.claim_json FROM hypothesis_tests t
         JOIN hypotheses h ON h.id = t.hypothesis_id WHERE t.id = ?`,
      )
      .get(testId) as { id: string; inputs_json: string; key: string; claim_json: string };
    const plan = planForTest(raw, portal, t, opts.today ?? nowIso());
    if (typeof plan === 'string') continue;
    out.push({
      deviationId: d.id,
      plan: { ...plan, purpose: `rule R8: does the mismatch of ${t.key} reproduce (headless)` },
    });
  }
  return out;
}

/**
 * Classify a waiting rule mismatch with R8's replay (`seen`: where it ended; null when it
 * diverged, then it keeps waiting). Reproduced → `decision_drift`, derived, and the rule is
 * superseded; not reproduced → `flaky`. Returns the hypothesis key written.
 */
export function resolveRuleMismatch(
  raw: Raw,
  portal: string,
  deviationId: string,
  seen: { state_id: string; edge_id: string | null } | null,
  now = nowIso(),
): string | null {
  const d = waitingMismatches(raw, portal).find((x) => x.id === deviationId);
  const outcome = seen ? outcomeOf(raw, seen) : null;
  if (!d || outcome === null) return null;
  const failing = (JSON.parse(d.after_json) as { outcome: string }).outcome;
  const decision = classify({
    kind: 'rule_mismatch',
    result: 'ok',
    buildChanged: false,
    schemaChanged: false,
    contextDiffers: false,
    sameEpochAndAudience: true,
    presentForOtherAudience: false,
    newActionSameScreens: false,
    replays: { ruleReproduced: outcome === failing },
  });
  if (decision.decision !== 'hypothesis') return null;
  const ruleKey = (JSON.parse(d.before_json) as { rule: string }).rule;
  const deviation: Deviation = {
    kind: 'rule_mismatch',
    subjectKey: d.subject_key,
    screen: d.screen_id,
  };
  const key = hypothesisKeys(raw, portal)();
  return raw.transaction(() => {
    writeHypothesis(raw, {
      portal,
      versionId: d.model_version_id,
      deviationId: d.id,
      deviation,
      decision,
      key,
      now,
    });
    raw.prepare("UPDATE deviations SET status = 'explained' WHERE id = ?").run(d.id);
    if (decision.kind === 'decision_drift') supersede(raw, portal, ruleKey, key, now);
    return key;
  })();
}

function supersede(raw: Raw, portal: string, ruleKey: string, by: string, now: string): void {
  const rule = raw
    .prepare('SELECT id FROM hypotheses WHERE portal_id = ? AND key = ?')
    .get(portal, ruleKey) as { id: string };
  const reason = `decision drift (${by}, rule R8): the rule no longer holds; re-mine it on the new release`;
  const events = hypothesisEvents(raw, rule.id);
  statusOf([...events, { to: 'superseded', actor: 'reconciler', reason, at: now }]);
  raw
    .prepare(
      'INSERT INTO hypothesis_events (id, hypothesis_id, from_status, to_status, actor, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(newId(), rule.id, statusOf(events), 'superseded', 'reconciler', reason, now);
}
