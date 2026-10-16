import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadTraces } from '../src/index.js';

const file = (yaml: string): string => {
  const f = join(mkdtempSync(join(tmpdir(), 'pf-traces-')), 'traces.yaml');
  writeFileSync(f, yaml);
  return f;
};

describe('traces.yaml (spec 030 R-64)', () => {
  it('reads a trace with steps, advance, submit, variants and a stub', () => {
    const traces = loadTraces(
      file(`traces:
  - id: apply
    name: Apply for a contract
    goal: Reach the success page
    start_url: /sc18/step-1
    steps:
      - { name: Full name, kind: fill, value: Test Person, intent: enter the name }
      - { name: I accept the terms, kind: check, intent: accept }
    advance: [Next]
    submit: Submit application
    variants:
      - { id: happy-path, expect: proceed }
      - { id: no-name, expect: validation_error, steps: [] }
  - id: change-address
    name: Change the address
    goal: Change the postal address
    start_url: /profile
    to_be_discovered: true
`),
    );
    expect(traces.map((t) => t.id)).toEqual(['apply', 'change-address']);
    expect(traces[0]!.variants.map((v) => v.expect)).toEqual(['proceed', 'validation_error']);
    expect(traces[1]!.variants).toEqual([{ id: 'happy-path', expect: 'proceed' }]);
  });

  it('is empty without a file and refuses bad entries naming the problem', () => {
    expect(loadTraces('/no/such/traces.yaml')).toEqual([]);
    expect(() =>
      loadTraces(
        file(
          'traces:\n  - { id: x, name: X, goal: G, start_url: /a, steps: [{ name: N, kind: fill, intent: i }] }\n',
        ),
      ),
    ).toThrow(/fill and select take a value/);
    expect(() =>
      loadTraces(file('traces:\n  - { id: x, name: X, goal: G, start_url: /a }\n')),
    ).toThrow(ConfigError);
  });
});
