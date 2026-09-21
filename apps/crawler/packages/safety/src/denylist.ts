import { ACTION_RULES } from './rules.js';
import { matchesGlob } from './scope.js';
import type { Classification, Refusal } from './types.js';

/**
 * Deny by rule id or `path:` glob. Rule ids match either a rule the classifier fired on the action
 * (label, href, method) or the id's built-in PL/EN path patterns against the target URL; `path:`
 * globs match the URL path. Returns the rule that caused the refusal, or null.
 */
export function checkDenylist(
  denylist: readonly string[],
  target: { url?: string; classification?: Classification },
): Refusal | null {
  const path = target.url ? safePath(target.url) : null;

  for (const entry of denylist) {
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
    if (target.classification?.rules.includes(entry)) {
      return { status: 'denylisted', rule: entry, reason: `action matches denylist rule ${entry}` };
    }
    const rule = ACTION_RULES.find((r) => r.id === entry);
    if (rule && path !== null) {
      const norm = path.toLowerCase();
      if (rule.paths.some((p) => p.test(norm))) {
        return {
          status: 'denylisted',
          rule: entry,
          reason: `path ${path} matches denylist rule ${entry}`,
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
