/**
 * Import a crawler subagent transcript into every environment store it matches
 * (contracts/agent-import.md). Thin: all logic is in `@pathfinder/core`'s `importAgent`.
 *
 * Usage:
 *   pnpm trace:import-agent --hook                    # SubagentStop JSON on stdin
 *   pnpm trace:import-agent --transcript <path.jsonl>
 *   pnpm trace:import-agent --agent-id <id> [--data-dir <dir>]
 *
 * Prints one JSON object to stdout. `--hook` always exits 0 (never blocks the session);
 * otherwise exit 1 on unreadable input.
 */
import { join, resolve } from 'node:path';
import { importAgent } from '@pathfinder/core';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]
    : undefined;
};

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const isHook = process.argv.includes('--hook');
const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const dataDir = resolve(arg('data-dir') ?? join(root, 'data'));

async function main(): Promise<void> {
  let transcriptPath = arg('transcript');
  let agentId = arg('agent-id');

  if (isHook) {
    try {
      const payload = JSON.parse(await readStdin()) as Record<string, unknown>;
      transcriptPath =
        (payload.transcript_path as string | undefined) ??
        (payload.transcriptPath as string | undefined);
      agentId =
        (payload.agent_id as string | undefined) ??
        (payload.agentId as string | undefined) ??
        (payload.subagent_id as string | undefined);
    } catch (e) {
      console.log(JSON.stringify({ agent_id: null, stores: [], skipped: `hook input: ${e}` }));
      return;
    }
  }

  if (!transcriptPath && !agentId) {
    if (isHook) {
      // A SubagentStop payload with neither field (e.g. a non-crawler agent under a broader
      // matcher) is not an error: report it and exit 0, never blocking the session.
      console.log(
        JSON.stringify({
          agent_id: null,
          stores: [],
          skipped: 'no transcript_path or agent_id in hook payload',
        }),
      );
      return;
    }
    console.error('usage: pnpm trace:import-agent --hook | --transcript <path> | --agent-id <id>');
    process.exitCode = 1;
    return;
  }

  const result = await importAgent({ transcriptPath, agentId, dataDir });
  console.log(JSON.stringify(result));
  if (!isHook && result.stores.length === 0 && result.skipped) process.exitCode = 1;
}

main().catch((e) => {
  if (isHook) {
    console.log(JSON.stringify({ agent_id: null, stores: [], skipped: String(e) }));
    return;
  }
  console.error(e);
  process.exitCode = 1;
});
