/**
 * Test-user credentials per portal and environment (spec 009 R-26, contracts/vault-cli.md).
 * Usage: pnpm vault <set|list|delete|generate|check|reveal> … (run without arguments for help).
 * Values are read from a hidden prompt or stdin, never from the command line.
 */
import { join, resolve } from 'node:path';
import { requireEnvironment } from '@pathfinder/config';
import { runVaultCli } from '@pathfinder/vault';
import { dbPathFor, migrateUp, openDb } from '@pathfinder/store';

const argv = process.argv.slice(2);
const envIdx = argv.indexOf('--env');
const root = resolve(join(import.meta.dirname, '../../..'));
// Only a declared environment (spec 030 R-61): a typo would create a separate, empty store. The
// `sandbox` fallback stays for this operator CLI (its documented commands rely on it).
const env = requireEnvironment(
  root,
  (envIdx > -1 ? argv[envIdx + 1] : undefined) ?? process.env.PATHFINDER_ENV ?? 'sandbox',
);
// pnpm runs this from apps/crawler; file arguments (`import <csv>`, `--seed`) are the caller's.
if (process.env.INIT_CWD) process.chdir(process.env.INIT_CWD);

async function readSecret(prompt: string, fromStdin: boolean): Promise<string> {
  if (fromStdin || !process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '');
  }
  // Hidden TTY prompt: raw mode, nothing echoed.
  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = '';
  try {
    for await (const chunk of process.stdin) {
      for (const ch of (chunk as Buffer).toString('utf8')) {
        if (ch === '\r' || ch === '\n') return value;
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        if (ch === '\u007f') value = value.slice(0, -1);
        else value += ch;
      }
    }
    return value;
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stderr.write('\n');
  }
}

const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  migrateUp(opened.raw, join(root, 'data/migrations'));
  process.exitCode = await runVaultCli(argv, {
    db: opened.db,
    root,
    defaultEnv: env,
    out: (l) => console.log(l),
    err: (l) => console.error(l),
    readSecret,
  });
} finally {
  await opened.close();
}
