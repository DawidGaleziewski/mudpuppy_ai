/**
 * Result sizes of the BA's evidence reads for one recorded run (spec 013, R-24 P3/P4): every
 * `get_run_evidence` page of every kind at the default page size, and `get_evidence` on each of
 * the run's states. Prints JSON: calls and characters per tool and kind. Read-only.
 * Usage: pnpm tokens:ba <run_id> [--env sandbox] [--root <repo root>]
 */
import { join, resolve } from 'node:path';
import { createEvidenceStore, createLogger } from '@pathfinder/core';
import {
  RunEvidenceKind,
  getEvidence,
  getRunEvidence,
  type BaContext,
} from '@pathfinder/mcp-server';
import { dbPathFor, openDb } from '@pathfinder/store';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const runId = process.argv[2];
if (!runId || runId.startsWith('--')) {
  console.error('usage: pnpm tokens:ba <run_id> [--env <env>] [--root <repo root>]');
  process.exit(2);
}
const root = resolve(arg('root') ?? join(import.meta.dirname, '..', '..', '..'));
const opened = openDb(dbPathFor(join(root, 'data'), arg('env') ?? 'sandbox'));
const ctx: BaContext = {
  db: opened.db,
  raw: opened.raw,
  evidence: createEvidenceStore(join(root, 'data', 'evidence')),
  logger: createLogger(),
};

const size = (v: unknown): number => JSON.stringify(v).length;
const out: Record<string, { calls: number; chars: number }> = {};
const add = (key: string, chars: number): void => {
  const o = (out[key] ??= { calls: 0, chars: 0 });
  o.calls += 1;
  o.chars += chars;
};

const stateIds: string[] = [];
for (const kind of RunEvidenceKind.options) {
  let cursor: string | undefined;
  do {
    const page = getRunEvidence(ctx, { run_id: runId, kind, ...(cursor ? { cursor } : {}) });
    add(`get_run_evidence:${kind}`, size(page));
    if (kind === 'states') stateIds.push(...page.items.map((i) => i.id as string));
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
}
for (const id of stateIds) {
  const r = await getEvidence(ctx, { target_kind: 'state', target_id: id });
  add('get_evidence:state', size(r));
  add('get_evidence:state.elements', size({ e: r.elements }));
  add('get_evidence:state.evidence', size(r.evidence));
}
console.log(JSON.stringify(out, null, 1));
await opened.close();
