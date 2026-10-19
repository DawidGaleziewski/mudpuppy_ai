import { describe, expect, it } from 'vitest';
import { decideHypothesis, decisionRules, dmnFiles } from '../src/index.js';
import { replayAll, T, withRule } from './seed-threshold.js';

describe('decision rules as DMN (spec 039 design § 11.4)', () => {
  it('exports nothing while the rule is only proposed', async () => {
    const o = withRule(18);
    const files = dmnFiles(o.raw, 'ins');
    expect(files.map((f) => f.path)).toEqual(['README.md']);
    expect(files[0]!.content).toContain('No rule in these statuses yet.');
    expect(decisionRules(o.raw, 'ins')[0]).toMatchObject({
      key: 'H-0001',
      status: 'proposed',
      tests: { pass: 0, fail: 0, inconclusive: 0, waiting: 3 },
    });
    await o.close();
  });

  it('a supported rule is exported with its boundary verdicts; a confirmed one says so', async () => {
    const o = withRule(18);
    replayAll(o);
    const [dmn, readme] = dmnFiles(o.raw, 'ins');
    expect(dmn!.path).toBe('H-0001.dmn');
    expect(dmn!.content).toContain('hitPolicy="UNIQUE"');
    expect(dmn!.content).toContain('<text>&lt; 18</text>');
    expect(readme!.content).toContain('| [H-0001](H-0001.dmn) | supported |');
    expect(readme!.content).toContain('| 3 / 0 / 0 / 0 |');
    decideHypothesis(o.raw, {
      portal: 'ins',
      key: 'H-0001',
      decision: 'confirm',
      actor: 'owner',
      reason: 'drivers under 18 are refused, as the terms say',
      now: T(950),
    });
    expect(dmnFiles(o.raw, 'ins')[1]!.content).toContain('| confirmed |');
    await o.close();
  });

  it('a refuted rule is not exported', async () => {
    const o = withRule(22);
    replayAll(o);
    expect(dmnFiles(o.raw, 'ins').map((f) => f.path)).toEqual(['README.md']);
    expect(dmnFiles(o.raw, 'ins', ['refuted']).map((f) => f.path)).toEqual([
      'H-0001.dmn',
      'README.md',
    ]);
    await o.close();
  });
});
