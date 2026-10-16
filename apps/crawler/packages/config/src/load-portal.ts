import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { SafetyClass } from '@pathfinder/core';
import { ConfigError, zodProblems } from './errors.js';
import { Environment, PortalConfig } from './portal-schema.js';
import { readYaml } from './read.js';

/**
 * One environment of a portal (spec 011 FR-008): its own address and action limit, and
 * optionally its own domains (else the portal's `scope.allowed_domains`).
 */
export const PortalEnvironment = z
  .object({
    base_url: z.url(),
    max_action_class: SafetyClass.optional(),
    allowed_domains: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();
export type PortalEnvironment = z.infer<typeof PortalEnvironment>;

const EnvironmentsMap = z.record(Environment, PortalEnvironment);

/** A portal with several environments was loaded without saying which one to use. */
export class EnvironmentChoiceError extends ConfigError {
  constructor(
    file: string,
    readonly environments: Environment[],
  ) {
    super(file, [`choose an environment: ${environments.join(', ')}`]);
    this.name = 'EnvironmentChoiceError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The environments a portal file declares, with their address and limit (legacy: its one). */
export function portalEnvironments(
  file: string,
): { environment: Environment; base_url: string; max_action_class?: SafetyClass }[] {
  const raw = readYaml(file);
  if (!isObject(raw)) throw new ConfigError(file, ['a portal file must be a mapping']);
  if (raw.environments === undefined) {
    const p = loadPortal(file);
    return [
      {
        environment: p.environment,
        base_url: p.base_url,
        ...(p.max_action_class ? { max_action_class: p.max_action_class } : {}),
      },
    ];
  }
  const envs = EnvironmentsMap.safeParse(raw.environments);
  if (!envs.success)
    throw new ConfigError(
      file,
      zodProblems(envs.error).map((p) => `environments.${p}`),
    );
  // Declaration order: the portal file lists its environments as the user wants them.
  return Object.keys(envs.data).map((e) => {
    const entry = envs.data[e]!;
    return {
      environment: e,
      base_url: entry.base_url,
      ...(entry.max_action_class ? { max_action_class: entry.max_action_class } : {}),
    };
  });
}

/**
 * The single-environment shape every run uses: with `environments`, the chosen one's address,
 * limit and domains are put in place. One environment needs no choice; a legacy file accepts
 * only its own environment.
 */
function resolveEnvironment(file: string, raw: unknown, environment?: Environment): unknown {
  if (!isObject(raw)) return raw;
  if (raw.environments === undefined) {
    if (environment !== undefined && raw.environment !== environment)
      throw new ConfigError(file, [
        `portal has no environment "${environment}" (it is "${String(raw.environment)}")`,
      ]);
    return raw;
  }
  const envs = EnvironmentsMap.safeParse(raw.environments);
  if (!envs.success)
    throw new ConfigError(
      file,
      zodProblems(envs.error).map((p) => `environments.${p}`),
    );
  const names = Object.keys(envs.data);
  if (names.length === 0) throw new ConfigError(file, ['environments: declare at least one']);
  const misplaced = ['base_url', 'environment', 'max_action_class'].filter((k) => k in raw);
  if (misplaced.length > 0)
    throw new ConfigError(file, [
      `with environments, ${misplaced.join(', ')} go inside each environment, not at the top`,
    ]);
  let pick = environment;
  if (pick === undefined) {
    if (names.length > 1) throw new EnvironmentChoiceError(file, names);
    pick = names[0]!;
  }
  const entry = envs.data[pick];
  if (entry === undefined)
    throw new ConfigError(file, [
      `portal has no environment "${pick}"; it has ${names.join(', ')}`,
    ]);
  const rest = { ...raw };
  delete rest.environments;
  const scope = isObject(rest.scope) ? rest.scope : {};
  return {
    ...rest,
    environment: pick,
    base_url: entry.base_url,
    ...(entry.max_action_class ? { max_action_class: entry.max_action_class } : {}),
    scope: {
      ...scope,
      ...(entry.allowed_domains ? { allowed_domains: entry.allowed_domains } : {}),
    },
  };
}

export function loadPortal(file: string, environment?: Environment): PortalConfig {
  const parsed = PortalConfig.safeParse(resolveEnvironment(file, readYaml(file), environment));
  if (!parsed.success) throw new ConfigError(file, zodProblems(parsed.error));
  const caFile = parsed.data.network?.ca_file;
  // A relative CA file is the portal folder's (spec 031 US4), wherever the loader runs from.
  if (caFile && parsed.data.network && !isAbsolute(caFile))
    parsed.data.network.ca_file = resolve(dirname(file), caFile);
  return parsed.data;
}
