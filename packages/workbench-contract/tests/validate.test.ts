// Contract tests (designer doc 17 § 7, spec 043 SC-001): every valid example passes, every invalid
// one is dropped or repaired with the code in `examples/invalid/EXPECTED.json`.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CONTRACT_DIR,
  GENERIC_WHY,
  createCommandChecker,
  createViewChecker,
  loadContract,
  type ViewComponent,
} from '../src/index.js';

const contract = loadContract();
const check = createViewChecker(contract);
const checkCommand = createCommandChecker(contract);
const example = (rel: string): unknown =>
  JSON.parse(readFileSync(`${CONTRACT_DIR}examples/${rel}`, 'utf8'));
const files = (dir: string) =>
  readdirSync(`${CONTRACT_DIR}examples/${dir}`).filter((f) => f !== 'EXPECTED.json');

interface Expected {
  outcome: 'dropped' | 'repaired';
  component?: number;
  field?: string;
  code: string;
  caught_by: 'schema' | 'server';
}
const EXPECTED = (example('invalid/EXPECTED.json') as { examples: Record<string, Expected> })
  .examples;

/** The designer's "server" layer for ids: PROC-999 is the record that does not exist. */
const idExists = (c: ViewComponent) => c.bind.record !== 'PROC-999';

describe('valid examples', () => {
  it.each(files('valid'))('%s passes in phase 3 with nothing dropped', (file) => {
    const raw = example(`valid/${file}`) as { components: unknown[] };
    const result = check(raw, { phase: 3, currentPath: 'chat', idExists });
    expect(result.dropped).toEqual([]);
    expect(result.repaired).toEqual([]);
    expect(result.spec.components).toHaveLength(raw.components.length);
  });

  it('a phase 2 component is dropped in phase 1 (not_in_phase)', () => {
    const result = check(example('valid/troubleshoot.json'), { phase: 1, currentPath: 'chat' });
    expect(result.dropped.map((d) => d.code)).toEqual(Array(4).fill('not_in_phase'));
    expect(result.fallback).toBe(true);
  });

  it('a plain chat answer is not a fallback', () => {
    const result = check(example('valid/chat-plain.json'), { phase: 1, currentPath: 'chat' });
    expect(result.fallback).toBe(false);
  });
});

describe('invalid examples', () => {
  it('covers every file the designer listed', () => {
    expect(files('invalid').sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('%s → %s', (file, want) => {
    const result = check(example(`invalid/${file}`), { phase: 3, currentPath: 'chat', idExists });
    if (want.outcome === 'dropped') {
      expect(result.dropped).toEqual([
        expect.objectContaining({ index: want.component, code: want.code }),
      ]);
    } else {
      expect(result.repaired).toEqual([{ field: want.field, code: want.code }]);
    }
  });

  it('markup in why becomes the generic sentence', () => {
    expect(
      check(example('invalid/markup-in-why.json'), { phase: 1, currentPath: 'chat' }).spec.why,
    ).toBe(GENERIC_WHY);
  });
});

describe('envelope repairs', () => {
  it('an unknown path keeps the current one; bad suggestions are dropped', () => {
    const result = check(
      {
        version: '1',
        path: 'admin',
        why: 'You asked.',
        components: [],
        suggestions: ['ok one', '<b>x</b>'],
      },
      { phase: 1, currentPath: 'mapping' },
    );
    expect(result.spec.path).toBe('mapping');
    expect(result.spec.suggestions).toEqual(['ok one']);
    expect(result.repaired.map((r) => r.code)).toEqual(['repaired_path', 'repaired_suggestions']);
  });

  it('a non-object is plain chat on the current path', () => {
    const result = check('<script>', { phase: 1, currentPath: 'chat' });
    expect(result.spec).toMatchObject({ path: 'chat', why: GENERIC_WHY, components: [] });
  });

  it('the same type bound to the same data twice is a duplicate', () => {
    const map = { type: 'LiveMap', bind: { scan: '01a110d5-2028-7000-8f3e-5c1a9b27d460' } };
    const result = check(
      {
        version: '1',
        path: 'mapping',
        why: 'You asked.',
        components: [
          { id: 'a', ...map },
          { id: 'b', ...map },
        ],
      },
      { phase: 1, currentPath: 'chat' },
    );
    expect(result.dropped).toEqual([{ index: 1, type: 'LiveMap', code: 'duplicate' }]);
  });
});

describe('command proposals', () => {
  it.each(['resume.json', 'attempt.json'])('%s is a valid proposal', (file) => {
    expect(checkCommand(example(`command/${file}`)).ok).toBe(true);
  });

  it('an unknown command is refused', () => {
    expect(checkCommand(example('command/invalid-unknown.json'))).toEqual({
      ok: false,
      code: 'unknown_command',
    });
  });

  it('arguments are checked per command', () => {
    expect(
      checkCommand({ command: 'scan.stop', args: { scan: '../x' }, reason: 'Stop it now.' }),
    ).toEqual({
      ok: false,
      code: 'bad_args',
    });
    expect(
      checkCommand({ command: 'scan.stop', args: { scan: '01a110d5' }, reason: '<b>' }),
    ).toEqual({
      ok: false,
      code: 'bad_reason',
    });
  });
});
