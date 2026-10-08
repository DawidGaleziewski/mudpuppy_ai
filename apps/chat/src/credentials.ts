// Credentials form path (R-30 T018, research R5): the dashboard posts the persona's ref names with
// values; they go straight into the R-26 vault. Values never reach chat messages, events, logs or
// error details: they are registered with the core SECRETS redactor before anything else happens.

import { SECRETS } from '@pathfinder/core';
import { type PathfinderDb } from '@pathfinder/store';
import {
  VaultError,
  asEnvironment,
  createVaultStore,
  loadKey,
  type VaultKey,
  type VaultStore,
} from '@pathfinder/vault';
import { z } from 'zod';
import { HttpError } from './http-error.js';

export const CredentialsBody = z.object({
  portal: z.string().min(1).max(200),
  environment: z.string().default('sandbox'),
  values: z.record(z.string().min(1).max(64), z.string().min(1).max(10_000)),
});
export type CredentialsBody = z.infer<typeof CredentialsBody>;

export interface CredentialsOptions {
  db: PathfinderDb;
  /** Loads the vault key; throws `VaultError` KEY_MISSING when none is configured. Default: file. */
  loadKey?: () => VaultKey;
  /** Builds the vault store, for tests. */
  createStore?: (db: PathfinderDb, key: VaultKey) => VaultStore;
}

export interface CredentialsHandler {
  store(body: CredentialsBody): Promise<{ stored: true; refs: string[] }>;
}

function toHttp(error: unknown): unknown {
  if (!(error instanceof VaultError)) return error;
  switch (error.code) {
    case 'KEY_MISSING':
    case 'KEY_PERMISSIONS':
    case 'KEY_INVALID':
    case 'KEY_MISMATCH':
      return new HttpError(409, error.message);
    case 'INVALID_INPUT':
      return new HttpError(400, error.message);
    default:
      return error;
  }
}

export function createCredentialsHandler(opts: CredentialsOptions): CredentialsHandler {
  return {
    async store(body) {
      const refs = Object.keys(body.values);
      if (refs.length === 0) throw new HttpError(400, 'The request has no credential values.');
      // Register first: whatever goes wrong below, the values are masked in every log line.
      for (const value of Object.values(body.values)) SECRETS.add(value);
      try {
        const environment = asEnvironment(body.environment);
        const key = (opts.loadKey ?? (() => loadKey()))();
        const vault = (opts.createStore ?? createVaultStore)(opts.db, key);
        for (const [ref, value] of Object.entries(body.values))
          await vault.set(body.portal, environment, ref, value);
      } catch (error) {
        throw toHttp(error);
      }
      return { stored: true, refs };
    },
  };
}
