import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadPersona } from '../src/index.js';
import { tmpTree } from './helpers.js';

const OK = 'viewport: { width: 1, height: 1 }\nlocale: pl-PL\n';

const expectError = (fn: () => unknown): ConfigError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return e as ConfigError;
  }
  throw new Error('expected ConfigError');
};

describe('persona trace_inputs', () => {
  it('accepts a label (verbatim) to synthetic value map and defaults to empty', () => {
    const root = tmpTree({
      'p.yaml': `id: p\n${OK}trace_inputs:\n  "Pojemność silnika (cm³)": "1600"\n  Model: Testowy\n`,
      'q.yaml': `id: q\n${OK}`,
    });
    expect(loadPersona(join(root, 'p.yaml')).trace_inputs).toEqual({
      'Pojemność silnika (cm³)': '1600',
      Model: 'Testowy',
    });
    expect(loadPersona(join(root, 'q.yaml')).trace_inputs).toEqual({});
  });

  it.each([
    ['an e-mail', 'jan.kowalski@example.com'],
    ['a phone number', '+48 601 234 567'],
    ['a grouped phone number', '601-234-567'],
    ['a name after a label', 'Imię: Jan Kowalski'],
    ['a token', 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8'],
  ])('refuses a value the PII scrubber would change (%s) without echoing it', (_what, value) => {
    const root = tmpTree({ 'p.yaml': `id: p\n${OK}trace_inputs:\n  Kontakt: "${value}"\n` });
    const e = expectError(() => loadPersona(join(root, 'p.yaml')));
    expect(e.file).toBe(join(root, 'p.yaml'));
    expect(e.problems.join(' ')).toContain('trace_inputs');
    expect(e.problems.join(' ')).toContain('Kontakt');
    expect(e.message).not.toContain(value);
  });

  it('accepts an e-mail on a reserved test TLD', () => {
    const root = tmpTree({
      'p.yaml': `id: p\n${OK}trace_inputs:\n  E-mail: test@example.invalid\n`,
    });
    expect(loadPersona(join(root, 'p.yaml')).trace_inputs).toEqual({
      'E-mail': 'test@example.invalid',
    });
  });

  it('refuses an empty label or a non-string value', () => {
    const root = tmpTree({
      'a.yaml': `id: a\n${OK}trace_inputs:\n  "": x\n`,
      'b.yaml': `id: b\n${OK}trace_inputs:\n  Rok: 2020\n`,
    });
    expectError(() => loadPersona(join(root, 'a.yaml')));
    expectError(() => loadPersona(join(root, 'b.yaml')));
  });

  it('is inherited through extends, field by field, and checked in the mixin too', () => {
    const root = tmpTree({
      'mixin.yaml': 'trace_inputs:\n  Model: Testowy\n  Marka: Toyota\n',
      'bad-mixin.yaml': 'trace_inputs:\n  Kontakt: "jan@example.com"\n',
      'p.yaml': `id: p\nextends: [mixin.yaml]\n${OK}trace_inputs:\n  Marka: Skoda\n`,
      'q.yaml': `id: q\nextends: [bad-mixin.yaml]\n${OK}`,
    });
    expect(loadPersona(join(root, 'p.yaml')).trace_inputs).toEqual({
      Model: 'Testowy',
      Marka: 'Skoda',
    });
    const e = expectError(() => loadPersona(join(root, 'q.yaml')));
    expect(e.file).toBe(join(root, 'bad-mixin.yaml'));
  });
});
