import { ConfigError, zodProblems } from './errors.js';
import { PortalConfig } from './portal-schema.js';
import { readYaml } from './read.js';

export function loadPortal(file: string): PortalConfig {
  const parsed = PortalConfig.safeParse(readYaml(file));
  if (!parsed.success) throw new ConfigError(file, zodProblems(parsed.error));
  return parsed.data;
}
