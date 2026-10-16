// `@pathfinder/doctor` (spec 030 R-63): the checks in the order they run, and a plain-text report.

import { browserLaunch, envDeclared, toolchainSqlite } from './checks/local.js';
import {
  netAllowlist,
  netProxy,
  netReach,
  robotsBehindProxy,
  tlsCaFile,
  wafUserAgent,
} from './checks/network.js';
import type { Check, CheckResult } from './registry.js';

export * from './registry.js';
export { httpProbe } from './http-probe.js';
export { tlsChainProbe } from './tls-chain.js';

/** Every check, in order: later ones read what earlier ones found. */
export const CHECKS: readonly Check[] = [
  envDeclared,
  toolchainSqlite,
  browserLaunch,
  netReach,
  wafUserAgent,
  netProxy,
  netAllowlist,
  tlsCaFile,
  robotsBehindProxy,
];

const MARK: Record<CheckResult['status'], string> = {
  ok: 'ok  ',
  warn: 'warn',
  fail: 'FAIL',
  skip: 'skip',
};

/** One line per check, a fix line under each warning or failure. */
export function formatReport(rows: readonly { check: Check; result: CheckResult }[]): string {
  return rows
    .flatMap(({ check, result }) => [
      `${MARK[result.status]}  ${check.id.padEnd(18)} ${check.title}: ${result.detail}`,
      ...(result.fix ? [`      fix: ${result.fix}`] : []),
    ])
    .join('\n');
}
