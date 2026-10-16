import { SECRETS } from '@pathfinder/core';
import type { PersonaConfig } from '@pathfinder/config';
import {
  asEnvironment,
  createVaultStore,
  loadKey,
  personaRefs,
  resolvePersonaRefs,
  VaultError,
} from '@pathfinder/vault';
import type { ServerContext } from '../context.js';
import { ToolError } from '../errors.js';

/**
 * Resolved credentials per run, memory only (spec 009 FR-017). `start_run` fills it before the
 * browser opens; the runtime reads it when it logs in. Never serialised, never returned.
 */
const byRun = new Map<string, Record<string, string>>();

export const runSecrets = {
  get: (runId: string): Record<string, string> | undefined => byRun.get(runId),
  set: (runId: string, values: Record<string, string>): void => {
    byRun.set(runId, values);
  },
  delete: (runId: string): void => {
    byRun.delete(runId);
  },
};

/** Auth fields whose value is always a secret, whatever it equals. */
const SECRET_FIELD = /pass|secret|token|totp|otp|pin|key/i;

/**
 * The resolved values the redactor must mask (field GC-10): every value, except a non-secret field
 * (a login name) whose value equals an id the store keeps readable. Such a value is public already,
 * it names the persona file, so masking it protects nothing and turned `runs.persona_id` into
 * `[secret]` when a persona was named after its login.
 */
export function secretValues(
  values: Record<string, string>,
  publicIds: readonly string[],
): string[] {
  return Object.entries(values)
    .filter(([field, v]) => SECRET_FIELD.test(field) || !publicIds.includes(v))
    .map(([, v]) => v);
}

/**
 * Resolve every `ref:` of the persona for the portal on the run's environment, register the
 * values with the redactor, and refuse the run naming what is missing. A persona without refs
 * needs no vault (and no key file).
 */
export async function resolveRunCredentials(
  ctx: ServerContext,
  portalId: string,
  persona: PersonaConfig,
  /** The run's environment (spec 011 FR-009); default: this server's store environment. */
  environment?: string,
): Promise<Record<string, string>> {
  if (Object.keys(personaRefs(persona.auth)).length === 0) return {};
  try {
    const store = createVaultStore(
      ctx.db,
      loadKey(ctx.vaultKeyPath !== undefined ? { path: ctx.vaultKeyPath } : {}),
    );
    const env = asEnvironment(environment ?? ctx.dbEnvironment);
    const { values, missing } = await resolvePersonaRefs(store, portalId, env, persona.auth);
    if (missing.length > 0)
      throw new ToolError(
        'CONFIG_INVALID',
        `missing credential refs: ${missing.join(', ')} (run "pnpm vault check ${portalId} ${persona.id} --env ${env}")`,
        { missing },
      );
    for (const v of secretValues(values, [persona.id, portalId])) SECRETS.add(v);
    return values;
  } catch (e) {
    if (e instanceof VaultError) throw new ToolError('CONFIG_INVALID', e.message);
    throw e;
  }
}
