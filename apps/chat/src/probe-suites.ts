// Probe suites waiting for the owner (spec 032 US3, owner decision D-2): the BA proposed one per
// form; the owner keeps or drops each variant, may change what it expects, and approves or
// dismisses it in Review. Approving writes the trace into `portals/<portal>/traces.yaml` (comments
// kept; an entry with the same id is replaced and kept on the suite row). Before approval the
// suite exists only in the store, and the trace driver reads only `traces.yaml`: it cannot run.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TraceSpecEntry, TracesFile, type TraceVariant } from '@pathfinder/config';
import { nowIso } from '@pathfinder/core';
import type { PathfinderDb } from '@pathfinder/store';
import { parseDocument, YAMLSeq, type Document } from 'yaml';
import { z } from 'zod';
import { HttpError } from './http-error.js';
import { parseBody } from './http-io.js';

const Author = z.string().trim().min(1).max(200).default('BA');
const Expect = z.enum(['proceed', 'validation_error', 'technical_error', 'branch']);

export const ApproveBody = z
  .object({
    author: Author,
    /** Variant ids to keep; absent keeps all. */
    keep: z.array(z.string().min(1)).optional(),
    /** A changed expectation per variant id. */
    expect: z.record(z.string(), Expect).optional(),
  })
  .strict();
const DismissBody = z.object({ author: Author }).strict();
/** The owner's edited suite (owner answer 2026-10-17: add variants, edit their steps in Review). */
const EditBody = z.object({ author: Author, trace: z.unknown() }).strict();

export interface ProbeSuiteService {
  edit(portal: string, id: string, body: unknown): Promise<{ id: string; status: 'open'; variants: number }>;
  approve(portal: string, id: string, body: unknown): Promise<{ id: string; status: 'approved'; file: string; variants: number; replaced: boolean }>;
  dismiss(portal: string, id: string, body: unknown): Promise<{ id: string; status: 'dismissed' }>;
}

const HEADER = '# Trace catalogue (spec 030 R-64). Probe suites approved in Review are added here (spec 032).\n';

/** The catalogue as a YAML document, so the owner's comments survive the write. */
function catalogue(file: string): Document {
  if (!existsSync(file)) return parseDocument(`${HEADER}traces: []\n`);
  return parseDocument(readFileSync(file, 'utf8'));
}

/** Put the trace in the catalogue: replace the entry with its id, else append. Returns the old one. */
export function placeTrace(doc: Document, trace: TraceSpecEntry): unknown {
  const seq = doc.get('traces');
  if (!(seq instanceof YAMLSeq)) {
    doc.set('traces', doc.createNode([trace]));
    return null;
  }
  const at = seq.items.findIndex((n) => (doc.createNode(n).toJSON() as { id?: string })?.id === trace.id);
  if (at < 0) {
    seq.add(doc.createNode(trace));
    return null;
  }
  const old = (seq.items[at] as { toJSON(): unknown }).toJSON();
  seq.set(at, doc.createNode(trace));
  return old;
}

/** The trace the owner approves: kept variants, changed expectations, still a valid trace. */
export function approvedTrace(proposed: unknown, body: z.infer<typeof ApproveBody>): TraceSpecEntry {
  const trace = TraceSpecEntry.parse(proposed);
  const keep = body.keep ? new Set(body.keep) : null;
  const variants = trace.variants
    .filter((v) => keep === null || keep.has(v.id))
    .map((v): TraceVariant => ({ ...v, expect: body.expect?.[v.id] ?? v.expect }));
  if (variants.length === 0) throw new HttpError(400, 'Keep at least one variant, or dismiss the suite.');
  const parsed = TraceSpecEntry.safeParse({ ...trace, variants });
  if (!parsed.success)
    throw new HttpError(400, `The changed suite is not a valid trace: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  return parsed.data;
}

export function createProbeSuiteService(deps: { db: PathfinderDb; repoRoot: string }): ProbeSuiteService {
  const open = async (portal: string, id: string) => {
    const row = await deps.db
      .selectFrom('probe_suites')
      .selectAll()
      .where('id', '=', id)
      .where('portal_id', '=', portal)
      .executeTakeFirst();
    if (!row) throw new HttpError(404, 'This probe suite does not exist.');
    if (row.status !== 'open') throw new HttpError(409, `This probe suite is already ${row.status}.`);
    return row;
  };
  return {
    async edit(portal, id, raw) {
      const body = parseBody(EditBody, raw);
      const row = await open(portal, id);
      const parsed = TraceSpecEntry.safeParse(body.trace);
      if (!parsed.success)
        throw new HttpError(400, `The edited suite is not a valid trace: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      if (parsed.data.id !== (JSON.parse(row.trace_json) as { id: string }).id)
        throw new HttpError(400, 'The trace id of a suite cannot change.');
      const ids = parsed.data.variants.map((v) => v.id);
      if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Two variants have the same id.');
      await deps.db
        .updateTable('probe_suites')
        .set({ trace_json: JSON.stringify(parsed.data) })
        .where('id', '=', id)
        .execute();
      return { id, status: 'open', variants: parsed.data.variants.length };
    },
    async approve(portal, id, raw) {
      const body = parseBody(ApproveBody, raw);
      const row = await open(portal, id);
      const trace = approvedTrace(JSON.parse(row.trace_json), body);
      const file = join(deps.repoRoot, 'portals', portal, 'traces.yaml');
      const doc = catalogue(file);
      const replaced = placeTrace(doc, trace);
      const text = doc.toString();
      const check = TracesFile.safeParse(parseDocument(text).toJSON());
      if (!check.success) throw new HttpError(409, `traces.yaml would not load after this change: ${check.error.message}`);
      writeFileSync(`${file}.tmp`, text);
      renameSync(`${file}.tmp`, file);
      await deps.db
        .updateTable('probe_suites')
        .set({
          status: 'approved',
          approved_json: JSON.stringify(trace),
          replaced_json: replaced === null ? null : JSON.stringify(replaced),
          decided_by: body.author,
          decided_at: nowIso(),
        })
        .where('id', '=', id)
        .execute();
      return { id, status: 'approved', file, variants: trace.variants.length, replaced: replaced !== null };
    },
    async dismiss(portal, id, raw) {
      const body = parseBody(DismissBody, raw);
      await open(portal, id);
      await deps.db
        .updateTable('probe_suites')
        .set({ status: 'dismissed', decided_by: body.author, decided_at: nowIso() })
        .where('id', '=', id)
        .execute();
      return { id, status: 'dismissed' };
    },
  };
}
