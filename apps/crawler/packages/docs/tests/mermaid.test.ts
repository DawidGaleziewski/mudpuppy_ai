import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { capabilityMap, label, nodeId, processMap, screenNav } from '../src/render/mermaid.js';

/** Shared with the dashboard's Python twin (research §9): both must match these bytes. */
const FIXTURES = fileURLToPath(
  new URL('../../../../../specs/004-ba-documentation/contracts/diagram-fixtures/', import.meta.url),
);
const read = (name: string) => readFileSync(`${FIXTURES}${name}`, 'utf8');
const input = (name: string) => JSON.parse(read(`${name}.json`));

describe('Mermaid builders (golden parity with the dashboard)', () => {
  it.each([
    ['process-map', processMap],
    ['screen-nav', screenNav],
    ['capability-map', capabilityMap],
  ] as const)('%s matches its golden byte for byte', (name, build) => {
    expect(build(input(name))).toBe(read(`${name}.mmd`));
  });

  it('a process without a boundary has no boundary node', () => {
    const out = processMap({ ...input('process-map'), boundary: null });
    expect(out).not.toContain('boundary');
  });

  it('escapes labels and node ids', () => {
    expect(label(' a  "b" <c> & d ')).toBe('a #quot;b#quot; #lt;c#gt; #amp; d');
    expect(nodeId('SCR-001')).toBe('SCR_001');
  });
});
