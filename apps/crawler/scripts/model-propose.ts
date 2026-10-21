/**
 * Propose processes from the portal model (spec 039 design § 13.3):
 * `pnpm model:propose <portal> --env <env>`. Builds the weighted screen graph, runs
 * `pathfinder-miner communities` (apps/miner, Leiden, Python) on it, validates the answer and
 * writes each community of two or more screens as an open grouping suggestion (the Processes page).
 * Dismissed and already suggested sets are skipped. Never on the crawler's runtime path; needs `uv`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { dbPathFor, migrateUp, openDb, processGraph, writeProposals } from '@pathfinder/store';

const Communities = z.object({ communities: z.array(z.array(z.string().min(1))) });

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]
    : undefined;
};
const portal = process.argv[2];
const env = arg('env') ?? process.env.PATHFINDER_ENV;
if (!portal || portal.startsWith('--') || !env) {
  console.error('usage: pnpm model:propose <portal> --env <env>');
  process.exit(2);
}
const root = resolve(arg('root') ?? join(import.meta.dirname, '../../..'));
const work = mkdtempSync(join(tmpdir(), 'pf-propose-'));
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  const graph = processGraph(opened.raw, portal);
  const file = join(work, 'graph.json');
  writeFileSync(file, JSON.stringify(graph));
  const out = execFileSync(
    'uv',
    ['run', '--project', join(root, 'apps/miner'), 'pathfinder-miner', 'communities', '--in', file],
    { encoding: 'utf8' },
  );
  const { communities } = Communities.parse(JSON.parse(out));
  const written = writeProposals(opened.raw, portal, communities, graph);
  console.log(
    `${portal} (${env}): ${graph.nodes.length} screens, ${graph.edges.length} weighted links, ` +
      `${communities.length} communities, ${written.length} new suggestion(s)`,
  );
  for (const name of written) console.log(`  ${name}`);
} finally {
  await opened.close();
  rmSync(work, { recursive: true, force: true });
}
