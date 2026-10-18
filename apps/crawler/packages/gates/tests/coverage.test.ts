import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findingIds,
  parseCatalogue,
  parseEvalCases,
  parseScars,
  registeredIds,
  registeredInFolder,
} from '../src/catalogue.js';
import { CATALOGUE, EVAL_CASES, GATE_TESTS, REPO, SCAR_CATALOGUE } from '../src/paths.js';

const FINDINGS: [string, string][] = [
  ['specs/004-ba-documentation/goal-run-findings.md', '004'],
  ['specs/008-screenshots-wireframes/findings.md', '008'],
  ['specs/009-legacy-proving-ground/findings.md', '009'],
  ['specs/020-roadmap-declutter/findings.md', '020'],
  ['specs/023-crawler-hooks/findings.md', '023'],
  ['specs/026-frontier-order/findings.md', '026'],
  ['specs/030-battle-tested-scars/findings.md', '030'],
  ['specs/031-roadmap-declutter-2/findings.md', '031'],
  ['specs/032-form-states-probes/findings.md', '032'],
  ['specs/033-map-graph-reconcile/findings.md', '033'],
  ['specs/036-crawler-export-fixes/findings.md', '036'],
  ['specs/037-probes-transit-shop/findings.md', '037'],
  ['specs/038-grouping-eval-crawler-gaps/findings.md', '038'],
];

describe('coverage (spec 009 FR-024, FR-025)', () => {
  const catalogue = parseCatalogue(readFileSync(CATALOGUE, 'utf8'));
  const cases = parseEvalCases(readFileSync(EVAL_CASES, 'utf8'));
  const { gates, gaps } = registeredInFolder(GATE_TESTS);
  const scars = parseScars(readFileSync(SCAR_CATALOGUE, 'utf8'));

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

  it('gate ids name real catalogue entries, indexed findings or scars', () => {
    const known = new Set([
      ...catalogue.map((r) => r.id),
      ...cases.map((c) => c.id),
      ...scars.map((s) => s.id),
    ]);
    expect([...gates, ...gaps].filter((id) => !known.has(id))).toEqual([]);
  });

  it('every scar has its case, a gate when scars.yaml says gate and a gap when it says gap (spec 030)', () => {
    const wrong = scars.filter((s) => !(s.status === 'gate' ? gates : gaps).has(s.id));
    expect(wrong.map((s) => `${s.id} (${s.status})`)).toEqual([]);
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

  it('finds finding headings at levels 2 and 3, table rows, and gate registrations', () => {
    expect(
      findingIds(
        '## F-01 a\n### F-12 b\n#### F-99 no\ntext F-03\n| F-14 | x |\n| 1 | F-05 |',
        '009',
      ),
    ).toEqual(['F-01@009', 'F-12@009', 'F-14@009']);
    expect(registeredIds("gate('LO-13', 't', f);\ngap(\n  'F-02@008', 'x'")).toEqual({
      gates: ['LO-13'],
      gaps: ['F-02@008'],
    });
  });
});
