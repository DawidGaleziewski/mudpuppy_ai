export type VaultErrorCode =
  | 'KEY_MISSING'
  | 'KEY_PERMISSIONS'
  | 'KEY_INVALID'
  | 'KEY_MISMATCH'
  | 'DECRYPT_FAILED'
  | 'NOT_FOUND'
  | 'INVALID_INPUT';

/** Vault failures. Messages name the key path, portal, environment and ref; never a value. */
export class VaultError extends Error {
  constructor(
    readonly code: VaultErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VaultError';
  }
}
