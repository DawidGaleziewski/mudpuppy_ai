import { describe, expect, it } from 'vitest';
import { countBaWrites } from '../graders/code/ba-writes.js';

/** Transcript lines as Claude Code writes them: one JSON entry per content block. */
const use = (id: string, name: string) =>
  JSON.stringify({ message: { content: [{ type: 'tool_use', id, name, input: {} }] } });
const result = (id: string, body: unknown, isError?: boolean) =>
  JSON.stringify({
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: id,
          ...(isError === undefined ? {} : { is_error: isError }),
          content: [{ type: 'text', text: JSON.stringify(body) }],
        },
      ],
    },
  });

describe('countBaWrites (spec 019 US4, spec 015 F-20/F-22)', () => {
  it('counts write calls and refusals by code from the results, not the calls', () => {
    const lines = [
      use('a', 'mcp__mudpuppy-ba__create_record'),
      result('a', { key: 'SCR-001', rev_no: 1 }),
      use('b', 'mcp__mudpuppy-ba__create_record'),
      result('b', { error: { code: 'SCHEMA_INVALID', message: 'content.elements.0' } }, true),
      use('c', 'mcp__mudpuppy-ba__create_record'),
      result('c', { error: { code: 'RELATION_NOT_ALLOWED' } }),
      use('d', 'mcp__mudpuppy-ba__revise_record'),
      result('d', { error: { code: 'SCHEMA_INVALID' } }, true),
      use('e', 'mcp__mudpuppy-ba__get_run_evidence'),
      result('e', { error: { code: 'RUN_NOT_FOUND' } }, true),
      'not json',
      use('f', 'mcp__mudpuppy-ba__withdraw_record'),
    ];
    expect(countBaWrites(lines)).toEqual({
      calls: 5,
      refused: 3,
      refused_pct: 60,
      by_code: { SCHEMA_INVALID: 2, RELATION_NOT_ALLOWED: 1 },
    });
  });

  it('is zero, not a division by zero, without writes', () => {
    expect(countBaWrites([])).toEqual({ calls: 0, refused: 0, refused_pct: 0, by_code: {} });
  });
});
