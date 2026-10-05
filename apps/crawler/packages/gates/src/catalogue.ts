import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

export const OBSTACLE_STATUSES = ['proposed', 'in scope', 'later', 'withdrawn'] as const;
export type ObstacleStatus = (typeof OBSTACLE_STATUSES)[number];

export interface CatalogueRow {
  id: string;
  obstacle: string;
  place: string;
  should: string;
  source: string;
  status: ObstacleStatus;
}

/**
 * Rows of `docs/legacy-obstacles.md` (every table whose first column is an `LO-nn` id). Pure; a
 * malformed row throws naming its line, so the living catalogue cannot silently lose an entry.
 */
export function parseCatalogue(markdown: string): CatalogueRow[] {
  const rows: CatalogueRow[] = [];
  const seen = new Set<string>();
  markdown.split('\n').forEach((line, i) => {
    const m = /^\|\s*(LO-\d{2,})\s*\|/.exec(line);
    if (!m) return;
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    if (cells.length !== 6)
      throw new Error(`legacy-obstacles.md line ${i + 1}: expected 6 columns, got ${cells.length}`);
    const [id, obstacle, place, should, source, status] = cells as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    if (!(OBSTACLE_STATUSES as readonly string[]).includes(status))
      throw new Error(`legacy-obstacles.md line ${i + 1}: unknown status "${status}"`);
    if (seen.has(id)) throw new Error(`legacy-obstacles.md line ${i + 1}: duplicate id ${id}`);
    seen.add(id);
    rows.push({ id, obstacle, place, should, source, status: status as ObstacleStatus });
  });
  return rows;
}

export const EvalCase = z
  .object({
    id: z.string().regex(/^F-\d{2}@\d{3}$/),
    title: z.string().min(1),
    tier: z.enum(['gate', 'eval', 'not_testable']),
    check: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.tier === 'eval' && !c.check)
      ctx.addIssue({ code: 'custom', message: `${c.id}: an eval case needs a check name` });
    if (c.tier === 'not_testable' && !c.reason)
      ctx.addIssue({ code: 'custom', message: `${c.id}: not_testable needs a reason` });
  });
export type EvalCase = z.infer<typeof EvalCase>;

/** `eval-cases.yaml`: every logged finding mapped to a gate, an eval check, or not testable. */
export function parseEvalCases(text: string): EvalCase[] {
  const cases = z.array(EvalCase).parse(parse(text) ?? []);
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`eval-cases.yaml: duplicate id ${c.id}`);
    ids.add(c.id);
  }
  return cases;
}

/**
 * Finding ids of a findings document: headings `## F-07 …` or `### F-07 …`, tagged with the spec
 * number (`F-07@008`).
 */
export function findingIds(markdown: string, spec: string): string[] {
  const out: string[] = [];
  for (const line of markdown.split('\n')) {
    const m = /^#{2,3}\s+(F-\d{2})\b/.exec(line);
    if (m) out.push(`${m[1]}@${spec}`);
  }
  return out;
}

/** Ids a gate test file registers with `gate('…'` or `gap('…'` (static scan, deterministic). */
export function registeredIds(source: string): { gates: string[]; gaps: string[] } {
  const ids = (fn: string) =>
    [...source.matchAll(new RegExp(`\\b${fn}\\(\\s*['"]([^'"]+)['"]`, 'g'))].map((m) => m[1]!);
  return { gates: ids('gate'), gaps: ids('gap') };
}

/** Every id registered across the gate test folder. */
export function registeredInFolder(dir: string): { gates: Set<string>; gaps: Set<string> } {
  const gates = new Set<string>();
  const gaps = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.test.ts')) continue;
    const r = registeredIds(readFileSync(join(dir, f), 'utf8'));
    r.gates.forEach((x) => gates.add(x));
    r.gaps.forEach((x) => gaps.add(x));
  }
  return { gates, gaps };
}
