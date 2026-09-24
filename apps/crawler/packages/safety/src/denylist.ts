import { resolveRuleId } from '@pathfinder/config';
import { builtinRuleSet, type RuleSet } from './rule-set.js';
import { matchesGlob } from './scope.js';
import type { Classification, Refusal } from './types.js';

/**
 * Deny by rule id, `path:` glob or `url:` glob (path plus `?query`, spec 002 FR-010). Rule ids match either a rule the classifier fired on the action
 * (label, href, method) or the id's built-in PL/EN path patterns against the target URL; `path:`
 * globs match the URL path. Returns the rule that caused the refusal, or null.
 */
export function checkDenylist(
  denylist: readonly string[],
  target: { url?: string; classification?: Classification },
  ruleSet: RuleSet = builtinRuleSet(),
): Refusal | null {
  const path = target.url ? safePath(target.url) : null;
  const pathAndQuery = target.url ? safePathAndQuery(target.url) : null;

  for (const entry of denylist) {
    if (entry.startsWith('url:')) {
      const glob = entry.slice('url:'.length);
      if (pathAndQuery !== null && matchesGlob(glob, pathAndQuery)) {
        return {
          status: 'denylisted',
          rule: entry,
          reason: `${pathAndQuery} matches denylist glob ${glob}`,
        };
      }
      continue;
    }
    if (entry.startsWith('path:')) {
      const glob = entry.slice('path:'.length);
      if (path !== null && matchesGlob(glob, path)) {
        return {
          status: 'denylisted',
          rule: entry,
          reason: `path ${path} matches denylist glob ${glob}`,
        };
      }
      continue;
    }
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

function safePathAndQuery(url: string): string | null {
  try {
    const u = new URL(url, 'https://placeholder.invalid');
    return u.pathname + u.search;
  } catch {
    return null;
  }
}
