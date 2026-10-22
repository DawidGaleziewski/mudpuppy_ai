// The view-spec check (designer doc 17 § 5.1, spec 043 FR-002): drop, don't fail. Layers 1–5 run
// here; layer 4 (ids) only when the caller passes `idExists`; layer 6 (select against the person's
// selection) belongs to the renderer. Every drop and repair carries the designer's reason code.

import Ajv2020 from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';

import type { Contract, WbPath } from './contract.js';
import { PATHS } from './contract.js';

export type DropCode =
  | 'missing_id'
  | 'unknown_type'
  | 'bad_bind_or_props'
  | 'not_on_path'
  | 'not_in_phase'
  | 'id_not_found'
  | 'duplicate_id'
  | 'duplicate'
  | 'too_many';
export type RepairCode = 'repaired_path' | 'repaired_why' | 'repaired_suggestions';

export interface Drop {
  index: number;
  type: string | null;
  code: DropCode;
}

export interface Repair {
  field: 'path' | 'why' | 'suggestions';
  code: RepairCode;
}

export type PageRef = '@selected' | { route: string; state?: number };

export interface ViewComponent {
  id: string;
  type: string;
  bind: Record<string, unknown>;
  props?: Record<string, unknown>;
}

export interface ViewSpec {
  version: '1';
  path: WbPath;
  why: string;
  select?: PageRef;
  components: ViewComponent[];
  suggestions: string[];
}

export interface CheckResult {
  spec: ViewSpec;
  dropped: Drop[];
  repaired: Repair[];
  /** The model sent components and none survived: the turn answers in plain chat (WB-UI-31). */
  fallback: boolean;
}

export interface CheckOptions {
  /** The person's rollout phase (1 in spec 043). */
  phase: number;
  /** The path to keep when the spec's path is unusable. */
  currentPath: WbPath;
  /** Layer 4: does every id the component binds exist (and may the person see it)? */
  idExists?: (component: ViewComponent) => boolean;
}

export const GENERIC_WHY = 'Composed for your request.';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

interface EnvelopeChecks {
  why: ValidateFunction;
  suggestion: ValidateFunction;
  select: ValidateFunction;
}

/** Layer 1: an unusable path, why or suggestion is repaired, never fatal; a bad select is ignored. */
function repairEnvelope(raw: Record<string, unknown>, opts: CheckOptions, v: EnvelopeChecks) {
  const repaired: Repair[] = [];
  let path = opts.currentPath;
  if ((PATHS as readonly unknown[]).includes(raw.path)) path = raw.path as WbPath;
  else repaired.push({ field: 'path', code: 'repaired_path' });
  let text = GENERIC_WHY;
  if (v.why(raw.why)) text = raw.why as string;
  else repaired.push({ field: 'why', code: 'repaired_why' });
  const given = Array.isArray(raw.suggestions) ? (raw.suggestions as unknown[]) : [];
  const kept = given.filter((s) => v.suggestion(s)).slice(0, 3) as string[];
  const notAList = raw.suggestions !== undefined && !Array.isArray(raw.suggestions);
  if (kept.length !== given.length || notAList)
    repaired.push({ field: 'suggestions', code: 'repaired_suggestions' });
  const spec: ViewSpec = { version: '1', path, why: text, components: [], suggestions: kept };
  if (v.select(raw.select)) spec.select = raw.select as PageRef;
  return { spec, repaired };
}

/** One compiled validator per contract; `check` is the layer 1–5 pass of one tool input. */
export function createViewChecker(contract: Contract) {
  const ajv = new Ajv2020({ allErrors: false, strictTypes: false });
  ajv.addSchema(contract.viewSpec);
  const id = contract.viewSpec.$id;
  const at = (pointer: string): ValidateFunction => {
    const fn = ajv.getSchema(`${id}#${pointer}`);
    if (fn === undefined) throw new Error(`workbench contract: no schema at ${pointer}`);
    return fn;
  };
  const envelope = {
    why: at('/properties/why'),
    suggestion: at('/properties/suggestions/items'),
    select: at('/properties/select'),
  };
  const byType = new Map(
    contract.catalogue.components.map((c) => [c.type, { entry: c, fn: at(`/$defs/${c.type}`) }]),
  );
  const limits = contract.catalogue.limits_per_path;

  /** Layers 2–3: the component's own schema, then path and phase. */
  const componentCode = (c: unknown, path: WbPath, phase: number): DropCode | null => {
    if (!isObject(c) || typeof c.id !== 'string') return 'missing_id';
    const known = typeof c.type === 'string' ? byType.get(c.type) : undefined;
    if (known === undefined) return 'unknown_type';
    if (!known.fn(c)) return 'bad_bind_or_props';
    if (!known.entry.paths.includes(path)) return 'not_on_path';
    if (known.entry.phase > phase) return 'not_in_phase';
    return null;
  };

  return function check(raw: unknown, opts: CheckOptions): CheckResult {
    const body = isObject(raw) ? raw : {};
    const { spec, repaired } = repairEnvelope(body, opts, envelope);
    const given = Array.isArray(body.components) ? (body.components as unknown[]) : [];
    const dropped: Drop[] = [];
    const ids = new Set<string>();
    const binds = new Set<string>();
    const drop = (index: number, c: unknown, code: DropCode) =>
      dropped.push({
        index,
        type: isObject(c) && typeof c.type === 'string' ? c.type : null,
        code,
      });
    given.forEach((c, index) => {
      const code = componentCode(c, spec.path, opts.phase);
      if (code !== null) return drop(index, c, code);
      const component = c as ViewComponent;
      if (opts.idExists !== undefined && !opts.idExists(component))
        return drop(index, c, 'id_not_found');
      const sameBind = `${component.type} ${JSON.stringify(component.bind)}`;
      if (ids.has(component.id)) return drop(index, c, 'duplicate_id');
      if (binds.has(sameBind)) return drop(index, c, 'duplicate');
      if (spec.components.length >= limits[spec.path]) return drop(index, c, 'too_many');
      ids.add(component.id);
      binds.add(sameBind);
      spec.components.push(component);
    });
    return {
      spec,
      dropped,
      repaired,
      fallback: given.length > 0 && spec.components.length === 0,
    };
  };
}

export type ViewChecker = ReturnType<typeof createViewChecker>;
