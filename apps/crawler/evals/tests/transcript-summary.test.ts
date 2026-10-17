import { expect, it } from 'vitest';
import { summariseTranscript } from '../transcript-summary.js';

const use = (id: string, name: string, input: Record<string, unknown>) =>
  JSON.stringify({
    type: 'assistant',
    message: {
      usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 5 },
      content: [{ type: 'tool_use', id, name: `mcp__pathfinder-ba__${name}`, input }],
    },
  });
const result = (id: string, body: unknown, is_error = false) =>
  JSON.stringify({
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: id, is_error, content: JSON.stringify(body) }],
    },
  });

it('counts calls, records written, refusals and the records before each pass', () => {
  const s = summariseTranscript([
    use('1', 'create_record', { kind: 'data_item' }),
    result('1', { key: 'DI-001' }),
    use('2', 'create_record', { kind: 'data_item' }),
    result('2', { error: { code: 'SCHEMA_INVALID', message: 'technical name' } }, true),
    use('3', 'record_pass', { pass: 'data' }),
    result('3', { passes: ['data'], warnings: ['1 form field(s) …'] }),
    'not json',
  ]);
  expect(s.calls).toEqual({ create_record: 2, record_pass: 1 });
  expect(s.written).toEqual({ data_item: 1 });
  expect(s.refused).toEqual([
    { tool: 'create_record', code: 'SCHEMA_INVALID', message: 'technical name' },
  ]);
  expect(s.passes).toEqual([{ pass: 'data', records_before: 1, warnings: ['1 form field(s) …'] }]);
  expect(s).toMatchObject({ turns: 3, max_context_tokens: 1015 });
});
