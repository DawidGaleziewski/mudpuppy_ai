import type { Budgets, Scope } from '@pathfinder/config';
import type { Refusal } from './types.js';

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

function domainAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((d) => {
    const a = d.toLowerCase();
    return h === a || h.endsWith(`.${a}`);
  });
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
  scope: Pick<Scope, 'allowed_domains' | 'allowed_paths' | 'external_link_policy'>,
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
  if (!scope.allowed_paths.some((g) => matchesGlob(g, parsed.pathname))) {
    return {
      inScope: false,
      external: false,
      refusal: {
        status: 'out_of_scope',
        rule: 'scope:path',
        reason: `${parsed.pathname} matches no allowed_paths entry`,
      },
    };
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
 * smaller value, domains are intersected, persona paths are kept only when a portal path already
 * covers them, and `record` wins over `follow`.
 */
export function narrowScope(
  portal: Scope,
  restrictions: Partial<Scope>,
  budgets: Partial<Budgets> = {},
): Scope {
  const min = (a: number, b: number | undefined): number => (b === undefined ? a : Math.min(a, b));
  const r = { ...restrictions, ...budgets };
  const domains = r.allowed_domains
    ? portal.allowed_domains.filter((d) => domainAllowed(d, r.allowed_domains!))
    : portal.allowed_domains;
  const paths = r.allowed_paths
    ? r.allowed_paths.filter((p) =>
        portal.allowed_paths.some((g) => matchesGlob(g, p.replace(/\*+$/, ''))),
      )
    : portal.allowed_paths;
  return {
    allowed_domains: domains,
    allowed_paths: paths,
    external_link_policy:
      portal.external_link_policy === 'record' || r.external_link_policy === 'record'
        ? 'record'
        : 'follow',
    max_depth: min(portal.max_depth, r.max_depth),
    max_states: min(portal.max_states, r.max_states),
    max_actions_per_state: min(portal.max_actions_per_state, r.max_actions_per_state),
    max_run_time_minutes: min(portal.max_run_time_minutes, r.max_run_time_minutes),
    max_steps: min(portal.max_steps, r.max_steps),
  };
}
