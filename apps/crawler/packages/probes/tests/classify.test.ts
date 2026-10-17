import { describe, expect, it } from 'vitest';
import { classifyOutcome, type OutcomeFacts } from '../src/index.js';

const facts = (over: Partial<OutcomeFacts>): OutcomeFacts => ({
  group: 'validation',
  blocked: null,
  sameStep: false,
  stepAfter: 'step-3',
  routeAfter: '/sc19/apply',
  happyNext: { stepId: 'step-3', route: '/sc19/apply' },
  messages: [],
  httpStatus: 200,
  errorPage: false,
  newScreen: false,
  changed: true,
  ...over,
});

describe('classifyOutcome (spec 032 plan decision 7)', () => {
  it('blocked wins over everything', () => {
    expect(
      classifyOutcome(facts({ blocked: 'one-time code on the step', group: 'technical' })),
    ).toMatchObject({
      kind: 'blocked',
      why: 'one-time code on the step',
    });
  });

  it('a technical try is technical, also with no visible reaction', () => {
    expect(classifyOutcome(facts({ group: 'technical', sameStep: true, changed: false })).why).toBe(
      'no visible reaction to the fault',
    );
    // A spinner or a status text: the step changed although no message appeared.
    expect(classifyOutcome(facts({ group: 'technical', sameStep: true })).why).toMatch(/waiting/);
    expect(classifyOutcome(facts({ group: 'technical', httpStatus: 500 })).kind).toBe('technical');
  });

  it('staying on the step is validation, with or without messages', () => {
    const native = classifyOutcome(
      facts({
        sameStep: true,
        messages: [{ field: 'E-mail', text: 'Fill out this field.', source: 'native' }],
      }),
    );
    expect(native).toMatchObject({ kind: 'validation', accepted: false });
    expect(native.why).toContain('Fill out this field.');
    expect(classifyOutcome(facts({ sameStep: true, group: 'branch' })).kind).toBe('validation');
  });

  it('an error page after a non-technical try is temporary', () => {
    expect(classifyOutcome(facts({ httpStatus: 503 })).kind).toBe('temporary');
    expect(classifyOutcome(facts({ errorPage: true, group: 'branch' })).kind).toBe('temporary');
  });

  it('a branch is measured against the happy next step', () => {
    expect(
      classifyOutcome(facts({ group: 'branch', stepAfter: 'step-4', newScreen: true })),
    ).toMatchObject({
      kind: 'branch',
      possibleNewProcess: true,
    });
    expect(classifyOutcome(facts({ group: 'branch' })).kind).toBe('next');
    expect(classifyOutcome(facts({ group: 'branch', happyNext: null, newScreen: true })).kind).toBe(
      'branch',
    );
  });

  it('a validation try that moves on is next, accepted', () => {
    expect(classifyOutcome(facts({}))).toMatchObject({ kind: 'next', accepted: true });
  });
});
