import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readGroundTruth } from '@mudpuppy/docs';
import { describe, expect, it } from 'vitest';
import { scoreExportQuality, type ProcessJson } from '../graders/code/export-quality.js';

// Spec 034 phase 9: the export quality grader on the reference portal's ground truth and the
// export the owner approved on 2026-10-17 (evals/reference-solutions/).

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const gt = readGroundTruth(at('../../packages/reference-portal/ground-truth.yaml'));
const approved = (): ProcessJson =>
  JSON.parse(
    readFileSync(at('../reference-solutions/reference-insurer/PROC-001/process.json'), 'utf8'),
  ) as ProcessJson;

/** The approved export with its known flaws put right by hand: what a fixed export must show. */
function corrected(): ProcessJson {
  const e = approved();
  e.steps = e.steps.filter((s) => s.route !== '/'); // F-15
  for (const s of e.steps) {
    for (const el of s.elements) el.leads_to = el.leads_to.filter((r) => r !== '/'); // F-11
    const form = gt.forms.find(
      (f) => gt.screens.find((x) => x.id === f.screen)?.route_template === s.route,
    );
    for (const f of form?.fields ?? []) {
      if (f.type === 'radio') {
        // F-16: one field per radio group, with its options.
        const options = f.constraints.allowed_values ?? [];
        s.fields = [
          {
            label: f.label,
            type: 'radio',
            required: true,
            validation: '',
            options: options.join(', '),
            only_in: null,
          },
          ...s.fields.filter((x) => !options.includes(x.label)),
        ];
      }
      // Every message the ground truth lists, as a full probe scan would record it.
      for (const message of f.messages ?? [])
        if (!s.validation.some((v) => v.field === f.label && v.message === message))
          s.validation.push({ field: f.label, message });
    }
  }
  return e;
}

describe('scoreExportQuality', () => {
  it('scores the approved export; it loses points only for its known flaws', () => {
    const q = scoreExportQuality(gt, [approved()])!;
    expect(q.scores).toEqual({
      export_steps: { matched: 5, total: 5, pct: 100 },
      export_fields: { matched: 13, total: 14, pct: 92.9 },
      export_validation: { matched: 14, total: 24, pct: 58.3 },
      export_actions: { matched: 5, total: 5, pct: 100 },
      export_apis: { matched: 2, total: 2, pct: 100 },
    });
    // The home page as step 1 (F-15, so the process starts at the wrong screen); "/" as a
    // destination of Dalej, Dalej, Oblicz składkę (F-11).
    expect(q.checks).toEqual({
      export_extra_steps: 1,
      export_action_strays: 3,
      export_noise_leaked: 0,
      export_wrong_start: 1,
      export_wrong_end: 0,
    });
    expect(q.missing).toContain('P01: field "Zakres"'); // F-16
    expect(q.missing).toContain(
      'P01: message "Please fill out this field." of "Wartość pojazdu (zł)"',
    ); // 4b not probed
    expect(q.missing).toContain(
      'P01: message "Value must be less than or equal to 2026." of "Rok produkcji"',
    ); // F-17
  });

  it('gives a corrected export full marks (the grader can reach 100 %)', () => {
    const q = scoreExportQuality(gt, [corrected()])!;
    for (const s of Object.values(q.scores)) expect(s.pct).toBe(100);
    expect(q.checks).toEqual({
      export_extra_steps: 0,
      export_action_strays: 0,
      export_noise_leaked: 0,
      export_wrong_start: 0,
      export_wrong_end: 0,
    });
    expect(q.missing).toEqual([]);
  });

  it('counts steps out of order, a noise call listed as an API and a missing export', () => {
    const e = corrected();
    e.steps.reverse();
    e.network.endpoints.push({ method: 'GET', path: '/analytics/collect', steps: [1] });
    const q = scoreExportQuality(gt, [e])!;
    expect(q.scores.export_steps.matched).toBe(1);
    expect(q.checks.export_noise_leaked).toBe(1);
    // Reversed: it starts at the result and ends at the first step (R-77 (2)).
    expect([q.checks.export_wrong_start, q.checks.export_wrong_end]).toEqual([1, 1]);
    const none = scoreExportQuality(gt, [])!;
    expect(none.scores.export_steps).toEqual({ matched: 0, total: 5, pct: 0 });
    expect(none.scores.export_fields.matched).toBe(0);
  });

  it('a field only one variant shows must be marked so', () => {
    const e = corrected();
    const opcje = e.steps.find((s) => s.route === '/kalkulator/opcje')!;
    opcje.fields.find((f) => f.label === 'Wartość pojazdu (zł)')!.only_in = null;
    expect(scoreExportQuality(gt, [e])!.missing).toEqual(['P01: field "Wartość pojazdu (zł)"']);
  });

  it('has nothing to score without export facts in the ground truth', () => {
    const plain = {
      ...gt,
      processes: gt.processes.map((p) => ({ ...p, actions: undefined, apis: undefined })),
    };
    expect(scoreExportQuality(plain, [approved()])).toBeNull();
  });
});
