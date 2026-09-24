import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PathfinderDb } from './db.js';
import { maskText } from './pii.js';

export interface PiiFinding {
  where: string;
  /** What kind of thing was found (never the value itself). */
  kinds: string[];
}

/**
 * Our own identifiers: evidence refs (`<sha256>.<ext>`), state fingerprints (bare sha256) and record
 * ids (UUIDs, e.g. a decision's `subject_ref`).
 */
const OWN_IDS =
  /\b(?:[0-9a-f]{64}(?:\.[a-z0-9]{1,8})?|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/g;

/** Which kinds of PII `maskText` would have masked in `text`, without returning the values. */
function kindsIn(raw: string): string[] {
  // Our own hashes and ids (an edge's `snapshot_ref`, a merge decision's fingerprint, a frontier
  // id) are not tokens from the portal; without this they match the long-token pattern.
  const text = raw.replace(OWN_IDS, '');
  const masked = maskText(text);
  if (masked === text) return [];
  const kinds = new Set<string>();
  for (const [tag, kind] of [
    ['[email]', 'email'],
    ['[phone]', 'phone'],
    ['[token]', 'token'],
    ['[card]', 'card'],
    ['[name]', 'name'],
  ] as const) {
    if (masked.includes(tag) && !text.includes(tag)) kinds.add(kind);
  }
  return [...kinds].length > 0 ? [...kinds] : ['pii'];
}

/** Text columns that hold observed content. Ids, hashes and the run's own config snapshot are not scanned. */
const SCANNED: Record<string, string[]> = {
  states: ['title', 'route_template'],
  forms: ['fields_json'],
  edges: ['action_json', 'error'],
  actions: ['accessible_name', 'action_json', 'skip_reason'],
  network_calls: ['url_template', 'req_schema', 'res_schema', 'console_errors'],
  frontier: ['action_json', 'reason'],
  open_questions: ['text'],
  rule_candidates: ['text'],
  decision_log: ['reason', 'detail_json', 'subject_ref'],
};

/**
 * SC-004: scan evidence files and database rows for unmasked emails, phone numbers, tokens, card
 * numbers and names. Reports where and what kind, never the value.
 */
export async function auditPii(opts: {
  evidenceDir?: string;
  db?: PathfinderDb;
}): Promise<{ scanned: number; findings: PiiFinding[] }> {
  const findings: PiiFinding[] = [];
  let scanned = 0;

  if (opts.evidenceDir) {
    let files: string[] = [];
    try {
      files = readdirSync(opts.evidenceDir).filter((f) => !f.startsWith('.'));
    } catch {
      /* no evidence directory yet */
    }
    for (const f of files) {
      scanned += 1;
      const kinds = kindsIn(readFileSync(join(opts.evidenceDir, f), 'utf8'));
      if (kinds.length > 0) findings.push({ where: `evidence/${f}`, kinds });
    }
  }

  if (opts.db) {
    const db = opts.db as unknown as {
      selectFrom(t: string): {
        select(c: string[]): { execute(): Promise<Record<string, unknown>[]> };
      };
    };
    for (const [table, columns] of Object.entries(SCANNED)) {
      const rows = await db
        .selectFrom(table)
        .select(['id', ...columns])
        .execute();
      for (const row of rows) {
        for (const col of columns) {
          const v = row[col];
          if (typeof v !== 'string') continue;
          scanned += 1;
          const kinds = kindsIn(v);
          if (kinds.length > 0)
            findings.push({ where: `${table}.${col}#${String(row.id)}`, kinds });
        }
      }
    }
  }
  return { scanned, findings };
}

export interface StabilityReport {
  matched: number;
  stable: number;
  /** stable / matched, 1 when nothing matched. */
  ratio: number;
  unstable: { route_template: string; only_in_a: number; only_in_b: number }[];
}

/**
 * SC-005: compare two runs of the same portal. States are matched by route template; a matched
 * template is stable when both runs saw the same set of level-1 fingerprints for it.
 */
export async function compareRuns(
  db: PathfinderDb,
  runA: string,
  runB: string,
): Promise<StabilityReport> {
  const load = async (runId: string): Promise<Map<string, Set<string>>> => {
    const rows = await db
      .selectFrom('state_observations')
      .innerJoin('states', 'states.id', 'state_observations.state_id')
      .select(['states.route_template', 'states.fingerprint'])
      .where('state_observations.run_id', '=', runId)
      .execute();
    const m = new Map<string, Set<string>>();
    for (const r of rows)
      m.set(r.route_template, (m.get(r.route_template) ?? new Set()).add(r.fingerprint));
    return m;
  };
  const a = await load(runA);
  const b = await load(runB);
  const unstable: StabilityReport['unstable'] = [];
  let matched = 0;
  let stable = 0;
  for (const [tpl, fa] of a) {
    const fb = b.get(tpl);
    if (!fb) continue;
    matched += 1;
    const onlyA = [...fa].filter((f) => !fb.has(f)).length;
    const onlyB = [...fb].filter((f) => !fa.has(f)).length;
    if (onlyA === 0 && onlyB === 0) stable += 1;
    else unstable.push({ route_template: tpl, only_in_a: onlyA, only_in_b: onlyB });
  }
  return { matched, stable, ratio: matched === 0 ? 1 : stable / matched, unstable };
}
