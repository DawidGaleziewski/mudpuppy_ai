import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadPersona, loadPortal, loadTraces } from '../src/index.js';
import { PORTAL_YAML, tmpTree } from './helpers.js';

const OK = 'viewport: { width: 1, height: 1 }\nlocale: pl-PL\n';

describe('spec 032: probe budget, test data, trace faults', () => {
  it('gives every portal the owner budget of 12 probes per step and 60 per run (O-M4)', () => {
    const root = tmpTree({ 'portal.yaml': PORTAL_YAML });
    expect(loadPortal(join(root, 'portal.yaml')).probes).toEqual({ per_step: 12, per_run: 60 });
    const own = tmpTree({ 'portal.yaml': `${PORTAL_YAML}probes: { per_step: 4, per_run: 0 }\n` });
    expect(loadPortal(join(own, 'portal.yaml')).probes).toEqual({ per_step: 4, per_run: 0 });
    const bad = tmpTree({ 'portal.yaml': `${PORTAL_YAML}probes: { per_form: 3 }\n` });
    expect(() => loadPortal(join(bad, 'portal.yaml'))).toThrow(ConfigError);
  });

  it('keeps the persona test data a form needs (O-M3), synthetic only', () => {
    const root = tmpTree({
      'p.yaml': `id: p\n${OK}test_data:\n  Marka: Skoda\n  Start date: "01.01.2027"\n`,
      'q.yaml': `id: q\n${OK}test_data:\n  Kontakt: "jan@example.com"\n`,
    });
    expect(loadPersona(join(root, 'p.yaml')).test_data).toEqual({
      Marka: 'Skoda',
      'Start date': '01.01.2027',
    });
    expect(() => loadPersona(join(root, 'q.yaml'))).toThrow(/looks like personal data/);
  });

  it('reads technical and branch variants, and ties a fault to technical_error only', () => {
    const write = (yaml: string): string => {
      const f = join(mkdtempSync(join(tmpdir(), 'pf-traces-')), 'traces.yaml');
      writeFileSync(f, yaml);
      return f;
    };
    const head =
      'traces:\n  - id: quote\n    name: Quote\n    goal: G\n    start_url: /q\n    submit: Next\n    variants:\n';
    const traces = loadTraces(
      write(
        `${head}      - { id: happy-path, expect: proceed }\n      - { id: quote-500, expect: technical_error, fault: http_500, probe: http-500 }\n      - { id: business, expect: branch }\n`,
      ),
    );
    expect(traces[0]!.variants.map((v) => [v.id, v.expect, v.fault])).toEqual([
      ['happy-path', 'proceed', undefined],
      ['quote-500', 'technical_error', 'http_500'],
      ['business', 'branch', undefined],
    ]);
    expect(() => loadTraces(write(`${head}      - { id: x, expect: technical_error }\n`))).toThrow(
      /needs a fault/,
    );
    expect(() =>
      loadTraces(write(`${head}      - { id: x, expect: proceed, fault: offline }\n`)),
    ).toThrow(/needs a fault/);
  });
});
