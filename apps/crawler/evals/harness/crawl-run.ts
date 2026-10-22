/**
 * The crawl run an agent session made: the newest run of the portal and persona started since
 * the session began.
 */
import { join } from 'node:path';
import { dbPathFor, openDb } from '@mudpuppy/store';
import type { EvalConfig } from '../config.js';
import { latestCrawlRun } from '../queries.js';

export async function findCrawlRun(
  c: EvalConfig,
  ws: string,
  since: string,
): Promise<string | undefined> {
  const db = openDb(dbPathFor(join(ws, 'data'), c.env));
  const run = latestCrawlRun(db.raw, c.portal, c.persona, since);
  await db.close();
  return run?.id;
}
