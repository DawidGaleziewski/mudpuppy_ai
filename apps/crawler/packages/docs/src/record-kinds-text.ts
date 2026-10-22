import { z } from 'zod';
import { DOC_CONTENT_BY_KIND, DocKind, RelationType } from '@mudpuppy/docs-model';
import { RELATION_RULES } from './relations.js';

/**
 * The BA's write contract as short text, generated from the schemas the server validates against
 * (spec 019 US4, spec 015 F-20): about 40 % of the BA's writes were refused because it guessed the
 * content shape of a kind or a relation. The tool description and every refusal carry these lines,
 * so the text can never disagree with the check.
 */

type Json = {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  items?: Json;
  properties?: Record<string, Json>;
  required?: string[];
  anyOf?: Json[];
  oneOf?: Json[];
};

const SCALAR: Record<string, string> = { number: 'number', integer: 'number', boolean: 'boolean' };

/** A shape, compact: `string`, `number`, `a|b`, `[…]`, `{a, b?:number}`. */
function shape(s: Json): string {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map(String).join('|');
  const union = s.anyOf ?? s.oneOf;
  if (union) return union.map(shape).join(' | ');
  const type = Array.isArray(s.type) ? s.type.filter((t) => t !== 'null')[0] : s.type;
  if (type === 'array') return `[${s.items ? shape(s.items) : ''}]`;
  if (type === 'object') return `{${fields(s).join(', ')}}`;
  return SCALAR[type ?? ''] ?? 'string';
}

/** One field: `name`, `name?`, `name:number`, `name[…]`, `name{…}`, `name:a|b`. */
function field(name: string, s: Json, optional: boolean): string {
  const label = `${name}${optional ? '?' : ''}`;
  const body = shape(s);
  if (body === 'string') return label;
  if (body.includes(' | ')) return `${label}:(${body})`;
  if (body.startsWith('[') || body.startsWith('{')) return `${label}${body}`;
  return `${label}:${body}`;
}

function fields(s: Json, omit?: string): string[] {
  const required = new Set(s.required ?? []);
  return Object.entries(s.properties ?? {})
    .filter(([name]) => name !== omit)
    .map(([name, p]) => field(name, p, !required.has(name)));
}

/** `kind: field, field?, …` for one record kind (the top-level `kind` is implied by the call). */
export function describeRecordKind(kind: DocKind): string {
  const json = z.toJSONSchema(DOC_CONTENT_BY_KIND[kind], { io: 'input' }) as Json;
  return `${kind}: ${fields(json, 'kind').join(', ')}`;
}

/** Every relation the server accepts, as `from type to` phrases; only `fromKind`'s when given. */
export function describeRelations(fromKind?: DocKind): string[] {
  const out: string[] = [];
  for (const type of RelationType.options) {
    for (const r of RELATION_RULES[type]) {
      if (fromKind && r.from !== 'any' && !r.from.includes(fromKind)) continue;
      const from = fromKind ?? (r.from === 'any' ? 'any kind' : r.from.join('|'));
      const to = r.to === 'same' ? (fromKind ?? 'the same kind') : r.to.join('|');
      out.push(`${from} ${type} ${to}`);
    }
  }
  return out;
}

/** The block the `create_record` / `revise_record` descriptions end with. */
export function describeRecordKinds(): string {
  return [
    'Content per kind (no "kind" key needed; ? = optional; [x] = list of x; {…} = object; a|b = one of):',
    ...DocKind.options.map(describeRecordKind),
    `Relations (from type to): ${describeRelations().join('; ')}.`,
    // Both rules were in the skill and ignored at write time (spec 019 F-09, F-13): the BA writes
    // against this description, so the two contracts the evals caught are stated here.
    'screen.route_templates: the route template exactly as recorded, a path without a query; URLs with parameters go in entry_points.',
    'data_item: one record per form field; name_verbatim is that one field label, never several labels joined.',
  ].join('\n');
}
