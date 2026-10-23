import { describe, expect, it } from 'vitest';
import { classify, deviationsBetween, type ModelSnapshot, type RuleContext } from '../src/index.js';

const K = (...parts: string[]) => parts.join('\u0000');

describe('deviations (design § 8.1)', () => {
  const prev: ModelSnapshot = {
    screens: new Map([
      ['S1', ['a']],
      ['S2', ['k']],
    ]),
    classes: new Map([
      [K('S1', 'link|kontakt|main|', 'click'), 'active'],
      [K('S1', 'button|oblicz|main|', 'submit'), 'active'],
    ]),
    transitions: new Set([
      K('S1', 'link|kontakt|main|', 'click', 'S2', 'ok'),
      K('S1', 'button|oblicz|main|', 'submit', 'S3', 'ok'),
    ]),
  };

  it('finds new screens, new members, new and missing actions', () => {
    const next: ModelSnapshot = {
      screens: new Map([
        ['S1', ['a', 'b']],
        ['S2', ['k']],
        ['S9', ['z']],
      ]),
      classes: new Map([
        [K('S1', 'link|kontakt|main|', 'click'), 'not_seen_since'],
        [K('S1', 'button|oblicz|main|', 'submit'), 'active'],
        [K('S1', 'link|kontakt|navigation "Menu"|', 'click'), 'active'],
        [K('S9', 'button|x|main|', 'click'), 'active'],
      ]),
      transitions: prev.transitions,
    };
    expect(deviationsBetween(prev, next).map((d) => d.subjectKey)).toEqual([
      'new_member:S1:b',
      'new_screen:S9',
      // classes in key order: `main` before `navigation`
      `missing_action:${K('S1', 'link|kontakt|main|', 'click')}`,
      `new_action:${K('S1', 'link|kontakt|navigation "Menu"|', 'click')}`,
    ]);
  });

  it('an element seen before under another kind is not a new action (F-24)', () => {
    // The button was only seen (`click` placeholder), now pressed as the form's submit.
    const seen: ModelSnapshot = {
      ...prev,
      classes: new Map([...prev.classes, [K('S1', 'button|dalej|main|', 'click'), 'active']]),
    };
    const pressed: ModelSnapshot = {
      ...prev,
      classes: new Map([...prev.classes, [K('S1', 'button|dalej|main|', 'submit'), 'active']]),
    };
    expect(deviationsBetween(seen, pressed)).toEqual([]);
  });

  it('a known action leading elsewhere is a target mismatch; to another result, a result mismatch', () => {
    const next: ModelSnapshot = {
      ...prev,
      transitions: new Set([
        ...prev.transitions,
        K('S1', 'button|oblicz|main|', 'submit', 'S4', 'ok'),
        K('S1', 'link|kontakt|main|', 'click', 'S2', 'technical_error'),
      ]),
    };
    const d = deviationsBetween(prev, next);
    expect(d.map((x) => x.kind)).toEqual(['target_mismatch', 'result_mismatch']);
    expect(d[0]!.before).toEqual({ toScreen: 'S3', result: 'ok' });
  });
});

describe('rules R1–R8 (design § 8.2)', () => {
  const base: RuleContext = {
    kind: 'new_member',
    result: 'ok',
    buildChanged: false,
    schemaChanged: false,
    contextDiffers: false,
    sameEpochAndAudience: true,
    presentForOtherAudience: false,
    newActionSameScreens: false,
  };

  it('R1: an error asks for two replays; a success among them is flaky (Flaky page)', () => {
    const c = { ...base, kind: 'result_mismatch' as const, result: 'technical_error' };
    expect(classify(c)).toEqual({ decision: 'replay', rule: 'R1', replays: 2, what: 'same' });
    expect(classify({ ...c, replays: { same: ['technical_error', 'ok'] } })).toMatchObject({
      kind: 'flaky',
      derived: true,
    });
  });

  it('R1: failing every time is a deterministic error for a person (Deterministic error)', () => {
    const c = {
      ...base,
      result: 'technical_error',
      replays: { same: ['technical_error', 'technical_error'] },
    };
    expect(classify(c)).toMatchObject({ kind: 'deterministic_error', derived: false, rule: 'R1' });
  });

  it('R2: a changed build of the owning scope is structural drift, derived (Deployment)', () => {
    expect(classify({ ...base, buildChanged: true })).toMatchObject({
      kind: 'structural_drift',
      rule: 'R2',
      derived: true,
    });
  });

  it('R3: a result change on equal frontend builds with a new endpoint schema: backend drift', () => {
    expect(classify({ ...base, kind: 'result_mismatch', schemaChanged: true })).toMatchObject({
      kind: 'backend_drift',
      derived: false,
    });
  });

  it('R4: another persona; each context reproduces its own result → context variant (Persona variant)', () => {
    const c = { ...base, contextDiffers: true, sameEpochAndAudience: false };
    expect(classify(c)).toMatchObject({ decision: 'replay', rule: 'R4' });
    expect(classify({ ...c, replays: { reference: true, current: true } })).toMatchObject({
      kind: 'context_variant',
      derived: true,
    });
  });

  it('R5: alternating outcomes with one separating cookie → an A/B test for a person (A/B test)', () => {
    const c = { ...base, kind: 'result_mismatch' as const, sameEpochAndAudience: false };
    expect(classify(c)).toMatchObject({ decision: 'replay', rule: 'R5', replays: 3 });
    expect(
      classify({
        ...c,
        replays: { repeated: ['S2', 'S5', 'S2'], separatingFlag: 'cookie:ab_variant' },
      }),
    ).toMatchObject({ kind: 'ab_test', derived: false, note: 'separated by cookie:ab_variant' });
    expect(classify({ ...c, replays: { repeated: ['S2', 'S5', 'S2'] } })).toMatchObject({
      kind: 'nondeterministic',
    });
  });

  it('R6: a missing action is removed with a release, a variant, replaced, or a person decides', () => {
    const m = { ...base, kind: 'missing_action' as const };
    expect(classify({ ...m, buildChanged: true })).toMatchObject({
      kind: 'removed',
      derived: true,
    });
    expect(classify({ ...m, presentForOtherAudience: true })).toMatchObject({
      kind: 'context_variant',
    });
    expect(classify({ ...m, newActionSameScreens: true })).toMatchObject({
      kind: 'replaces',
      derived: true,
    });
    expect(classify(m)).toMatchObject({ kind: 'removed', derived: false });
  });

  it('R7: a known action leading elsewhere in the same epoch and audience is a decision point', () => {
    expect(classify({ ...base, kind: 'target_mismatch' })).toMatchObject({
      kind: 'decision_point',
      rule: 'R7',
    });
  });

  it('R8: a reproduced rule mismatch is decision drift (Rule drift)', () => {
    const c = { ...base, kind: 'rule_mismatch' as const };
    expect(classify(c)).toMatchObject({ decision: 'replay', rule: 'R8' });
    expect(classify({ ...c, replays: { ruleReproduced: true } })).toMatchObject({
      kind: 'decision_drift',
      derived: true,
    });
  });

  it('a new member on the same build and context asks R5 replays, then decides (spec 046)', () => {
    expect(classify(base)).toEqual({ decision: 'replay', rule: 'R5', replays: 3, what: 'repeat' });
    // stable replays: nothing random, ambiguous for the agent
    expect(classify({ ...base, replays: { repeated: ['s1', 's1', 's1'] } })).toEqual({
      decision: 'ambiguous',
    });
    // alternating, one cookie separates them: an A/B test for a person
    expect(
      classify({
        ...base,
        replays: { repeated: ['s1', 's2', 's1'], separatingFlag: 'cookie:ab_baner' },
      }),
    ).toMatchObject({ kind: 'ab_test', rule: 'R5', derived: false });
  });
});
