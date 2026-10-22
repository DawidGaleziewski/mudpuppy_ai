// Load a portal's hooks for a run (spec 023 FR-002): before anything is written, so a mapping to
// a missing file or export refuses `start_run` with CONFIG_INVALID naming the problem.

import { join } from 'node:path';
import { ConfigError, type PortalConfig } from '@mudpuppy/config';
import { loadFixes } from '@mudpuppy/fix-plugins';
import { loadHooks, type LoadedHook } from '@mudpuppy/hooks';
import { ToolError } from '../errors.js';

export async function loadRunHooks(root: string, portal: PortalConfig): Promise<LoadedHook[]> {
  try {
    // Fixes (spec 030 FR-031) run before the portal's own hooks of the same point.
    const fixes = loadFixes(join(root, 'portals', portal.id, 'portal.yaml'), portal.fixes);
    return [
      ...fixes,
      ...(await loadHooks(join(root, 'portals', portal.id, 'hooks.ts'), portal.hooks)),
    ];
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    throw new ToolError('CONFIG_INVALID', err.message, { reasons: err.problems });
  }
}
