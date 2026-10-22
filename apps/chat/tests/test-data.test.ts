// save_test_data (spec 032, owner answer O-M3): test values the BA gave are merged into an existing
// persona's test_data with its comments kept; personal data and a persona that would no longer
// load are refused, and the file is left as it was.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPersona } from '@mudpuppy/config';
import { describe, expect, it } from 'vitest';
import { PersonaRefusal } from '../src/personas.js';
import { saveTestData } from '../src/test-data.js';

const PERSONA = '# the quote tester\nid: quoter\nviewport: { width: 1, height: 1 }\nlocale: en-GB\ntest_data:\n  Start date: "01.01.2027"\n';

function tree(): { repoRoot: string; file: string } {
  const repoRoot = mkdtempSync(join(tmpdir(), 'pf-testdata-'));
  mkdirSync(join(repoRoot, 'personas', 'scar-maker'), { recursive: true });
  mkdirSync(join(repoRoot, 'personas', '_mixins'), { recursive: true });
  const file = join(repoRoot, 'personas', 'scar-maker', 'quoter.yaml');
  writeFileSync(file, PERSONA);
  return { repoRoot, file };
}

describe('save_test_data', () => {
  it('merges the values into test_data and keeps the comments', () => {
    const { repoRoot, file } = tree();
    const out = saveTestData({ repoRoot }, {
      portal: 'scar-maker',
      persona: 'quoter',
      values: { 'Tax number': '1234567890', 'Start date': '02.02.2027' },
    });
    expect(out.saved).toEqual(['Tax number', 'Start date']);
    expect(readFileSync(file, 'utf8')).toContain('# the quote tester');
    expect(loadPersona(file).test_data).toEqual({ 'Start date': '02.02.2027', 'Tax number': '1234567890' });
  });

  it('refuses personal data and an unknown persona, leaving the file as it was', () => {
    const { repoRoot, file } = tree();
    expect(() =>
      saveTestData({ repoRoot }, { portal: 'scar-maker', persona: 'quoter', values: { 'E-mail': 'jan@example.com' } }),
    ).toThrow(PersonaRefusal);
    expect(readFileSync(file, 'utf8')).toBe(PERSONA);
    expect(() => saveTestData({ repoRoot }, { portal: 'scar-maker', persona: 'nobody', values: { A: 'x' } })).toThrow(
      /no persona/,
    );
  });
});
