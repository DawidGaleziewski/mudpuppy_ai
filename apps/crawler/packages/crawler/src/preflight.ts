import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError, loadEffectiveConfig, type EffectiveConfig } from '@pathfinder/config';
import { EnvGuardError, assertRunAllowed, narrowScope } from '@pathfinder/safety';
import type { Scope } from '@pathfinder/config';

export type PreflightRefusalCode = 'ENV_GUARD_REFUSED' | 'CONFIG_INVALID';

export type PreflightResult =
  | {
      ok: true;
      effective: EffectiveConfig;
      /** Portal scope narrowed by the persona; what the gates enforce. */
      scope: Scope;
      portalPath: string;
      personaPath: string;
    }
  | { ok: false; code: PreflightRefusalCode; message: string; reasons: string[] };

export interface PreflightOptions {
  /** Repo root that holds `portals/` and `personas/`. */
  root: string;
}

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;

/** Find `<personaId>.yaml` under `personas/<portalId>/`, directly or in a `<process>/` subfolder. */
function findPersona(dir: string, personaId: string): string | null {
  if (!existsSync(dir)) return null;
  const direct = join(dir, `${personaId}.yaml`);
  if (existsSync(direct)) return direct;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('_')) {
      const found = findPersona(join(dir, entry.name), personaId);
      if (found) return found;
    }
  }
  return null;
}

const refuse = (code: PreflightRefusalCode, reasons: string[]): PreflightResult => ({
  ok: false,
  code,
  message: reasons.join('; '),
  reasons,
});

/**
 * Called first by `start_run`, BEFORE any browser is launched or request made (SC-006). Synchronous
 * and file-only: loads config, applies the environment guard and, for production, the compliance
 * gate (FR-026: every `compliance` value set, and no placeholder User-Agent).
 */
export function preflight(
  portalId: string,
  personaId: string,
  opts: PreflightOptions,
): PreflightResult {
  if (!SLUG.test(portalId))
    return refuse('CONFIG_INVALID', [`invalid portal id: ${JSON.stringify(portalId)}`]);
  if (!SLUG.test(personaId))
    return refuse('CONFIG_INVALID', [`invalid persona id: ${JSON.stringify(personaId)}`]);

  const portalPath = join(opts.root, 'portals', portalId, 'portal.yaml');
  const personaPath = findPersona(join(opts.root, 'personas', portalId), personaId);
  if (personaPath === null) {
    return refuse('CONFIG_INVALID', [
      `persona "${personaId}" not found under personas/${portalId}/`,
    ]);
  }

  let effective: EffectiveConfig;
  try {
    // A persona may extend shared mixins and its own portal's files only (spec 002 FR-025).
    effective = loadEffectiveConfig(portalPath, personaPath, {
      fence: [join(opts.root, 'personas', '_mixins'), join(opts.root, 'personas', portalId)],
    });
  } catch (e) {
    if (e instanceof ConfigError) return refuse('CONFIG_INVALID', [e.message]);
    throw e;
  }
  const { portal, persona } = effective;

  try {
    assertRunAllowed(portal, persona);
  } catch (e) {
    if (e instanceof EnvGuardError) return refuse('ENV_GUARD_REFUSED', e.reasons);
    throw e;
  }

  if (portal.environment === 'production') {
    const reasons: string[] = [];
    const missing = Object.entries(portal.compliance)
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    if (missing.length > 0) {
      reasons.push(
        `compliance not completed in ${portalPath}: ${missing.join(', ')} still null (FR-026)`,
      );
    }
    if (portal.rate_limit?.user_agent.toLowerCase().includes('example.com')) {
      reasons.push(
        `rate_limit.user_agent in ${portalPath} still holds the placeholder contact address (FR-026)`,
      );
    }
    if (reasons.length > 0) return refuse('ENV_GUARD_REFUSED', reasons);
  }

  return {
    ok: true,
    effective,
    scope: narrowScope(portal.scope, persona.scope_restrictions, persona.budgets),
    portalPath,
    personaPath,
  };
}
