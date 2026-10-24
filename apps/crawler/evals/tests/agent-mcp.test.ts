import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvalConfig } from '../config.js';
import { evalMcpConfig, removeMcpConfig, runAgent } from '../harness/agent.js';

const spawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawnSync: spawn }));

const configFiles = () => readdirSync(tmpdir()).filter((f) => f.startsWith('pf-eval-mcp-'));

function repoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'pf-mcp-root-'));
  writeFileSync(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { mudpuppy: {} } }));
  return root;
}

afterEach(() => {
  removeMcpConfig();
  spawn.mockReset();
});

describe('runAgent MCP config file (spec 078 F-07)', () => {
  const run = (root: string) =>
    runAgent({ root, env: 'sandbox', budgetUsd: '1' } as EvalConfig, '/ws', 'crawler', 'p', 's');

  it('leaves no pf-eval-mcp file behind after a session', () => {
    const before = new Set(configFiles());
    spawn.mockImplementation(() => {
      expect(configFiles().some((f) => !before.has(f))).toBe(true);
      return { stdout: JSON.stringify({ result: 'ok', subtype: 'success' }), stderr: '' };
    });
    run(repoRoot());
    expect(spawn).toHaveBeenCalledOnce();
    expect(configFiles().filter((f) => !before.has(f))).toEqual([]);
  });

  it('removes the file when the claude call throws', () => {
    const before = new Set(configFiles());
    spawn.mockImplementation(() => {
      throw new Error('spawn failed');
    });
    expect(() => run(repoRoot())).toThrow('spawn failed');
    expect(configFiles().filter((f) => !before.has(f))).toEqual([]);
  });
});

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
