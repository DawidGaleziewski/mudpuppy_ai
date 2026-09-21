/**
 * Reduce a JSON value to its shape: keys and type tags only, never values (FR-012, FR-014).
 * `{ id: 7, tags: ["a"] }` -> `{ id: "number", tags: ["string"] }`.
 */
export type Shape = string | Shape[] | { [key: string]: Shape };

const MAX_DEPTH = 6;
const MAX_KEYS = 60;

export function shapeOf(value: unknown, depth = 0): Shape {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    if (depth >= MAX_DEPTH) return ['unknown'];
    // First element stands for the array; heterogeneous arrays are merged key-wise for objects.
    const objects = value.filter((v) => typeof v === 'object' && v !== null && !Array.isArray(v));
    if (objects.length > 1 && objects.length === value.length) {
      const merged: Record<string, Shape> = {};
      for (const o of objects)
        Object.assign(merged, shapeOf(o, depth + 1) as Record<string, Shape>);
      return [merged];
    }
    return [shapeOf(value[0], depth + 1)];
  }
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return Number.isInteger(value) ? 'integer' : 'number';
    case 'boolean':
      return 'boolean';
    case 'object': {
      if (depth >= MAX_DEPTH) return 'object';
      const out: Record<string, Shape> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS))
        out[k] = shapeOf(v, depth + 1);
      return out;
    }
    default:
      return 'unknown';
  }
}

/** Shape of a request/response body given its content type; non-JSON bodies yield `{}` (shape unknown). */
export function shapeOfBody(
  body: string | null | undefined,
  contentType: string | undefined,
): Shape {
  if (!body) return {};
  const ct = contentType?.toLowerCase() ?? '';
  try {
    if (ct.includes('json') || /^\s*[[{]/.test(body)) return shapeOf(JSON.parse(body));
    if (ct.includes('x-www-form-urlencoded')) {
      const out: Record<string, Shape> = {};
      for (const k of new URLSearchParams(body).keys()) out[k] = 'string';
      return out;
    }
  } catch {
    /* fall through */
  }
  return {};
}
