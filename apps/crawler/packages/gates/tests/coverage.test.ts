import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findingIds,
  parseCatalogue,
  parseEvalCases,
  registeredIds,
  registeredInFolder,
} from '../src/catalogue.js';
import { CATALOGUE, EVAL_CASES, GATE_TESTS, REPO } from '../src/paths.js';

const FINDINGS: [string, string][] = [
  ['specs/004-ba-documentation/goal-run-findings.md', '004'],
  ['specs/008-screenshots-wireframes/findings.md', '008'],
  ['specs/009-legacy-proving-ground/findings.md', '009'],
  ['specs/020-roadmap-declutter/findings.md', '020'],
  ['specs/023-crawler-hooks/findings.md', '023'],
];

describe('coverage (spec 009 FR-024, FR-025)', () => {
  const catalogue = parseCatalogue(readFileSync(CATALOGUE, 'utf8'));
  const cases = parseEvalCases(readFileSync(EVAL_CASES, 'utf8'));
  const { gates, gaps } = registeredInFolder(GATE_TESTS);

  it('every in-scope catalogue obstacle has a gate or a known gap', () => {
    const missing = catalogue
      .filter((r) => r.status === 'in scope')
      .map((r) => r.id)
      .filter((id) => !gates.has(id) && !gaps.has(id));
    expect(missing).toEqual([]);
  });

  it('every finding mapped to tier gate has a gate or a known gap', () => {
    const missing = cases
      .filter((c) => c.tier === 'gate')
      .map((c) => c.id)
      .filter((id) => !gates.has(id) && !gaps.has(id));
    expect(missing).toEqual([]);
  });

  it('every logged finding appears once in eval-cases.yaml', () => {
    const want = FINDINGS.flatMap(([f, spec]) =>
      findingIds(readFileSync(join(REPO, f), 'utf8'), spec),
    );
    const have = new Set(cases.map((c) => c.id));
    expect(want.filter((w) => !have.has(w))).toEqual([]);
    expect([...have].filter((h) => !want.includes(h))).toEqual([]);
  });

  it('gate ids name real catalogue entries or indexed findings', () => {
    const known = new Set([...catalogue.map((r) => r.id), ...cases.map((c) => c.id)]);
    expect([...gates, ...gaps].filter((id) => !known.has(id))).toEqual([]);
  });
});

describe('catalogue and index parsers', () => {
  it('reads catalogue rows and rejects malformed ones', () => {
    const ok = '| LO-01 | A | B | C | idea | in scope |\n| LO-02 | A | B | C | common | later |';
    expect(parseCatalogue(ok).map((r) => [r.id, r.status])).toEqual([
      ['LO-01', 'in scope'],
      ['LO-02', 'later'],
    ]);
    expect(() => parseCatalogue('| LO-01 | A | B | idea | in scope |')).toThrow(/6 columns/);
    expect(() => parseCatalogue('| LO-01 | A | B | C | idea | maybe |')).toThrow(/status/);
    expect(() => parseCatalogue(`${ok}\n| LO-01 | A | B | C | idea | later |`)).toThrow(
      /duplicate id LO-01/,
    );
  });

  it('requires a check for eval cases and a reason for not testable ones', () => {
    expect(() => parseEvalCases('- {id: F-01@004, title: t, tier: eval}')).toThrow(/check name/);
    expect(() => parseEvalCases('- {id: F-01@004, title: t, tier: not_testable}')).toThrow(
      /reason/,
    );
    expect(parseEvalCases('- {id: F-01@004, title: t, tier: gate}')).toHaveLength(1);
  });

  it('finds finding headings at levels 2 and 3, and gate registrations', () => {
    expect(findingIds('## F-01 a\n### F-12 b\n#### F-99 no\ntext F-03', '009')).toEqual([
      'F-01@009',
      'F-12@009',
    ]);
    expect(registeredIds("gate('LO-13', 't', f);\ngap(\n  'F-02@008', 'x'")).toEqual({
      gates: ['LO-13'],
      gaps: ['F-02@008'],
    });
  });
});
