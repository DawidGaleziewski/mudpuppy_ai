// Personas from a CSV of test users (spec 024 US1.2, US1.3): one persona file per row and its two
// credentials in the vault. Files hold `ref:` names only; no value is ever printed. A second import
// of the same file rewrites the same files and vault rows.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { loadPersona, type PersonaAttributes } from '@mudpuppy/config';
import { parseCsv } from './csv.js';
import { VaultError } from './errors.js';
import type { VaultEnvironment, VaultStore } from './store.js';

const HEADER = ['persona_id', 'login', 'password'] as const;
const PERSONA_ID = /^[a-z0-9][a-z0-9_-]*$/;
const MAX_REF = 64;
/** The persona keys an import writes; every other key of an existing file stays. */
const IMPORTED = new Set(['id', 'extends', 'auth', 'attributes']);
const DEFAULT_MIXIN = '_mixins/login.yaml';

export interface ImportPersonasInput {
  /** Repo root: `portals/<portal>/` and `personas/<portal>/` live under it. */
  root: string;
  portal: string;
  csv: string;
  environment: VaultEnvironment;
  /** Mixin path relative to `personas/<portal>/`; default `_mixins/login.yaml` when it exists. */
  extends?: string;
  store: VaultStore;
}

export interface ImportedPersona {
  id: string;
  status: 'created' | 'updated';
  refs: { login: string; password: string };
}

interface Row {
  line: number;
  id: string;
  login: string;
  password: string;
  attributes: PersonaAttributes;
}

const refPart = (s: string) => s.toUpperCase().replace(/-/g, '_');
const refsOf = (portal: string, id: string) => ({
  login: `${refPart(portal)}_${refPart(id)}_LOGIN`,
  password: `${refPart(portal)}_${refPart(id)}_PASSWORD`,
});

/** A cell becomes text, or a list when it holds `|`; an empty cell sets nothing. */
function attributeValue(cell: string): string | string[] | undefined {
  const value = cell.trim();
  if (value === '') return undefined;
  if (!value.includes('|')) return value;
  return value
    .split('|')
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

function readRows(input: ImportPersonasInput): Row[] {
  const [header, ...data] = parseCsv(input.csv);
  const columns = (header ?? []).map((c) => c.trim());
  if (HEADER.some((name, i) => columns[i] !== name))
    throw new VaultError(
      'INVALID_INPUT',
      `the header must start with ${HEADER.join(',')}, then the attribute columns`,
    );
  const attrColumns = columns.slice(HEADER.length);
  const problems: string[] = [];
  if (attrColumns.some((c) => c === '' || c.length > 100))
    problems.push('every attribute column needs a name of at most 100 characters');
  if (new Set(columns).size !== columns.length) problems.push('a column name repeats');
  const seen = new Set<string>();
  const rows = data.map((cells, i): Row => {
    const line = i + 2;
    const [id = '', login = '', password = ''] = cells.map((c) => c.trim());
    if (cells.length !== columns.length)
      problems.push(`line ${line}: ${cells.length} cells, the header has ${columns.length}`);
    if (!PERSONA_ID.test(id)) problems.push(`line ${line}: persona_id must be a lowercase slug`);
    if (seen.has(id)) problems.push(`line ${line}: persona_id ${id} repeats`);
    seen.add(id);
    if (login === '' || password === '')
      problems.push(`line ${line}: login and password are required`);
    const refs = refsOf(input.portal, id);
    if (refs.password.length > MAX_REF)
      problems.push(`line ${line}: ref ${refs.password} is longer than ${MAX_REF} characters`);
    const attributes: PersonaAttributes = {};
    attrColumns.forEach((name, j) => {
      const value = attributeValue(cells[HEADER.length + j] ?? '');
      if (value !== undefined) attributes[name] = value;
    });
    return { line, id, login, password, attributes };
  });
  if (data.length === 0) problems.push('no persona rows under the header');
  if (problems.length > 0) throw new VaultError('INVALID_INPUT', problems.join('\n'));
  return rows;
}

/** The mixin a new persona extends; an existing file keeps its own unless one is given. */
function extendsOf(input: ImportPersonasInput, existing: Record<string, unknown>): unknown {
  if (input.extends) return [input.extends];
  if (existing.extends) return existing.extends;
  // The portal's own mixin: portal-specific settings never go in the shared personas/_mixins/.
  const own = join(input.root, 'personas', input.portal, DEFAULT_MIXIN);
  return existsSync(own) ? [DEFAULT_MIXIN] : undefined;
}

/** Write one persona file (other keys of an existing file are kept) and check that it loads. */
function writePersona(input: ImportPersonasInput, row: Row): 'created' | 'updated' {
  const dir = join(input.root, 'personas', input.portal);
  const file = join(dir, `${row.id}.yaml`);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  const existing = (before === undefined ? {} : parse(before)) as Record<string, unknown>;
  const rest = Object.fromEntries(Object.entries(existing).filter(([k]) => !IMPORTED.has(k)));
  const refs = refsOf(input.portal, row.id);
  const doc = {
    id: row.id,
    extends: extendsOf(input, existing),
    ...rest,
    auth: { login: `ref:${refs.login}`, password: `ref:${refs.password}` },
    attributes: row.attributes,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, stringify(doc));
  try {
    loadPersona(file, {
      fence: [join(input.root, 'personas/_mixins'), dir],
    });
  } catch (e) {
    if (before === undefined) rmSync(file);
    else writeFileSync(file, before);
    throw new VaultError(
      'INVALID_INPUT',
      `line ${row.line}: persona ${row.id} does not load (${(e as Error).message}); ` +
        'viewport and locale come from a mixin: pass --extends <path from personas/<portal>/>',
    );
  }
  return before === undefined ? 'created' : 'updated';
}

/**
 * The CSV is checked whole before anything is written; a persona file that then does not load
 * (no mixin gives it a viewport and locale) is put back as it was and stops the import.
 */
export async function importPersonas(input: ImportPersonasInput): Promise<ImportedPersona[]> {
  if (!existsSync(join(input.root, 'portals', input.portal, 'portal.yaml')))
    throw new VaultError(
      'INVALID_INPUT',
      `unknown portal ${input.portal}: no portals/${input.portal}/portal.yaml`,
    );
  const rows = readRows(input);
  const imported: ImportedPersona[] = [];
  for (const row of rows) {
    const status = writePersona(input, row);
    const refs = refsOf(input.portal, row.id);
    await input.store.set(input.portal, input.environment, refs.login, row.login);
    await input.store.set(input.portal, input.environment, refs.password, row.password);
    imported.push({ id: row.id, status, refs });
  }
  return imported;
}
