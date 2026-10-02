import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createLogger, newId, nowIso } from '@pathfinder/core';
import { makeFixtureStore, type FixtureStore } from '@pathfinder/docs/testing';
import { afterEach } from 'vitest';
import { createBaServer, type BaContext } from '../src/index.js';
import type { Body } from './harness.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

export type BaCall = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ isError: boolean; body: Body }>;

export interface BaHarness {
  fx: FixtureStore;
  ctx: BaContext;
  client: Client;
  call: BaCall;
  /** `call` that fails the test on a refusal and returns the body. */
  must: (name: string, args: Record<string, unknown>) => Promise<Body>;
  /** `call` that expects a refusal and returns its `error` object. */
  refused: (name: string, args: Record<string, unknown>) => Promise<Body>;
  /** A running session over the fixture's map run. */
  session: (runIds?: string[]) => Promise<string>;
}

/** The BA server over the fixture store (portal `reference-insurer`), reached like the agent reaches it. */
export async function startBa(): Promise<BaHarness> {
  const fx = await makeFixtureStore({ portalId: 'reference-insurer' });
  const ctx: BaContext = {
    db: fx.db,
    raw: fx.raw,
    evidence: fx.evidence,
    logger: createLogger({ level: 'silent' }),
  };
  const server = createBaServer(ctx);
  const client = new Client({ name: 'ba', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  cleanups.push(async () => {
    await client.close();
    await fx.close();
  });

  const call: BaCall = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    return {
      isError: r.isError === true,
      body: JSON.parse((r.content as { text: string }[])[0]!.text),
    };
  };
  const must = async (name: string, args: Record<string, unknown>): Promise<Body> => {
    const r = await call(name, args);
    if (r.isError) throw new Error(`${name} was refused: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const refused = async (name: string, args: Record<string, unknown>): Promise<Body> => {
    const r = await call(name, args);
    if (!r.isError)
      throw new Error(`${name} was expected to be refused: ${JSON.stringify(r.body)}`);
    return r.body.error;
  };
  const session = async (runIds = [fx.runId]): Promise<string> =>
    (await must('start_session', { portal_id: fx.portalId, run_ids: runIds })).session_id;

  return { fx, ctx, client, call, must, refused, session };
}

/** Every Layer B row count, to prove a refused write left nothing behind. */
export function layerBCounts(fx: FixtureStore): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of [
    'doc_records',
    'doc_revisions',
    'doc_evidence_links',
    'doc_relations',
    'doc_reviews',
    'followup_tasks',
  ])
    out[t] = (fx.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  return out;
}

/**
 * A human review, written directly: the review command (`docs:review`) arrives with R-15, and the
 * BA has no tool that reviews. Applies the same status change the status engine would.
 */
export function seedReview(
  fx: FixtureStore,
  key: string,
  revNo: number,
  action: 'confirm' | 'reject' | 'comment',
  text: string | null = action === 'confirm' ? null : 'Reviewer note',
  createdAt: string = nowIso(),
): string {
  const rev = fx.raw
    .prepare(
      `SELECT rev.id, rev.record_id FROM doc_revisions rev JOIN doc_records r ON r.id = rev.record_id
       WHERE r.portal_id = ? AND r.key = ? AND rev.rev_no = ?`,
    )
    .get(fx.portalId, key, revNo) as { id: string; record_id: string };
  const id = newId();
  fx.raw
    .prepare(
      `INSERT INTO doc_reviews (id, revision_id, action, reviewer, text, created_at)
       VALUES (?, ?, ?, 'Test Reviewer', ?, ?)`,
    )
    .run(id, rev.id, action, text, createdAt);
  if (action === 'confirm') {
    fx.raw
      .prepare(
        "UPDATE doc_revisions SET status = 'superseded' WHERE record_id = ? AND status = 'confirmed'",
      )
      .run(rev.record_id);
    fx.raw.prepare("UPDATE doc_revisions SET status = 'confirmed' WHERE id = ?").run(rev.id);
    fx.raw
      .prepare('UPDATE doc_records SET confirmed_rev = ? WHERE id = ?')
      .run(revNo, rev.record_id);
  }
  if (action === 'reject')
    fx.raw.prepare("UPDATE doc_revisions SET status = 'rejected' WHERE id = ?").run(rev.id);
  return id;
}

/** Minimal valid content per kind used across the BA tests. */
export const CONTENT = {
  screen: {
    title: 'Vehicle details step',
    purpose: 'Collects the vehicle data for an OC/AC quote.',
    route_templates: ['/kalkulator/pojazd'],
    elements: [{ role: 'button', label_verbatim: 'Dalej' }],
    entry_points: ['Link "Oblicz składkę" on the car insurance page'],
  },
  requirement: {
    title: 'Reject invalid postcode',
    statement: 'The system shall accept "Kod pocztowy" only in the format NN-NNN.',
    acceptance_criteria: [
      {
        given: ['the form "Dane pojazdu"'],
        when: ['"Kod pocztowy" is 123'],
        then: ['the form is not submitted'],
      },
    ],
    priority: 'unset',
  },
  business_rule: {
    title: 'Postcode format',
    statement: 'The "Kod pocztowy" field accepts only the format NN-NNN.',
    rule_type: 'constraint',
  },
  glossary_term: {
    title: 'Autocasco (AC)',
    term_verbatim: 'Autocasco (AC)',
    lang: 'pl',
    definition: 'Voluntary own-damage cover for a vehicle.',
    synonyms_verbatim: ['AC'],
  },
  open_question: {
    title: 'What happens after "Kup polisę"?',
    question: 'What does the portal do after "Kup polisę" is pressed?',
    why_it_matters: 'The purchase flow cannot be re-created without it.',
    answer_needed_from: 'either',
  },
  followup: {
    title: 'Trace the OC/AC calculator',
    question: 'Which steps follow "Dalej" on the vehicle step?',
    suggested_mode: 'trace',
    target: { process_name: 'Oblicz składkę OC/AC', goal: 'Reach the premium result' },
    persona: 'guest',
    reason: 'Unblocks the process and use case records for quoting.',
  },
} as const;
