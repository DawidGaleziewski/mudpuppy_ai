import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evalMcpConfig } from '../harness/agent.js';

describe('evalMcpConfig (spec 045 F-02)', () => {
  it("puts every server on the eval's environment and workspace, over the repo's own env", () => {
    const root = mkdtempSync(join(tmpdir(), 'pf-mcp-root-'));
    writeFileSync(
      join(root, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          mudpuppy: {
            command: 'pnpm',
            args: ['start'],
            env: { MUDPUPPY_ENV: 'local-dev', X: '1' },
          },
          'mudpuppy-ba': { command: 'pnpm', args: ['start:ba'] },
        },
      }),
    );
    const cfg = JSON.parse(readFileSync(evalMcpConfig(root, '/ws', 'sandbox'), 'utf8'));
    expect(cfg.mcpServers.mudpuppy.env).toEqual({
      MUDPUPPY_ENV: 'sandbox',
      MUDPUPPY_ROOT: '/ws',
      X: '1',
    });
    expect(cfg.mcpServers['mudpuppy-ba'].env.MUDPUPPY_ENV).toBe('sandbox');
    expect(cfg.mcpServers.mudpuppy.args).toEqual(['start']);
  });
});
