import { minSafetyClass, type SafetyClass } from '@pathfinder/core';
import { loadPersona } from './load-persona.js';
import { loadPortal } from './load-portal.js';
import type { PersonaConfig } from './persona-schema.js';
import type { PortalConfig } from './portal-schema.js';

export interface EffectiveConfig {
  portal: PortalConfig;
  persona: PersonaConfig;
  /** min(portal ceiling, persona ceiling) — a persona can only restrict, never widen (FR-018). */
  effectiveMaxActionClass: SafetyClass;
}

/** Portal ceiling: its declared `max_action_class`, else `read` (production default; also the safe default elsewhere). */
export function portalCeiling(portal: PortalConfig): SafetyClass {
  return portal.max_action_class ?? 'read';
}

export function loadEffectiveConfig(portalPath: string, personaPath: string): EffectiveConfig {
  const portal = loadPortal(portalPath);
  const persona = loadPersona(personaPath);
  return {
    portal,
    persona,
    effectiveMaxActionClass: minSafetyClass(portalCeiling(portal), persona.max_action_class),
  };
}
