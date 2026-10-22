import { resolveRuleId } from '@mudpuppy/config';
import { builtinRuleSet, type RuleSet } from './rule-set.js';
import type { Classification, Refusal } from './types.js';

/**
 * Deny by rule id: a rule the classifier fired on the action (label, href, method) or the id's
 * built-in PL/EN path patterns against the target URL. URLs and paths are excluded by the URL
 * lists (`url-lists.ts`, spec 023). Returns the rule that caused the refusal, or null.
 */
export function checkDenylist(
  denylist: readonly string[],
  target: { url?: string; classification?: Classification },
  ruleSet: RuleSet = builtinRuleSet(),
): Refusal | null {
  const path = target.url ? safePath(target.url) : null;

  for (const entry of denylist) {
    // An alias (`buy_now`) acts as its generic id and is reported as `buy_now→purchase` (FR-013).
    const { id, alias } = resolveRuleId(entry);
    const shown = alias === undefined ? id : `${alias}→${id}`;
    if (target.classification?.rules.includes(id)) {
      return { status: 'denylisted', rule: shown, reason: `action matches denylist rule ${shown}` };
    }
    const rule = ruleSet.get(id);
    if (rule && path !== null) {
      const norm = path.toLowerCase();
      if (rule.paths.some((p) => p.test(norm))) {
        return {
          status: 'denylisted',
          rule: shown,
          reason: `path ${path} matches denylist rule ${shown}`,
        };
      }
    }
  }
  return null;
}

function safePath(url: string): string | null {
  try {
    return new URL(url, 'https://placeholder.invalid').pathname;
  } catch {
    return null;
  }
}
