import { newId, nowIso, type CredentialsTable, type PathfinderDb } from '@pathfinder/core';
import { decrypt, encrypt, type VaultKey } from './crypto.js';
import { VaultError } from './errors.js';

/** One stored credential as listed: never the value. */
export interface CredentialInfo {
  portal_id: string;
  environment: string;
  ref_name: string;
  key_id: string;
  created_at: string;
  updated_at: string;
}

// Same alphabet as the persona loader's `ref:NAME` rule (config/src/secrets.ts), capped at 64.
const REF_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;

function checkRef(ref: string): void {
  if (!REF_NAME.test(ref))
    throw new VaultError(
      'INVALID_INPUT',
      `invalid ref name ${JSON.stringify(ref)}: letters, digits, "_", "." and "-", starting with a letter or "_"`,
    );
}

export interface VaultStore {
  set(portalId: string, environment: VaultEnvironment, ref: string, value: string): Promise<void>;
  /** Decrypt one value; `NOT_FOUND` when absent. */
  get(portalId: string, environment: VaultEnvironment, ref: string): Promise<string>;
  has(portalId: string, environment: VaultEnvironment, ref: string): Promise<boolean>;
  list(portalId?: string): Promise<CredentialInfo[]>;
  /** True when a row was deleted. */
  delete(portalId: string, environment: VaultEnvironment, ref: string): Promise<boolean>;
}

export type VaultEnvironment = CredentialsTable['environment'];
const ENVIRONMENTS: readonly VaultEnvironment[] = ['sandbox', 'staging', 'production'];

/** Narrow a CLI or config string to a store environment. */
export function asEnvironment(value: string): VaultEnvironment {
  if (!(ENVIRONMENTS as readonly string[]).includes(value))
    throw new VaultError(
      'INVALID_INPUT',
      `unknown environment ${JSON.stringify(value)}; expected ${ENVIRONMENTS.join(', ')}`,
    );
  return value as VaultEnvironment;
}

/** Credentials over the `credentials` table (migration 0007); the key never touches the DB. */
export function createVaultStore(db: PathfinderDb, key: VaultKey): VaultStore {
  return {
    async set(portalId, environment, ref, value) {
      checkRef(ref);
      if (value.length === 0) throw new VaultError('INVALID_INPUT', `empty value for ${ref}`);
      const sealed = encrypt(key, { portal_id: portalId, environment, ref }, value);
      const now = nowIso();
      await db
        .insertInto('credentials')
        .values({
          id: newId(),
          portal_id: portalId,
          environment,
          ref_name: ref,
          ciphertext: sealed.ciphertext,
          nonce: sealed.nonce,
          key_id: sealed.key_id,
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.columns(['portal_id', 'environment', 'ref_name']).doUpdateSet({
            ciphertext: sealed.ciphertext,
            nonce: sealed.nonce,
            key_id: sealed.key_id,
            updated_at: now,
          }),
        )
        .execute();
    },
    async get(portalId, environment, ref) {
      const row = await db
        .selectFrom('credentials')
        .select(['ciphertext', 'nonce', 'key_id'])
        .where('portal_id', '=', portalId)
        .where('environment', '=', environment)
        .where('ref_name', '=', ref)
        .executeTakeFirst();
      if (!row)
        throw new VaultError('NOT_FOUND', `no credential ${ref} for ${portalId} on ${environment}`);
      return decrypt(
        key,
        { portal_id: portalId, environment, ref },
        {
          ciphertext: Buffer.from(row.ciphertext),
          nonce: Buffer.from(row.nonce),
          key_id: row.key_id,
        },
      );
    },
    async has(portalId, environment, ref) {
      const row = await db
        .selectFrom('credentials')
        .select('id')
        .where('portal_id', '=', portalId)
        .where('environment', '=', environment)
        .where('ref_name', '=', ref)
        .executeTakeFirst();
      return row !== undefined;
    },
    async list(portalId) {
      let q = db
        .selectFrom('credentials')
        .select(['portal_id', 'environment', 'ref_name', 'key_id', 'created_at', 'updated_at'])
        .orderBy('portal_id')
        .orderBy('environment')
        .orderBy('ref_name');
      if (portalId !== undefined) q = q.where('portal_id', '=', portalId);
      return q.execute();
    },
    async delete(portalId, environment, ref) {
      const r = await db
        .deleteFrom('credentials')
        .where('portal_id', '=', portalId)
        .where('environment', '=', environment)
        .where('ref_name', '=', ref)
        .executeTakeFirst();
      return Number(r.numDeletedRows) > 0;
    },
  };
}

const REF = /^ref:([A-Za-z_][A-Za-z0-9_.-]*)$/;

/** The `ref:` names a persona's `auth` block uses, by auth field. */
export function personaRefs(
  auth: 'none' | Record<string, string> | undefined,
): Record<string, string> {
  if (auth === undefined || auth === 'none') return {};
  const out: Record<string, string> = {};
  for (const [field, value] of Object.entries(auth)) {
    const m = REF.exec(value);
    if (m) out[field] = m[1]!;
  }
  return out;
}

export interface ResolvedRefs {
  /** auth field → plaintext value. Memory only; never serialise. */
  values: Record<string, string>;
  /** Ref names with no row for this portal and environment. */
  missing: string[];
}

/** Resolve every `ref:` of a persona for one portal and environment (FR-017). */
export async function resolvePersonaRefs(
  store: VaultStore,
  portalId: string,
  environment: VaultEnvironment,
  auth: 'none' | Record<string, string> | undefined,
): Promise<ResolvedRefs> {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const [field, ref] of Object.entries(personaRefs(auth))) {
    if (!(await store.has(portalId, environment, ref))) {
      missing.push(ref);
      continue;
    }
    values[field] = await store.get(portalId, environment, ref);
  }
  return { values, missing: [...new Set(missing)] };
}
