import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { audit } from '../src/audit.js';
import { exportSrs, writeExport } from '../src/export.js';
import {
  makeFixtureStore,
  seedDocRecords,
  type FixtureStore,
  type SeededDocs,
} from '../src/testing/index.js';

/**
 * T072 (contracts/srs-export.md, FR-050–FR-054, SC-007). Goldens live in tests/golden/; regenerate
 * with `UPDATE_GOLDEN=1 pnpm vitest run tests/export.test.ts` and review the diff by hand.
 */
const GOLDEN = fileURLToPath(new URL('./golden', import.meta.url));
const UPDATE = process.env.UPDATE_GOLDEN === '1';

let fx: FixtureStore;
let seeded: SeededDocs;
let all: Map<string, string>;
let confirmed: Map<string, string>;

beforeAll(async () => {
  fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
  seeded = seedDocRecords(fx);
  all = exportSrs(fx.raw, fx.portalId, { environment: 'sandbox' });
  confirmed = exportSrs(fx.raw, fx.portalId, { environment: 'sandbox', confirmedOnly: true });
});
afterAll(() => fx.close());

const FILES = [
  'README.md',
  '01-introduction.md',
  '02-capabilities.md',
  '03-screens.md',
  '04-processes-and-use-cases.md',
  '05-functional-requirements.md',
  '06-business-rules.md',
  '07-data-dictionary.md',
  '08-glossary.md',
  '09-non-functional.md',
  '10-assumptions-and-questions.md',
  '11-unknowns.md',
  '12-traceability.md',
  'appendix-change-log.md',
  'records.json',
];

function compareGolden(name: string, files: Map<string, string>): void {
  const dir = join(GOLDEN, name);
  if (UPDATE) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const [file, text] of files) writeFileSync(join(dir, file), text);
  }
  expect(readdirSync(dir).sort()).toEqual([...files.keys()].sort());
  for (const [file, text] of files) expect(text, file).toBe(readFileSync(join(dir, file), 'utf8'));
}

const md = (files: Map<string, string>): string =>
  [...files]
    .filter(([f]) => f.endsWith('.md'))
    .map(([, t]) => t)
    .join('\n');
const KEY = /\b(?:CAP|SCR|PROC|UC|REQ|NFR|BR|GL|DI|ASM|OQ|FUP)-\d{3,}\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;

interface JsonRecord {
  key: string;
  rev: number;
  status: string;
}
interface Json {
  records: JsonRecord[];
  change_log: { key: string }[];
}
const json = (files: Map<string, string>): Json => JSON.parse(files.get('records.json')!) as Json;

describe('seeded store', () => {
  it('audits clean except the deliberately broken evidence link', () => {
    const findings = audit(fx.raw, fx.portalId).findings;
    expect(findings).toEqual([
      expect.objectContaining({ check: 'broken_link', key: 'REQ-002', rev_no: 1 }),
    ]);
  });
});

describe('exportSrs (contracts/srs-export.md)', () => {
  it('produces the contract file set in both modes', () => {
    expect([...all.keys()].sort()).toEqual([...FILES].sort());
    expect([...confirmed.keys()].sort()).toEqual([...FILES].sort());
  });

  it('matches the goldens', () => {
    compareGolden('reference-insurer-all', all);
    compareGolden('reference-insurer-confirmed', confirmed);
  });

  it('is deterministic: a second render is byte-identical (FR-053)', () => {
    expect(exportSrs(fx.raw, fx.portalId, { environment: 'sandbox' })).toEqual(all);
    expect(exportSrs(fx.raw, fx.portalId, { environment: 'sandbox', confirmedOnly: true })).toEqual(
      confirmed,
    );
  });

  it('uses LF line endings and ends every file with one newline', () => {
    for (const [file, text] of [...all, ...confirmed]) {
      expect(text.includes('\r'), file).toBe(false);
      expect(text.endsWith('\n') && !text.endsWith('\n\n'), file).toBe(true);
    }
  });

  it('confirmed-only renders only confirmed revisions and no DRAFT callout (FR-051)', () => {
    expect(md(confirmed)).not.toContain('DRAFT');
    const records = json(confirmed).records;
    expect(records.every((r) => r.status === 'confirmed')).toBe(true);
    // SCR-002 has a newer draft over a confirmed rev 1: the baseline is what gets rendered.
    expect(records.find((r) => r.key === 'SCR-002')).toMatchObject({ rev: 1 });
    expect(records.map((r) => r.key)).not.toContain('SCR-003');
  });

  it('"all" mode marks drafts and shows the confirmed baseline under a newer draft', () => {
    const screens = all.get('03-screens.md')!;
    expect(screens).toContain('**SCR-002** · rev 2 · draft · observed');
    expect(screens).toContain('> DRAFT — not confirmed by a reviewer');
    expect(screens).toContain('confirmed baseline: rev 1');
  });

  it('keeps rejected-only and withdrawn records out of the chapters, in the change log', () => {
    for (const key of ['SCR-004', 'DI-004']) {
      const files = [...all].filter(([f]) => f.endsWith('.md') && f !== 'appendix-change-log.md');
      for (const [file, text] of files) expect(text, `${key} in ${file}`).not.toContain(key);
      expect(all.get('appendix-change-log.md')).toContain(key);
      expect(json(all).records.map((r) => r.key)).not.toContain(key);
    }
  });

  it('lists unknowns: needs_confirmation, not observable, follow-ups, broken evidence (FR-052)', () => {
    const unknowns = all.get('11-unknowns.md')!;
    for (const key of ['REQ-002', 'BR-002', 'FUP-001', 'FUP-002', 'PROC-002'])
      expect(unknowns, key).toContain(key);
    expect(unknowns).toContain(seeded.goneFormId);
    expect(unknowns).toContain('ceiling:read: "Dalej" is mutating on production');
    expect(all.get('06-business-rules.md')).toContain('not observable');
  });

  it('every key and id in the Markdown exists in records.json and in the store (SC-007)', () => {
    for (const files of [all, confirmed]) {
      const text = md(files);
      const data = json(files);
      const keys = new Set([...data.records, ...data.change_log].map((r) => r.key));
      for (const key of new Set(text.match(KEY))) expect(keys.has(key), key).toBe(true);
      const blob = files.get('records.json')!;
      for (const id of new Set(text.match(UUID))) {
        expect(blob.includes(id), id).toBe(true);
        if (id === seeded.goneFormId) continue;
        expect(existsInStore(id), id).toBe(true);
      }
    }
  });

  it('copies no evidence file content or request bodies (FR-054)', () => {
    const everything = [...all.values(), ...confirmed.values()].join('\n');
    expect(everything).not.toContain('array<string>'); // network call body shapes
    expect(everything).not.toContain('/url:'); // ARIA snapshot text
    expect(everything).not.toContain('Test Model'); // trace input values
    const refs = fx.raw.prepare('SELECT evidence_ref FROM states').all() as {
      evidence_ref: string;
    }[];
    for (const { evidence_ref } of refs) expect(everything).not.toContain(evidence_ref);
  });
});

describe('writeExport and refusals', () => {
  it('refuses a portal without documentation records', () => {
    expect(() => exportSrs(fx.raw, fx.otherPortalId, { environment: 'sandbox' })).toThrow(
      expect.objectContaining({ code: 'NO_RECORDS' }),
    );
  });

  it('replaces an earlier export but never a foreign folder', () => {
    const base = mkdtempSync(join(tmpdir(), 'pf-srs-'));
    try {
      const target = join(base, 'out');
      writeExport(target, all);
      writeFileSync(join(target, 'stale.md'), 'left from an older layout');
      writeExport(target, confirmed); // an earlier export: replaced, stale file gone
      expect(readdirSync(target).sort()).toEqual([...FILES].sort());
      expect(readFileSync(join(target, 'README.md'), 'utf8')).toContain('confirmed only');

      const foreign = join(base, 'notes');
      mkdirSync(foreign);
      writeFileSync(join(foreign, 'keep.txt'), 'mine');
      expect(() => writeExport(foreign, all)).toThrow(
        expect.objectContaining({ code: 'OUT_DIR_NOT_EXPORT' }),
      );
      expect(readdirSync(foreign)).toEqual(['keep.txt']);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

const TABLES = [
  'runs',
  'states',
  'edges',
  'actions',
  'forms',
  'network_calls',
  'open_questions',
  'rule_candidates',
  'decision_log',
  'processes',
  'process_steps',
  'doc_records',
  'doc_reviews',
];
function existsInStore(id: string): boolean {
  return TABLES.some(
    (t) => fx.raw.prepare(`SELECT 1 FROM ${t} WHERE id = ?`).get(id) !== undefined,
  );
}
