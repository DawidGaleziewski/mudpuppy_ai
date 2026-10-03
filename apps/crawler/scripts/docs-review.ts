/**
 * Record a human review of a documentation revision (specs/004 contracts/operator-cli.md; R-15).
 * Usage:
 *   echo '{"portal_id":…,"key":…,"rev_no":…,"action":…,"text":…,"reviewer":…}' | pnpm docs:review [--env production]
 *   pnpm docs:review --portal <p> --key <K> --rev <n> --action confirm|reject|comment [--text <t>] --reviewer <name>
 *   pnpm docs:review --portal <p> --cancel-followup <FUP-key> --reviewer <name> --text <reason>
 * Prints one JSON line. Exit 0 ok, 2 refused, 1 unexpected.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dbPathFor, openDb } from '@pathfinder/core';
import { DocsError, applyReview, cancelFollowup } from '@pathfinder/docs';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : undefined;
};
const out = (body: unknown, code: number): never => {
  process.stdout.write(`${JSON.stringify(body)}\n`);
  process.exit(code);
};
const refused = (code: string, message: string, details: Record<string, unknown> = {}) =>
  out({ ok: false, error: { code, message, ...details } }, 2);

const root = resolve(flag('root') ?? join(import.meta.dirname, '../../..'));
const env = flag('env') ?? 'production';
const path = dbPathFor(join(root, 'data'), env);
if (!existsSync(path)) refused('STORE_NOT_FOUND', `no store for environment ${env}: ${path}`);

const cancelKey = flag('cancel-followup');
let input: Record<string, unknown>;
if (cancelKey !== undefined) {
  input = {
    portal_id: flag('portal'),
    key: cancelKey,
    reviewer: flag('reviewer'),
    text: flag('text'),
  };
} else if (flag('key') !== undefined) {
  const rev = flag('rev');
  input = {
    portal_id: flag('portal'),
    key: flag('key'),
    rev_no: rev === undefined ? undefined : Number(rev),
    action: flag('action'),
    reviewer: flag('reviewer'),
    ...(flag('text') !== undefined ? { text: flag('text') } : {}),
  };
} else {
  try {
    input = JSON.parse(readFileSync(0, 'utf8')) as Record<string, unknown>;
  } catch (e) {
    refused('SCHEMA_INVALID', `stdin is not one JSON object: ${(e as Error).message}`);
  }
}

const opened = openDb(path);
try {
  const result =
    cancelKey !== undefined ? cancelFollowup(opened.raw, input!) : applyReview(opened.raw, input!);
  await opened.close();
  out(result, 0);
} catch (e) {
  await opened.close();
  if (e instanceof DocsError) refused(e.code, e.message, e.details);
  out({ ok: false, error: { code: 'UNEXPECTED', message: (e as Error).message } }, 1);
}
