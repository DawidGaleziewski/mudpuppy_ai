import { minSafetyClass, type SafetyClass } from '@pathfinder/core';
import type { Scope } from '@pathfinder/config';
import {
  checkBudgets,
  checkDenylist,
  checkScope,
  classifyAction,
  classifyUrl,
  type ActionDescriptor,
  type BudgetUsage,
  type Classification,
  type Decision,
  type RuleSet,
} from '@pathfinder/safety';
import type { RobotsCheck } from './robots-registry.js';

export type Proposal =
  /** A server-issued action extracted from the page at `currentUrl`. */
  | { kind: 'act'; descriptor: ActionDescriptor; currentUrl: string }
  /** A URL proposed to `navigate`. */
  | { kind: 'navigate'; url: string };

export interface GateContext {
  /** Portal scope already narrowed by the persona (`narrowScope`). */
  scope: Scope;
  denylist: readonly string[];
  /** The run's rule set (`portalRuleSet`), used by the classifier and the denylist. */
  rules: RuleSet;
  /** The run's robots policies (`RobotsRegistry`); only the synchronous check is used here. */
  robots: { check(url: string): RobotsCheck };
  /** min(portal, persona) from `assertRunAllowed` / `loadEffectiveConfig`. */
  effectiveMaxActionClass: SafetyClass;
  usage: BudgetUsage;
}

export type GateResult = Decision & { classification: Classification };

/** The URL an action would lead to, when it has one. */
function targetUrl(p: Proposal): string | undefined {
  if (p.kind === 'navigate') return p.url;
  const href = p.descriptor.href ?? p.descriptor.form?.action;
  if (href === undefined) return undefined;
  try {
    return new URL(href, p.currentUrl).toString();
  } catch {
    return href;
  }
}

/**
 * The single decision point for every proposed browser action or navigation. Pure: persists nothing
 * (the tools write the frontier item and decision-log entry from a refusal). Order:
 * classifier -> scope -> robots -> denylist -> effective ceiling -> budgets; the first failing check
 * refuses. A robots verdict of `unknown` (host policy not loaded yet) passes here: the request gate
 * awaits the policy before any request to that host leaves the browser.
 * There is no code path that executes an action without passing through here (Principle III/V).
 */
export function decide(proposal: Proposal, ctx: GateContext): GateResult {
  const classification =
    proposal.kind === 'act'
      ? classifyAction(proposal.descriptor, ctx.rules)
      : classifyUrl(proposal.url, ctx.rules);
  const url = targetUrl(proposal);

  if (url !== undefined) {
    const scope = checkScope(url, ctx.scope);
    if (scope.refusal) return { allowed: false, ...scope.refusal, classification };
    const robots = ctx.robots.check(url);
    if (robots.state === 'refused') {
      return {
        allowed: false,
        status: 'robots_disallowed',
        rule: robots.rule,
        reason: `robots.txt disallows ${url}`,
        policyId: robots.policyId,
        classification,
      };
    }
  }

  const denied = checkDenylist(ctx.denylist, { url, classification }, ctx.rules);
  if (denied) return { allowed: false, ...denied, classification };

  const { safetyClass } = classification;
  if (minSafetyClass(safetyClass, ctx.effectiveMaxActionClass) !== safetyClass) {
    return {
      allowed: false,
      status: 'skipped_unsafe',
      rule: `ceiling:${ctx.effectiveMaxActionClass}`,
      reason: `classified ${safetyClass} (${classification.reasons.join('; ') || 'no signals'}), above the effective ceiling ${ctx.effectiveMaxActionClass}`,
      classification,
    };
  }

  const budget = checkBudgets(ctx.usage, ctx.scope);
  if (budget) return { allowed: false, ...budget, classification };

  return { allowed: true, classification };
}
