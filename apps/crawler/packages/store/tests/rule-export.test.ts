import { describe, expect, it } from 'vitest';
import {
  ALL_RULE_STATUSES,
  CSV_HEADER,
  decideHypothesis,
  decisionRules,
  ruleFiles,
  ruleSentence,
} from '../src/index.js';
import { replayAll, T, withRule } from './seed-threshold.js';

const paths = (files: { path: string }[]) => files.map((f) => f.path);

describe('decision rules exported as DMN, Markdown and CSV (design § 11.4, OV-5)', () => {
  it('exports nothing while the rule is only proposed', async () => {
    const o = withRule(18);
    const files = ruleFiles(o.raw, 'ins');
    expect(paths(files)).toEqual(['rules.csv', 'README.md']);
    expect(files[1]!.content).toContain('No rule in these statuses yet.');
    expect(files[0]!.content).toBe(`${CSV_HEADER.join(',')}\n`);
    expect(decisionRules(o.raw, 'ins')[0]).toMatchObject({
      key: 'H-0001',
      status: 'proposed',
      tests: { pass: 0, fail: 0, inconclusive: 0, waiting: 3 },
    });
    expect(paths(ruleFiles(o.raw, 'ins', ALL_RULE_STATUSES))).toContain('H-0001.md');
    await o.close();
  });

  it('a supported rule is exported with its boundary verdicts; a confirmed one says so', async () => {
    const o = withRule(18);
    replayAll(o);
    const files = ruleFiles(o.raw, 'ins');
    expect(paths(files)).toEqual(['H-0001.dmn', 'H-0001.md', 'rules.csv', 'README.md']);
    const [dmn, md, csv, readme] = files;
    expect(dmn!.content).toContain('hitPolicy="UNIQUE"');
    expect(dmn!.content).toContain('<text>&lt; 18</text>');
    expect(readme!.content).toContain('| [H-0001](H-0001.md) ([DMN](H-0001.dmn)) | supported |');
    expect(readme!.content).toContain('| 3 / 0 / 0 / 0 |');
    // The Markdown: the sentence first, then the table, tests and status (v2-12 "In the export").
    const text = md!.content;
    expect(text).toMatch(/^## H-0001 · /);
    expect(text.indexOf('If ')).toBeLessThan(text.indexOf('| # |'));
    expect(text).toContain('- Tested: 3 pass, 0 fail, 0 inconclusive, 0 waiting');
    expect(text).toContain('- Status: tested, not confirmed yet (needs a person)');
    // The CSV: a line per table row, under the header.
    const lines = csv!.content.trim().split('\n');
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines).toHaveLength(1 + decisionRules(o.raw, 'ins')[0]!.table.rules.length);
    expect(lines[1]).toMatch(/^H-0001,H-0001,supported,/);
    decideHypothesis(o.raw, {
      portal: 'ins',
      key: 'H-0001',
      decision: 'confirm',
      actor: 'owner',
      reason: 'drivers under 18 are refused, as the terms say',
      now: T(950),
    });
    expect(ruleFiles(o.raw, 'ins').at(-1)!.content).toContain('| confirmed |');
    await o.close();
  });

  it('says each row of the table as a sentence', async () => {
    const o = withRule(18);
    const rule = decisionRules(o.raw, 'ins')[0]!;
    const sentence = ruleSentence(rule, { brKey: () => null, screen: () => null });
    expect(sentence).toMatch(/^If age from data_urodzenia < 18, "oblicz składkę" on .+ leads to /);
    expect(sentence.split('. ').length).toBe(rule.table.rules.length);
    await o.close();
  });

  it('a refuted rule is not exported unless asked for', async () => {
    const o = withRule(22);
    replayAll(o);
    expect(paths(ruleFiles(o.raw, 'ins'))).toEqual(['rules.csv', 'README.md']);
    expect(paths(ruleFiles(o.raw, 'ins', ['refuted']))).toEqual([
      'H-0001.dmn',
      'H-0001.md',
      'rules.csv',
      'README.md',
    ]);
    await o.close();
  });
});
