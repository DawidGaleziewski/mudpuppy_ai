// A corporate CA the run trusts (spec 031 US4, R-63, field GC-12): behind a TLS-inspecting proxy
// every certificate is re-signed by the company's CA, which neither Node nor the browser trusts.
// The file is read by `readTrustedCa` (@pathfinder/config); applying it has two halves:
// - Node (robots fetch, the request gate's `route.fetch` of navigations): the certificates are
//   added to the process's default CA list (additive; the system roots stay).
// - Chromium: the certificates' SPKI hashes go to `--ignore-certificate-errors-spki-list`, which
//   accepts a chain only when one of its certificates has a listed key. The proxy must present the
//   CA in its chain (an issuing CA usually is); a root that is never presented does not help, so
//   the file should hold the issuing CA, and `pnpm portal:doctor` checks the presented chain.

import tls from 'node:tls';
import type { TrustedCa } from '@pathfinder/config';

const added = new Set<string>();

/** Add the certificates to Node's default CA list once per process (idempotent). */
export function trustInNode(ca: TrustedCa): void {
  const fresh = ca.pems.filter((p) => !added.has(p));
  if (fresh.length === 0) return;
  tls.setDefaultCACertificates([...tls.getCACertificates('default'), ...fresh]);
  fresh.forEach((p) => added.add(p));
}

/** Chromium launch arguments for the CA (none without one). */
export function chromiumCaArgs(ca: TrustedCa | null): string[] {
  return ca ? [`--ignore-certificate-errors-spki-list=${ca.spki.join(',')}`] : [];
}
