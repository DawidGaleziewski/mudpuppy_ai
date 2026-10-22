import type { DocKind, RelationType } from '@mudpuppy/docs-model';
import { EVIDENCE_COLUMN } from '@mudpuppy/store';
import { formatKey } from '../keys.js';
import type { FixtureStore, TraceFixture } from './fixture-store.js';
import { contactItems, followups, questions, vehicleItems } from './seeds/data.js';
import { glossary, requirements, rules } from './seeds/rules.js';
import { calculatorScreens, capabilities, otherScreens, processes } from './seeds/screens.js';
import type { RevSpec, Seed, SeedContext } from './seeds/types.js';

/** `FIXTURE_TS` plus `m` minutes: revisions and reviews get distinct, ordered times. */
export const seedTs = (m: number): string => new Date(Date.UTC(2026, 0, 15, 10, m)).toISOString();

export interface SeededDocs {
  /** Record key → record id. */
  ids: Record<string, string>;
  sessionId: string;
  trace: TraceFixture;
  boundary: TraceFixture;
}

/** The writer's state: ids, sequence numbers per kind, relations to write last, the clock. */
interface SeedState {
  fx: FixtureStore;
  sessionId: string;
  ids: Record<string, string>;
  seqs: Map<DocKind, number>;
  pending: { from: string; to: string; type: RelationType }[];
  clock: number;
}

/** The records in the order they are written (their keys and ids depend on it). */
const SECTIONS: readonly ((ctx: SeedContext) => Seed[])[] = [
  capabilities,
  calculatorScreens,
  otherScreens,
  processes,
  requirements,
  rules,
  glossary,
  vehicleItems,
  contactItems,
  questions,
];

const tick = (s: SeedState): string => seedTs(++s.clock);

/** Spec 039 T070: a PROC record documents its own process; its id is derived from the seq. */
function insertProcess(
  s: SeedState,
  { seq, key, title }: { seq: number; key: string; title: string },
) {
  const processId = `00000000-0000-7000-9000-${String(seq).padStart(12, '0')}`;
  const created = seedTs(s.clock + 1);
  s.fx.raw
    .prepare(
      `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, scope_id,
         suggestion_id, created_at, updated_at, archived_at, record_key)
       VALUES (?, ?, ?, ?, 'guest', 'scoped', 1, 'new', NULL, NULL, ?, ?, NULL, ?)`,
    )
    .run(
      processId,
      s.fx.portalId,
      `PRC-${String(seq).padStart(3, '0')}`,
      title,
      created,
      created,
      key,
    );
  return processId;
}

/** One revision with its evidence links (typed refs, spec 039 § 15) and reviews; returns its time. */
function insertRevision(
  s: SeedState,
  { recordId, rev, i }: { recordId: string; rev: RevSpec; i: number },
): string {
  const { raw, nextId } = s.fx;
  const revisionId = nextId();
  let updated = tick(s);
  raw
    .prepare(
      `INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json, confidence,
       not_observable, status, change_note, responds_to_review, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .run(
      revisionId,
      recordId,
      i + 1,
      s.sessionId,
      rev.change ?? (i === 0 ? 'create' : 'revise'),
      JSON.stringify(rev.content),
      rev.confidence,
      rev.notObservable ? 1 : 0,
      rev.status,
      rev.note ?? (i === 0 ? null : 'Revised after a new run'),
      updated,
    );
  for (const link of rev.evidence) {
    // What a link cites is a typed ref (spec 039 § 15, migration 0040).
    const ref = nextId();
    raw
      .prepare(`INSERT INTO entity_refs (id, ${EVIDENCE_COLUMN[link.kind]}) VALUES (?, ?)`)
      .run(ref, link.id);
    raw
      .prepare(
        `INSERT INTO doc_evidence_links (id, revision_id, ref_id, run_id, note)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(nextId(), revisionId, ref, link.run, link.note ?? null);
  }
  for (const rel of rev.relations ?? [])
    s.pending.push({ from: revisionId, to: rel.to, type: rel.type });
  for (const review of rev.reviews ?? []) {
    updated = tick(s);
    raw
      .prepare(
        `INSERT INTO doc_reviews (id, revision_id, action, reviewer, text, created_at)
         VALUES (?, ?, ?, 'Test Reviewer', ?, ?)`,
      )
      .run(nextId(), revisionId, review.action, review.text ?? null, updated);
  }
  return updated;
}

/** One record with its revisions; returns its key. */
function record(s: SeedState, [kind, revs]: Seed): string {
  const seq = (s.seqs.get(kind) ?? 0) + 1;
  s.seqs.set(kind, seq);
  const key = formatKey(kind, seq);
  const id = s.fx.nextId();
  s.ids[key] = id;
  const latest = revs.at(-1)!;
  const confirmed = revs.map((r, i) => (r.status === 'confirmed' ? i + 1 : 0)).filter(Boolean);
  const created = seedTs(s.clock + 1);
  const processId =
    kind === 'process' ? insertProcess(s, { seq, key, title: latest.content.title }) : null;
  s.fx.raw
    .prepare(
      `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn,
       created_at, updated_at, process_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      s.fx.portalId,
      kind,
      key,
      seq,
      latest.content.title,
      revs.length,
      confirmed.at(-1) ?? null,
      latest.change === 'withdraw' ? 1 : 0,
      created,
      created,
      processId,
    );
  let updated = created;
  revs.forEach((rev, i) => {
    updated = insertRevision(s, { recordId: id, rev, i });
  });
  s.fx.raw.prepare('UPDATE doc_records SET updated_at = ? WHERE id = ?').run(updated, id);
  return key;
}

/** The analysis session the revisions belong to, over the map run and both traces. */
function insertSession(fx: FixtureStore, runs: readonly string[]): string {
  const sessionId = fx.nextId();
  fx.raw
    .prepare(
      `INSERT INTO analysis_sessions (id, portal_id, status, passes_json, summary, gaps_json, started_at, ended_at)
       VALUES (?, ?, 'completed', '[]', 'Seeded documentation', '[]', ?, ?)`,
    )
    .run(sessionId, fx.portalId, seedTs(0), seedTs(0));
  for (const run of runs)
    fx.raw
      .prepare('INSERT INTO analysis_session_runs (session_id, run_id) VALUES (?, ?)')
      .run(sessionId, run);
  return sessionId;
}

/** The follow-ups' task rows: the first open, the second blocked by the read limit. */
function insertFollowupTasks(s: SeedState, [open, blocked]: string[], boundaryRun: string) {
  const { raw } = s.fx;
  raw
    .prepare(
      `INSERT INTO followup_tasks (record_id, status, run_id, blocked_reason, updated_at) VALUES (?, 'open', NULL, NULL, ?)`,
    )
    .run(s.ids[open!], tick(s));
  raw
    .prepare(
      `INSERT INTO followup_tasks (record_id, status, run_id, blocked_reason, updated_at) VALUES (?, 'blocked', ?, ?, ?)`,
    )
    .run(
      s.ids[blocked!],
      boundaryRun,
      'ceiling:read: "Dalej" is mutating, above the read limit',
      tick(s),
    );
}

/**
 * A fixed Layer B record set over the fixture store's map run and two trace runs (tasks.md T072):
 * all 12 kinds; statuses draft, confirmed, rejected, superseded (SCR-002: a draft over a confirmed
 * baseline), a withdrawn record (DI-004); every confidence and one not-observable flag (BR-002);
 * confirm/reject/comment reviews; an open and a blocked follow-up; a BA and two crawler questions.
 * Rows are written directly with the statuses the status engine would have left, so `audit()` reports
 * nothing. Call on a store made with `deterministicIds: true` for byte-stable output. The records
 * themselves are in `seeds/`.
 */
export function seedDocRecords(fx: FixtureStore): SeededDocs {
  const trace = fx.addTraceRun();
  const boundary = fx.addBoundaryTrace();
  const map = fx.runId;
  const sessionId = insertSession(fx, [map, trace.runId, boundary.runId]);
  const s: SeedState = { fx, sessionId, ids: {}, seqs: new Map(), pending: [], clock: 0 };
  const ctx: SeedContext = {
    fx,
    st: fx.states,
    map,
    trace,
    boundary,
    stateLink: (id, note) => ({ kind: 'state', id, run: map, ...(note ? { note } : {}) }),
    confirm: [{ action: 'confirm' as const }],
  };
  for (const seed of SECTIONS.flatMap((section) => section(ctx))) record(s, seed);
  const followupKeys = followups(ctx).map((seed) => record(s, seed));
  insertFollowupTasks(s, followupKeys, boundary.runId);
  for (const rel of s.pending)
    fx.raw
      .prepare('INSERT INTO doc_relations (from_revision_id, to_record_id, type) VALUES (?, ?, ?)')
      .run(rel.from, s.ids[rel.to], rel.type);
  return { ids: s.ids, sessionId, trace, boundary };
}
