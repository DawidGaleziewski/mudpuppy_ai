// The corporate CA file of a portal (`network.ca_file`, spec 031 US4, R-63, field GC-12): one or
// more PEM certificates the run trusts instead of ignoring every certificate error. Read here so
// preflight and the doctor check it the same way; the crawler applies it (`trusted-ca.ts`).

import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ConfigError } from './errors.js';

export interface TrustedCa {
  file: string;
  pems: string[];
  /** base64 SHA-256 of each certificate's SubjectPublicKeyInfo (Chromium's SPKI list format). */
  spki: string[];
  /** Subject of each certificate, for messages. */
  subjects: string[];
}

const PEM = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

/** SPKI hash of one certificate, the way Chromium compares it. */
export function spkiHash(cert: X509Certificate): string {
  const der = cert.publicKey.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('base64');
}

/** Read and check a CA file; a `ConfigError` names the file and the problem. */
export function readTrustedCa(file: string): TrustedCa {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    throw new ConfigError(file, [`network.ca_file cannot be read: ${(e as Error).message}`]);
  }
  const pems = text.match(PEM) ?? [];
  if (pems.length === 0)
    throw new ConfigError(file, ['network.ca_file holds no PEM certificate (BEGIN CERTIFICATE)']);
  const certs = pems.map((p, i) => {
    try {
      return new X509Certificate(p);
    } catch (e) {
      throw new ConfigError(file, [`certificate ${i + 1}: ${(e as Error).message}`]);
    }
  });
  return {
    file,
    pems,
    spki: certs.map(spkiHash),
    subjects: certs.map((c) => c.subject.replace(/\n/g, ', ')),
  };
}
