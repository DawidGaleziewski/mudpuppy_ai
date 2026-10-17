import { describe, expect, it } from 'vitest';
import {
  canonicalizeAria,
  computeFingerprint,
  errorSignals,
  FormStepIndex,
  formControls,
  hasErrors,
  type FormStep,
} from '../src/index.js';

// Snapshots SC-19 recorded in the spec 032 spike (research.md), trimmed to the form.
const STEP1 = `- main:
  - heading "Get a quote" [level=1]
  - form "Your details":
    - textbox "Full name"
    - alert
    - textbox "E-mail"
    - textbox "Postal code"
    - spinbutton "Year of birth"
    - button "Next"`;

const STEP2 = `- main:
  - heading "Get a quote" [level=1]
  - heading "Your contract" [level=2]
  - group "Customer type":
    - radio "Private"
    - radio "Business"
    - alert
  - textbox "Start date"
  - alert
  - textbox "Promo code (optional)"
  - button "Next"`;

const STEP2_ERROR = `- main:
  - heading "Get a quote" [level=1]
  - heading "Your contract" [level=2]
  - group "Customer type":
    - radio "Private" [checked]
    - radio "Business"
    - alert
  - textbox "Start date" [invalid]:
    - text: Test
  - alert: Enter the start date as DD.MM.YYYY.
  - textbox "Promo code (optional)": Test
  - button "Next"`;

const STEP2_BUSINESS = `- main:
  - heading "Your contract" [level=2]
  - group "Customer type":
    - radio "Private"
    - radio "Business" [checked]
  - textbox "Company name"
  - textbox "Tax number"
  - textbox "Start date"
  - textbox "Promo code (optional)"
  - button "Next"`;

const nodes = (s: string) => canonicalizeAria(s).nodes;
let n = 0;
const newId = () => `step-${++n}`;

describe('form steps on one URL (spec 032 US1)', () => {
  it('lists the controls with the form name and the label, ignoring values and flags', () => {
    expect(formControls(nodes(STEP1))).toEqual({
      formName: 'Your details',
      controls: [
        'spinbutton|Year of birth',
        'textbox|E-mail',
        'textbox|Full name',
        'textbox|Postal code',
      ],
      label: 'Your details',
    });
    expect(formControls(nodes(STEP2)).controls).toEqual(formControls(nodes(STEP2_ERROR)).controls);
    expect(formControls(nodes(STEP2)).label).toBe('Your contract');
    expect(formControls(nodes('- main:\n  - link "Home"'))).toMatchObject({ controls: [] });
  });

  it('reads invalid controls and alert texts; empty alerts are no error', () => {
    expect(hasErrors(errorSignals(nodes(STEP2)))).toBe(false);
    expect(errorSignals(nodes(STEP2_ERROR))).toEqual({
      invalid: ['Start date'],
      alerts: ['Enter the start date as DD.MM.YYYY.'],
    });
  });

  it('keeps the level-1 fingerprint unaware of the invalid flag', () => {
    const fp = (s: string) => computeFingerprint({ routeTemplate: '/q', ariaSnapshot: s }).level1;
    expect(fp(STEP2.replace('"Start date"', '"Start date" [invalid]'))).toBe(fp(STEP2));
  });

  it('numbers steps per route, keeps an error state and revealed fields on their step', () => {
    const index = new FormStepIndex();
    const s1 = index.assign('/sc19/apply', formControls(nodes(STEP1)), newId)!;
    const s2 = index.assign('/sc19/apply', formControls(nodes(STEP2)), newId)!;
    const err = index.assign('/sc19/apply', formControls(nodes(STEP2_ERROR)), newId)!;
    const biz = index.assign('/sc19/apply', formControls(nodes(STEP2_BUSINESS)), newId)!;
    expect([s1.step.stepIndex, s2.step.stepIndex, s1.created, s2.created]).toEqual([
      1,
      2,
      true,
      true,
    ]);
    expect(err).toMatchObject({ created: false, reason: 'overlap', step: { id: s2.step.id } });
    expect(biz).toMatchObject({
      created: false,
      added: ['textbox|Company name', 'textbox|Tax number'],
      step: { id: s2.step.id },
    });
    expect(biz.overlap).toBeCloseTo(4 / 6);
    // Another route starts at step 1 again; a page without controls is no step.
    expect(index.assign('/other', formControls(nodes(STEP1)), newId)!.step.stepIndex).toBe(1);
    expect(index.assign('/sc19/apply', formControls(nodes('- link "x"')), newId)).toBeNull();
  });

  it('joins by form name before overlap, and never joins two differently named forms', () => {
    const index = new FormStepIndex();
    const a = index.assign('/r', { formName: 'A', controls: ['textbox|x'], label: null }, newId)!;
    const b = index.assign('/r', { formName: 'B', controls: ['textbox|x'], label: null }, newId)!;
    expect(b.created).toBe(true);
    const again = index.assign(
      '/r',
      { formName: 'A', controls: ['textbox|y'], label: null },
      newId,
    )!;
    expect(again).toMatchObject({ reason: 'form-name', step: { id: a.step.id } });
    expect(b.step.label).toBe('step 2');
  });

  it('reads YAML-quoted lines like bare ones: headings and texts with a colon count (F-05)', () => {
    const quoted = `- main:\n  - 'heading "Step 1 of 3: your details" [level=2]'\n  - 'link "It''s here: go"':\n    - /url: /x\n  - text: "Error: E-17"`;
    const bare = `- main:\n  - heading "Step <n> of <n> your details" [level=2]`;
    const nodes = canonicalizeAria(quoted).nodes;
    expect(nodes.map((n) => [n.role, n.name])).toEqual([
      ['main', ''],
      ['heading', 'Step <n> of <n>: your details'],
      ['link', "It's here: go"],
      ['text', 'Error: E-<n>'],
    ]);
    expect(nodes[1]!.shown).toBe('Step 1 of 3: your details');
    expect(nodes[3]!.shown).toBe('Error: E-17');
    const fp = (s: string) => computeFingerprint({ routeTemplate: '/q', ariaSnapshot: s }).level1;
    expect(fp(quoted)).not.toBe(fp('- main:'));
    expect(fp(bare)).not.toBe(fp(quoted));
  });

  it('continues the numbering of the stored steps', () => {
    const known: FormStep[] = [
      {
        id: 'k1',
        routeTemplate: '/r',
        stepIndex: 1,
        formName: null,
        controls: ['textbox|a'],
        label: 'one',
      },
    ];
    const index = new FormStepIndex(known);
    expect(
      index.assign(
        '/r',
        { formName: null, controls: ['textbox|a', 'textbox|b'], label: null },
        newId,
      )!.step.id,
    ).toBe('k1');
    expect(
      index.assign('/r', { formName: null, controls: ['radio|z'], label: null }, newId)!.step
        .stepIndex,
    ).toBe(2);
    expect(known[0]!.controls).toEqual(['textbox|a']); // the seed is copied, not changed
  });
});
