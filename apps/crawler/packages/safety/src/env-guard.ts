import { minSafetyClass, type SafetyClass } from '@pathfinder/core';
import { portalCeiling, type PersonaConfig, type PortalConfig } from '@pathfinder/config';

export class EnvGuardError extends Error {
  readonly code = 'ENV_GUARD_REFUSED';
  constructor(readonly reasons: string[]) {
    super(reasons.join('; '));
    this.name = 'EnvGuardError';
  }
}

const NON_PRODUCTION_LABELS =
  /(^|[.-])(localhost|local|test|testing|staging|stage|stg|sandbox|dev|qa|uat|preprod|mock)([.-]|$)/i;
const PRIVATE_IP =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0$|\[?::1\]?$)/;

/** A public hostname that does not announce itself as local/test/staging is treated as production. */
export function looksLikeProduction(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return true; // unparseable: assume the worst
  }
  if (PRIVATE_IP.test(host) || host.endsWith('.invalid') || host.endsWith('.internal'))
    return false;
  return !NON_PRODUCTION_LABELS.test(host);
}

export interface RunGuardResult {
  effectiveMaxActionClass: SafetyClass;
}

/**
 * Synchronous, browser-free guard (FR-005, FR-018): refuses a production-looking address unless the
 * portal declares `environment: production`, and computes the effective ceiling as
 * min(portal ceiling, persona ceiling).
 */
export function assertRunAllowed(portal: PortalConfig, persona: PersonaConfig): RunGuardResult {
  const reasons: string[] = [];
  const addresses = [portal.base_url, ...portal.scope.allowed_domains.map((d) => `https://${d}/`)];
  const prodLooking = addresses.filter(looksLikeProduction);
  if (prodLooking.length > 0 && portal.environment !== 'production') {
    reasons.push(
      `portal "${portal.id}" targets a production-looking address (${prodLooking[0]}) but declares environment "${portal.environment}"; ` +
        'a run against production requires an explicit "environment: production"',
    );
  }
  if (reasons.length > 0) throw new EnvGuardError(reasons);
  return {
    effectiveMaxActionClass: minSafetyClass(portalCeiling(portal), persona.max_action_class),
  };
}
