import { maxSafetyClass, type SafetyClass } from '@pathfinder/core';
import type { ActionRuleConfig, PortalConfig } from '@pathfinder/config';
import { ACTION_RULES, normalize, type ActionRule } from './rules.js';
import { globToRegExp } from './scope.js';

/**
 * The action rules one run classifies with (research §6). A value, not a module constant, so a
 * portal's own rules apply only to that portal's runs and several runs can share one process.
 */
export interface RuleSet {
  readonly rules: readonly ActionRule[];
  get(id: string): ActionRule | undefined;
}

export function ruleSetOf(rules: readonly ActionRule[]): RuleSet {
  const frozen = Object.freeze([...rules]);
  const byId = new Map(frozen.map((r) => [r.id, r]));
  return { rules: frozen, get: (id) => byId.get(id) };
}

const BUILTIN = ruleSetOf(ACTION_RULES);

export function builtinRuleSet(): RuleSet {
  return BUILTIN;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A plain phrase, matched on word boundaries after the same normalisation as labels. */
function phrase(keyword: string): RegExp {
  return new RegExp(`\\b${normalize(keyword).split(' ').map(escape).join('\\s+')}\\b`);
}

/**
 * Add a portal's `action_rules` to a rule set (research §7). A new id becomes a rule with its class;
 * a built-in id gains the keywords and paths and, when given, a higher class. Nothing is removed and
 * no class is lowered (the config schema rejects that; `maxSafetyClass` makes it impossible here).
 */
export function extendRuleSet(
  base: RuleSet,
  portalRules: readonly Pick<ActionRuleConfig, 'id' | 'class' | 'keywords' | 'paths'>[],
): RuleSet {
  const rules = [...base.rules];
  for (const r of portalRules) {
    const keywords = (r.keywords ?? []).map(phrase);
    const paths = (r.paths ?? []).map(globToRegExp);
    const i = rules.findIndex((x) => x.id === r.id);
    if (i === -1) {
      rules.push({
        id: r.id,
        safetyClass: (r.class ?? 'mutating') as SafetyClass,
        keywords,
        paths,
        origin: 'portal',
      });
      continue;
    }
    const b = rules[i]!;
    rules[i] = {
      ...b,
      safetyClass: r.class ? maxSafetyClass(b.safetyClass, r.class) : b.safetyClass,
      keywords: [...b.keywords, ...keywords],
      paths: [...b.paths, ...paths],
      origin: 'builtin+portal',
    };
  }
  return ruleSetOf(rules);
}

/** The rule set of a run of `portal`: the built-in rules, extended by the portal's own rules (FR-019). */
export function portalRuleSet(portal: Pick<PortalConfig, 'action_rules'> | undefined): RuleSet {
  const own = portal?.action_rules ?? [];
  return own.length === 0 ? BUILTIN : extendRuleSet(BUILTIN, own);
}

/** The resolved rules of a run, for its config snapshot: a run can be re-explained without the portal file. */
export function ruleSetSummary(set: RuleSet): { id: string; class: string; origin: string }[] {
  return set.rules.map((r) => ({ id: r.id, class: r.safetyClass, origin: r.origin ?? 'builtin' }));
}
