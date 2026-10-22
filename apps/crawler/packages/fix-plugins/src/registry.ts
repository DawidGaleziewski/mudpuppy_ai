// Every fix-plugin by id, and turning a portal's `fixes:` list into hooks the runner executes
// (spec 030 FR-031). A fix's hooks run like the portal's own hooks: traced as `fix:<id>`, time-boxed,
// never fatal; fixes run before the portal's hooks of the same point, in the order listed.

import { ConfigError, type FixSpec, type HookPoint } from '@mudpuppy/config';
import type { Hook, LoadedHook } from '@mudpuppy/hooks';
import { matchUrlEntry } from '@mudpuppy/safety';
import type { FixPlugin } from './define.js';
import { detectStack } from './fixes/detect-stack.js';
import { expandCollapsed } from './fixes/expand-collapsed.js';
import { seedCookie } from './fixes/seed-cookie.js';
import { waitForMount } from './fixes/wait-for-mount.js';

export const FIXES: ReadonlyMap<string, FixPlugin> = new Map(
  [seedCookie, expandCollapsed, waitForMount, detectStack].map((f) => [f.id, f]),
);

/** The hooks of a portal's fixes; an unknown fix or bad parameters is a `ConfigError`. */
export function loadFixes(source: string, specs: readonly FixSpec[]): LoadedHook[] {
  const problems: string[] = [];
  const loaded: LoadedHook[] = [];
  specs.forEach((spec, i) => {
    const plugin = FIXES.get(spec.use);
    if (!plugin) {
      problems.push(
        `fixes[${String(i)}]: unknown fix "${spec.use}" (known: ${[...FIXES.keys()].join(', ')})`,
      );
      return;
    }
    const params = plugin.params.safeParse(spec.with);
    if (!params.success) {
      for (const issue of params.error.issues)
        problems.push(
          `fixes[${String(i)}] (${spec.use}).with.${issue.path.join('.')}: ${issue.message}`,
        );
      return;
    }
    const hooks = plugin.hooks(params.data);
    for (const [point, fn] of Object.entries(hooks) as [HookPoint, Hook][])
      loaded.push({
        spec: {
          point,
          fn: `fix:${plugin.id}`,
          ...(spec.match !== undefined ? { match: spec.match } : {}),
          timeout_ms: spec.timeout_ms,
        },
        fn,
        matches: (url) => spec.match === undefined || matchUrlEntry(spec.match, url),
      });
  });
  if (problems.length > 0) throw new ConfigError(source, problems);
  return loaded;
}
