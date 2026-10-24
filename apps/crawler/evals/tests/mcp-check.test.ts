import { describe, expect, it } from 'vitest';
import { serverReport } from '../harness/mcp-check.js';

describe('the dry run server check (R-97 (5))', () => {
  it('passes when every server lists tools', () => {
    const r = serverReport([
      { server: 'mudpuppy', tools: ['start_run', 'navigate'], error: null },
      { server: 'mudpuppy-ba', tools: ['list_runs'], error: null },
    ]);
    expect(r.ok).toBe(true);
    expect(r.lines).toEqual([
      'mcp mudpuppy: 2 tools (start_run, navigate)',
      'mcp mudpuppy-ba: 1 tools (list_runs)',
    ]);
  });

  it('fails on a server that did not start or offers nothing', () => {
    const down = serverReport([{ server: 'mudpuppy', tools: [], error: 'no answer in 60 s' }]);
    expect(down).toEqual({ ok: false, lines: ['mcp mudpuppy: did not start: no answer in 60 s'] });
    expect(serverReport([{ server: 'mudpuppy-ba', tools: [], error: null }]).ok).toBe(false);
  });
});
