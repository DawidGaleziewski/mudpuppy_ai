// The doctor's check registry (spec 030 R-63, field GC-02): each check says when it applies, what it
// needs first, how it probes and, when it fails, the cause and the fix in one line. A new check is a
// file in `checks/` and a line in `CHECKS`; only its inputs come from the portal, never its logic.

import type { PortalConfig } from '@mudpuppy/config';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface CheckResult {
  status: CheckStatus;
  /** What was observed, facts only. */
  detail: string;
  /** The one-line fix, for `warn` and `fail`. */
  fix?: string;
}

/** What every check may read; probes share results through `facts`. */
export interface DoctorContext {
  root: string;
  portal: PortalConfig;
  environment: string;
  /** Results of checks that ran before, by id. */
  results: ReadonlyMap<string, CheckResult>;
  /** Values a check found for later ones (the direct status, the proxied status, …). */
  facts: Map<string, unknown>;
  /** Network access, injectable for tests. */
  http: HttpProbe;
  /** The TLS chain a site presents; the real probe when not given (spec 031 US4). */
  tlsChain?: TlsChainProbe;
}

/** A presented certificate: its subject and SPKI hash (Chromium's comparison). */
export interface PresentedCert {
  subject: string;
  spki: string;
}

/** The certificates an https site presents, directly or through a proxy tunnel; never throws. */
export type TlsChainProbe = (
  url: string,
  opts: { proxy?: string; timeoutMs?: number },
) => Promise<{ chain: PresentedCert[] } | { error: string; code?: string }>;

/**
 * One GET with a User-Agent, directly or through an HTTP proxy; never throws. `tunnel` sends an
 * http target through a CONNECT tunnel too (https always is).
 */
export type HttpProbe = (
  url: string,
  opts: { userAgent: string; proxy?: string; timeoutMs?: number; tunnel?: boolean },
) => Promise<{ status: number } | { error: string; code?: string }>;

export interface Check {
  id: string;
  title: string;
  /** Ids that must have passed (`ok` or `warn`) first; otherwise this one is skipped. */
  dependsOn?: readonly string[];
  appliesWhen?: (ctx: DoctorContext) => boolean;
  probe: (ctx: DoctorContext) => Promise<CheckResult>;
}

/** Run the checks in order; a check whose dependencies did not pass, or that does not apply, skips. */
export async function runChecks(
  checks: readonly Check[],
  ctx: Omit<DoctorContext, 'results' | 'facts'>,
): Promise<{ check: Check; result: CheckResult }[]> {
  const results = new Map<string, CheckResult>();
  const facts = new Map<string, unknown>();
  const full: DoctorContext = { ...ctx, results, facts };
  const out: { check: Check; result: CheckResult }[] = [];
  for (const check of checks) {
    const blocked = (check.dependsOn ?? []).find((d) => {
      const r = results.get(d);
      return !r || (r.status !== 'ok' && r.status !== 'warn');
    });
    let result: CheckResult;
    if (blocked) result = { status: 'skip', detail: `needs ${blocked} first` };
    else if (check.appliesWhen && !check.appliesWhen(full))
      result = { status: 'skip', detail: 'does not apply to this portal' };
    else
      result = await check.probe(full).catch((e: unknown) => ({
        status: 'fail' as const,
        detail: `the check itself failed: ${(e as Error).message}`,
      }));
    results.set(check.id, result);
    out.push({ check, result });
  }
  return out;
}
