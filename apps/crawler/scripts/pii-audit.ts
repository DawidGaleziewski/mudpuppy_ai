/**
 * SC-004 audit: scan data/evidence/ and the database for unmasked PII.
 * Usage: pnpm audit:pii [--env production] [--root <repo root>]
 * Exits 1 when anything is found; never prints the offending values.
 */
import { join, resolve } from 'node:path';
import { auditPii, dbPathFor, openDb } from '@pathfinder/core';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

const root = resolve(arg('root', join(import.meta.dirname, '../../..')));
const env = arg('env', 'production');
const opened = openDb(dbPathFor(join(root, 'data'), env));
try {
  const { scanned, findings } = await auditPii({
    evidenceDir: join(root, 'data/evidence'),
    db: opened.db,
  });
  console.log(`scanned ${scanned} evidence files and text fields (${env})`);
  for (const f of findings) console.log(`FOUND ${f.kinds.join(',')} in ${f.where}`);
  console.log(
    findings.length === 0 ? 'OK: no unmasked PII found' : `FAIL: ${findings.length} finding(s)`,
  );
  process.exitCode = findings.length === 0 ? 0 : 1;
} finally {
  await opened.close();
}
