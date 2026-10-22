import { minSafetyClass, type SafetyClass } from '@mudpuppy/core';
import { ConfigError } from './errors.js';
import { loadPersona, type LoadPersonaOptions } from './load-persona.js';
import { loadPortal } from './load-portal.js';
import type { PersonaConfig } from './persona-schema.js';
import type { Environment, PortalConfig } from './portal-schema.js';

export interface EffectiveConfig {
  portal: PortalConfig;
  persona: PersonaConfig;
  /** min(portal ceiling, persona ceiling) — a persona can only restrict, never widen (FR-018). */
  effectiveMaxActionClass: SafetyClass;
}

/** Portal ceiling: its declared `max_action_class`, else no limit on any environment (spec 021 FR-002). */
export function portalCeiling(portal: PortalConfig): SafetyClass {
  return portal.max_action_class ?? 'external-side-effect';
}

/** Persona credentials and the portal's `login` block must come as a pair (a guest needs neither). */
export function checkLoginCrossRef(
  portal: PortalConfig,
  persona: PersonaConfig,
  file: string,
): void {
  const auth = persona.auth;
  if (auth === 'none') return;
  const hasRefs = Object.values(auth).some((v) => v.startsWith('ref:'));
  if (!hasRefs) return;
  if (portal.login === undefined)
    throw new ConfigError(file, ['persona has credentials but portal has no login block']);
  const missing = [portal.login.fields.username, portal.login.fields.password].filter(
    (k) => !(k in auth),
  );
  if (missing.length > 0)
    throw new ConfigError(
      file,
      missing.map((k) => `persona auth is missing key "${k}" named by portal login.fields`),
    );
}

/** `environment`: which of the portal's environments to use (spec 011 FR-008). */
export function loadEffectiveConfig(
  portalPath: string,
  personaPath: string,
  personaOptions: LoadPersonaOptions = {},
  environment?: Environment,
): EffectiveConfig {
  const portal = loadPortal(portalPath, environment);
  const persona = loadPersona(personaPath, personaOptions);
  checkLoginCrossRef(portal, persona, personaPath);
  return {
    portal,
    persona,
    effectiveMaxActionClass: minSafetyClass(portalCeiling(portal), persona.max_action_class),
  };
}
