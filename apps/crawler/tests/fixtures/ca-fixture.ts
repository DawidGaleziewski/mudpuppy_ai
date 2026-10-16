import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A throwaway corporate CA and a `localhost` certificate it signed, made with `openssl` at test
 * time so no key file is ever committed (spec 031 US4). Null when `openssl` is missing.
 */
export interface CaFixture {
  dir: string;
  caPem: string;
  /** The CA file path (`ca.pem`). */
  caFile: string;
  leafKey: string;
  leafCert: string;
}

const run = (dir: string, args: string[]): boolean =>
  spawnSync('openssl', args, { cwd: dir, stdio: 'ignore' }).status === 0;

export function makeCaFixture(): CaFixture | null {
  const dir = mkdtempSync(join(tmpdir(), 'pf-ca-'));
  writeFileSync(join(dir, 'ext'), 'subjectAltName=DNS:localhost,IP:127.0.0.1\n');
  const ok =
    run(dir, [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'ca.key',
      '-out',
      'ca.pem',
      '-days',
      '2',
      '-subj',
      '/CN=Test Corp Issuing CA',
    ]) &&
    run(dir, [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'leaf.key',
      '-out',
      'leaf.csr',
      '-subj',
      '/CN=localhost',
    ]) &&
    run(dir, [
      'x509',
      '-req',
      '-in',
      'leaf.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      'leaf.pem',
      '-days',
      '2',
      '-extfile',
      'ext',
    ]);
  if (!ok) return null;
  return {
    dir,
    caPem: readFileSync(join(dir, 'ca.pem'), 'utf8'),
    caFile: join(dir, 'ca.pem'),
    leafKey: readFileSync(join(dir, 'leaf.key'), 'utf8'),
    leafCert: readFileSync(join(dir, 'leaf.pem'), 'utf8'),
  };
}
