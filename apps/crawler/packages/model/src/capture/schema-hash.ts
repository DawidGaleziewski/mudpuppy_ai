/**
 * Endpoint schema hash (spec 039 design § 5.3): sha256 of a response's shape (key paths and value
 * types, never values), with object keys sorted, so the same shape always hashes alike. The
 * network recorder already reduces bodies to shapes (`res_schema`). Pure.
 */
import { createHash } from 'node:crypto';

type Shape = string | Shape[] | { [key: string]: Shape };

/** JSON with object keys sorted at every level. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The hash of a response shape; `null` for a document (form submit) response, which has no body shape. */
export function schemaHash(resSchema: Shape | { kind: 'document' }): string | null {
  if (
    resSchema &&
    typeof resSchema === 'object' &&
    !Array.isArray(resSchema) &&
    resSchema.kind === 'document'
  )
    return null;
  return createHash('sha256').update(canonicalJson(resSchema)).digest('hex');
}
