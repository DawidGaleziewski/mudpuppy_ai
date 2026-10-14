import { urlEntryProblem, type Budgets, type Scope } from '@pathfinder/config';
import type { Refusal } from './types.js';
import { checkUrlLists, type UrlLists } from './url-lists.js';

/** Glob over a URL path: `*` matches any run of characters (including `/`). Case-insensitive. */
export function globToRegExp(glob: string): RegExp {
  const src = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${src}$`, 'i');
}

export function matchesGlob(glob: string, path: string): boolean {
  return globToRegExp(glob).test(path);
}

/** `host` equals an allowed domain or is a subdomain of one. */
export function domainAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((d) => {
    const a = d.toLowerCase();
    return h === a || h.endsWith(`.${a}`);
  });
}

/** One set of URL lists and where it comes from (`urls`, `persona.urls`, `focus`). */
export interface ScopedUrlLists {
  where: string;
  lists: UrlLists;
}

/**
 * A run's scope: the portal's narrowed by the persona and by the BA's focus for the scan. A URL
 * must pass every set of URL lists (spec 023 US3): the portal's, the persona's, the focus's.
 */
export type RunScope = Scope & { url_lists: readonly ScopedUrlLists[] };

/** The BA's focus for one scan (spec 011 FR-017). Every part only narrows. */
export interface ScanFocus {
  /** The page the scan starts on, instead of the portal's base URL. */
  start_url?: string | null;
  /** Hosts the scan stays on; each must be one of the portal's domains or a subdomain of one. */
  only_domains?: readonly string[] | null;
  /** URL list entries (path globs usually) the scan stays within. */
  only_paths?: readonly string[] | null;
  /** URL list entries the scan never opens. */
  exclude_paths?: readonly string[] | null;
}

export class FocusError extends Error {}

/**
 * Narrow a run's scope by the BA's focus: its paths become one more set of URL lists every URL
 * must pass, so a focus never widens. A focus domain the scope does not already allow, a focus
 * entry that is not a usable URL list entry, or a start page outside the focused scope, is an
 * error naming it.
 */
export function focusScope(scope: RunScope, focus: ScanFocus, baseUrl: string): RunScope {
  let domains = scope.allowed_domains;
  if (focus.only_domains?.length) {
    const outside = focus.only_domains.filter((d) => !domainAllowed(d, scope.allowed_domains));
    if (outside.length)
      throw new FocusError(
        `address ${outside.join(', ')} not within the portal's ${scope.allowed_domains.join(', ')}`,
      );
    domains = [...focus.only_domains];
  }
  const entries = [...(focus.only_paths ?? []), ...(focus.exclude_paths ?? [])];
  const problems = entries.flatMap((e) => urlEntryProblem(e) ?? []);
  if (problems.length) throw new FocusError(problems.join('; '));
  const lists: UrlLists = {
    ...(focus.only_paths?.length ? { allowed: [...focus.only_paths] } : {}),
    disallowed: [...(focus.exclude_paths ?? [])],
  };
  const out: RunScope = {
    ...scope,
    allowed_domains: domains,
    url_lists: [...scope.url_lists, { where: 'focus', lists }],
  };
  const start = focus.start_url ?? baseUrl;
  const verdict = checkScope(start, out);
  if (verdict.refusal)
    throw new FocusError(`the start page ${start} is outside the focus: ${verdict.refusal.reason}`);
  return out;
}

export interface ScopeVerdict {
  inScope: boolean;
  /** True when the URL is on a domain outside `allowed_domains` (external-link policy applies). */
  external: boolean;
  refusal?: Refusal;
}

/**
 * Allowed domains/paths and the external-link policy. `record` (default) means an external link is
 * recorded and not followed; `follow` lets it through the scope check (it still faces every other gate).
 */
export function checkScope(
  url: string,
  scope: Pick<RunScope, 'allowed_domains' | 'external_link_policy' | 'url_lists'>,
): ScopeVerdict {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      inScope: false,
      external: false,
      refusal: { status: 'out_of_scope', rule: 'scope:url', reason: `not an absolute URL: ${url}` },
    };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      inScope: false,
      external: false,
      refusal: {
        status: 'out_of_scope',
        rule: 'scope:protocol',
        reason: `protocol ${parsed.protocol} is never followed`,
      },
    };
  }
  if (!domainAllowed(parsed.hostname, scope.allowed_domains)) {
    if (scope.external_link_policy === 'follow') return { inScope: true, external: true };
    return {
      inScope: false,
      external: true,
      refusal: {
        status: 'out_of_scope',
        rule: 'scope:domain',
        reason: `${parsed.hostname} is outside allowed_domains; external links are recorded, not followed`,
      },
    };
  }
  for (const { where, lists } of scope.url_lists) {
    const refusal = checkUrlLists(parsed.href, lists, where);
    if (refusal !== null) return { inScope: false, external: false, refusal };
  }
  return { inScope: true, external: false };
}

export interface BudgetUsage {
  depth: number;
  states: number;
  actionsInState: number;
  elapsedMs: number;
  steps: number;
}

/** First exceeded budget wins. `depth` is the depth the proposed action would reach. */
export function checkBudgets(usage: BudgetUsage, budgets: Budgets): Refusal | null {
  const checks: [keyof Budgets, boolean, string][] = [
    [
      'max_depth',
      usage.depth > budgets.max_depth,
      `depth ${usage.depth} exceeds ${budgets.max_depth}`,
    ],
    [
      'max_states',
      usage.states >= budgets.max_states,
      `${usage.states} states recorded, cap is ${budgets.max_states}`,
    ],
    [
      'max_actions_per_state',
      usage.actionsInState >= budgets.max_actions_per_state,
      `${usage.actionsInState} actions taken in this state, cap is ${budgets.max_actions_per_state}`,
    ],
    [
      'max_run_time_minutes',
      usage.elapsedMs >= budgets.max_run_time_minutes * 60_000,
      `run time reached ${budgets.max_run_time_minutes} minutes`,
    ],
    [
      'max_steps',
      usage.steps >= budgets.max_steps,
      `${usage.steps} steps taken, cap is ${budgets.max_steps}`,
    ],
  ];
  const hit = checks.find(([, exceeded]) => exceeded);
  return hit ? { status: 'budget_reached', rule: `budget:${hit[0]}`, reason: hit[2] } : null;
}

/**
 * Apply a persona's narrowing to the portal scope. A persona can only restrict: numeric caps take the
 * smaller value, domains are intersected, `record` wins over `follow`, and the URL lists of both
 * apply (a URL must pass the portal's and the persona's, spec 023 US3.5).
 */
export function narrowScope(
  portal: Scope,
  restrictions: Partial<Scope> & { urls?: UrlLists },
  budgets: Partial<Budgets> = {},
  portalUrls: UrlLists = {},
): RunScope {
  const min = (a: number, b: number | undefined): number => (b === undefined ? a : Math.min(a, b));
  const r = { ...restrictions, ...budgets };
  const domains = r.allowed_domains
    ? portal.allowed_domains.filter((d) => domainAllowed(d, r.allowed_domains!))
    : portal.allowed_domains;
  const urlLists: ScopedUrlLists[] = [{ where: 'urls', lists: portalUrls }];
  if (restrictions.urls) urlLists.push({ where: 'persona.urls', lists: restrictions.urls });
  return {
    allowed_domains: domains,
    url_lists: urlLists,
    external_link_policy:
      portal.external_link_policy === 'record' || r.external_link_policy === 'record'
        ? 'record'
        : 'follow',
    max_depth: min(portal.max_depth, r.max_depth),
    max_states: min(portal.max_states, r.max_states),
    max_actions_per_state: min(portal.max_actions_per_state, r.max_actions_per_state),
    max_run_time_minutes: min(portal.max_run_time_minutes, r.max_run_time_minutes),
    max_steps: min(portal.max_steps, r.max_steps),
    mfe_wait_ms: min(portal.mfe_wait_ms, r.mfe_wait_ms),
    frame_depth: min(portal.frame_depth, r.frame_depth),
    client_redirect_wait_ms: min(portal.client_redirect_wait_ms, r.client_redirect_wait_ms),
  };
}
