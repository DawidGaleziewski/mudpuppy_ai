import type { EvalRecord, GroundTruth } from '@mudpuppy/docs';
import { describe, expect, it } from 'vitest';
import { rulesAsConstraintsOnly } from '../graders/code/docs-coverage.js';

const item = (name: string, constraints: Record<string, unknown>): EvalRecord => ({
  key: `DI-${name}`,
  kind: 'data_item',
  rev: 1,
  confidence: 'observed',
  not_observable: false,
  content: { name_verbatim: name, constraints },
  evidence: [],
});

const rule = (id: string, label: string) => ({
  id,
  statement: 's',
  type: 'validation',
  anchor: { screen: 'S01', label },
  guest_observable: true,
});

describe('rulesAsConstraintsOnly (spec 045, R-89 B diagnostic)', () => {
  it('counts a missed rule whose field carries a constraint, not one that matched or has none', () => {
    const gt = {
      rules: [rule('R01', 'Kod pocztowy'), rule('R02', 'Rok produkcji'), rule('R03', 'Telefon')],
    } as unknown as GroundTruth;
    const records = [
      item('Kod pocztowy', { pattern_observed: '\\d{2}-\\d{3}' }),
      item('Rok produkcji', { format: '1990–2026' }),
      item('Telefon', {}),
    ];
    expect(rulesAsConstraintsOnly(records, gt, ['R01', 'R03'])).toBe(1);
    expect(rulesAsConstraintsOnly(records, gt, [])).toBe(0);
  });
});
