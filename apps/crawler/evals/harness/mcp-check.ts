/**
 * The dry run's server check (R-97 (5)): boot each MCP server the agents get, on the eval's
 * workspace and environment, and list its tools. A server that does not start (spec 045 F-02: the
 * developer's store; F-03: a migration refused) used to show only inside a paid trial.
 */
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface Server {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ServerTools {
  server: string;
  tools: string[];
  error: string | null;
}

const START_TIMEOUT_MS = 60_000;

async function toolsOf(name: string, s: Server, cwd: string): Promise<ServerTools> {
  const client = new Client({ name: 'eval-dry-run', version: '0' });
  const transport = new StdioClientTransport({
    command: s.command,
    args: s.args ?? [],
    env: { ...(process.env as Record<string, string>), ...s.env },
    cwd,
    stderr: 'ignore',
  });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no answer in ${String(START_TIMEOUT_MS / 1000)} s`)),
      START_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([client.connect(transport), timeout]);
    const { tools } = await Promise.race([client.listTools(), timeout]);
    return { server: name, tools: tools.map((t) => t.name), error: null };
  } catch (error) {
    return {
      server: name,
      tools: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => undefined);
  }
}

/** Every server of an eval MCP config (`evalMcpConfig`), started from `cwd`, with its tools. */
export async function serverTools(configPath: string, cwd: string): Promise<ServerTools[]> {
  const { mcpServers } = JSON.parse(readFileSync(configPath, 'utf8')) as {
    mcpServers: Record<string, Server>;
  };
  const out: ServerTools[] = [];
  for (const [name, s] of Object.entries(mcpServers)) out.push(await toolsOf(name, s, cwd));
  return out;
}

/** One line per server for the dry run; `ok` is false when one did not start or has no tools. */
export function serverReport(servers: readonly ServerTools[]): { ok: boolean; lines: string[] } {
  const lines = servers.map((s) =>
    s.error === null
      ? `mcp ${s.server}: ${String(s.tools.length)} tools (${s.tools.join(', ')})`
      : `mcp ${s.server}: did not start: ${s.error}`,
  );
  return { ok: servers.every((s) => s.error === null && s.tools.length > 0), lines };
}
