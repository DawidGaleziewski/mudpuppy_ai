import { describe, expect, it } from 'vitest';
import { samplePersonas } from '../src/persona-sample.js';

describe('samplePersonas (spec 024 US4, spec 046)', () => {
  it('keeps one persona per attribute combination and lists the one-attribute pairs', () => {
    const s = samplePersonas([
      { id: 'u3', attributes: { tariff: 'basic', features: ['export'] } },
      { id: 'u1', attributes: { tariff: 'basic', features: ['export'] } },
      { id: 'u2', attributes: { tariff: 'premium', features: ['export'] } },
      { id: 'u4', attributes: { tariff: 'premium', features: ['export', 'api'] } },
      { id: 'u5', attributes: { tariff: 'basic' } },
    ]);
    expect(s.chosen.map((c) => c.id)).toEqual(['u1', 'u2', 'u4', 'u5']);
    expect(s.chosen[0]).toEqual({
      id: 'u1',
      combination: { features: 'export', tariff: 'basic' },
      stands_for: ['u3'],
    });
    expect(s.left_out).toEqual(['u3']);
    expect(s.pairs).toEqual([
      { a: 'u1', b: 'u2', attribute: 'tariff' },
      { a: 'u1', b: 'u5', attribute: 'features' },
      { a: 'u2', b: 'u4', attribute: 'features' },
    ]);
  });

  it('a portal without attributes keeps one persona', () => {
    const s = samplePersonas([
      { id: 'b', attributes: {} },
      { id: 'a', attributes: {} },
    ]);
    expect(s.chosen.map((c) => c.id)).toEqual(['a']);
    expect(s.pairs).toEqual([]);
  });
});
