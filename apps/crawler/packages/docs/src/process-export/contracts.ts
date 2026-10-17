// Contracts of a process (spec 034 R-68, owner answer 4 of 2026-10-16): which APIs each step calls,
// what was sent and returned per attempt (shapes, and samples recorded outside production), the
// noise left out, and OpenAPI built from the recorded shapes. A call belongs to a step when the
// step's action sent it (its edge) or when it came while the step's page was open (between the
// visit and the run's next visit).

import { stringify } from 'yaml';
import type { RawDb } from '../keys.js';
import type { ProcessStep } from './steps.js';

export interface CallRow {
  id: string;
  run_id: string;
  method: string;
  url_template: string;
  url: string | null;
  status: number;
  req_schema: string;
  res_schema: string;
  req_sample: string | null;
  res_sample: string | null;
  created_at: string;
  /** The action that sent it, when one did. */
  trigger: string | null;
}

export interface Endpoint {
  method: string;
  path: string;
  host: string | null;
  steps: number[];
  statuses: Record<number, number>;
  calls: CallRow[];
}

export interface StepCalls {
  n: number;
  calls: CallRow[];
}

export interface Contracts {
  endpoints: Endpoint[];
  byStep: StepCalls[];
  noise: { static: number; analytics: number; total: number };
}

const STATIC = /\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/i;
const ANALYTICS = /(collect|analytics|gtm|pixel|beacon|telemetry|metrics|hotjar|sentry)/i;

/** Static files and analytics beacons are noise: counted, never listed. */
export function noiseKind(c: Pick<CallRow, 'url_template' | 'url'>): 'static' | 'analytics' | null {
  if (STATIC.test(c.url_template)) return 'static';
  if (ANALYTICS.test(c.url ?? c.url_template)) return 'analytics';
  return null;
}

function hostOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** The call columns; a store from before migration 0027 has no samples (read as none). */
function selectOf(raw: RawDb): string {
  const cols = raw.prepare('PRAGMA table_info(network_calls)').all() as { name: string }[];
  const samples = cols.some((c) => c.name === 'req_sample')
    ? 'n.req_sample, n.res_sample'
    : 'NULL AS req_sample, NULL AS res_sample';
  return `SELECT n.id, n.run_id, n.method, n.url_template, n.url, n.status, n.req_schema,
  n.res_schema, ${samples}, n.created_at`;
}

function callsOfStep(raw: RawDb, step: ProcessStep): CallRow[] {
  const SELECT = selectOf(raw);
  const ids = step.states.flatMap((s) => s.state_ids);
  if (ids.length === 0) ids.push(step.state_id);
  const marks = ids.map(() => '?').join(',');
  const byAction = raw
    .prepare(
      `${SELECT}, json_extract(e.action_json, '$.accessible_name') AS trigger
       FROM network_calls n JOIN edges e ON e.id = n.edge_id
       WHERE e.from_state IN (${marks}) ORDER BY n.created_at`,
    )
    .all(...ids) as CallRow[];
  const visits = raw
    .prepare(
      `SELECT v.run_id, v.created_at,
         (SELECT min(w.created_at) FROM page_visits w WHERE w.run_id = v.run_id AND w.created_at > v.created_at) AS until
       FROM page_visits v WHERE v.state_id IN (${marks})`,
    )
    .all(...ids) as { run_id: string; created_at: string; until: string | null }[];
  const onLoad: CallRow[] = [];
  for (const v of visits)
    onLoad.push(
      ...(raw
        .prepare(
          `${SELECT}, NULL AS trigger FROM network_calls n
           WHERE n.run_id = ? AND n.edge_id IS NULL AND n.created_at >= ? AND (? IS NULL OR n.created_at < ?)
           ORDER BY n.created_at`,
        )
        .all(v.run_id, v.created_at, v.until, v.until) as CallRow[]),
    );
  const byId = new Map<string, CallRow>();
  for (const c of [...byAction, ...onLoad]) if (!byId.has(c.id)) byId.set(c.id, c);
  return [...byId.values()];
}

/** Every API call of the process's steps, grouped by endpoint, noise counted apart. */
export function processContracts(raw: RawDb, steps: readonly ProcessStep[]): Contracts {
  const noise = { static: 0, analytics: 0, total: 0 };
  const byStep: StepCalls[] = [];
  const endpoints = new Map<string, Endpoint>();
  for (const step of steps) {
    const kept: CallRow[] = [];
    for (const c of callsOfStep(raw, step)) {
      const kind = noiseKind(c);
      if (kind !== null) {
        noise[kind] += 1;
        noise.total += 1;
        continue;
      }
      kept.push(c);
      const key = `${c.method} ${c.url_template}`;
      const ep = endpoints.get(key) ?? {
        method: c.method,
        path: c.url_template,
        host: hostOf(c.url),
        steps: [],
        statuses: {},
        calls: [],
      };
      if (!ep.steps.includes(step.n)) ep.steps.push(step.n);
      ep.statuses[c.status] = (ep.statuses[c.status] ?? 0) + 1;
      ep.calls.push(c);
      endpoints.set(key, ep);
    }
    byStep.push({ n: step.n, calls: kept });
  }
  const list = [...endpoints.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
  return { endpoints: list, byStep, noise };
}

type Shape = string | Shape[] | { [key: string]: Shape };
type Schema = Record<string, unknown>;

const SCALARS: Record<string, string> = {
  string: 'string',
  integer: 'integer',
  number: 'number',
  boolean: 'boolean',
};

/** A recorded shape (`{"a":"string","b":["integer"]}`) as a JSON schema for OpenAPI. */
export function schemaOfShape(shape: Shape): Schema {
  if (Array.isArray(shape))
    return { type: 'array', items: shape[0] === undefined ? {} : schemaOfShape(shape[0]) };
  if (typeof shape === 'object' && shape !== null) {
    if ((shape as { kind?: unknown }).kind === 'document')
      return { type: 'string', description: 'an HTML page' };
    const properties: Record<string, Schema> = {};
    for (const [k, v] of Object.entries(shape).sort(([a], [b]) => a.localeCompare(b)))
      properties[k] = schemaOfShape(v);
    return { type: 'object', properties };
  }
  if (shape === 'null') return { nullable: true };
  return { type: SCALARS[shape] ?? 'string' };
}

function parsed(json: string): Shape | null {
  try {
    const v = JSON.parse(json) as unknown;
    return v === null || (typeof v === 'object' && Object.keys(v).length === 0)
      ? null
      : (v as Shape);
  } catch {
    return null;
  }
}

/** OpenAPI 3.1 from the recorded shapes; examples from the first recorded sample per status. */
export function openApi(title: string, contracts: Contracts, servers: readonly string[]): string {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const ep of contracts.endpoints) {
    const latest = ep.calls[ep.calls.length - 1]!;
    const req = parsed(latest.req_schema);
    const op: Record<string, unknown> = {
      summary: `Called from step ${ep.steps.join(', ')}`,
      responses: Object.fromEntries(
        Object.entries(ep.statuses).map(([status, n]) => {
          const call = ep.calls.find((c) => String(c.status) === status)!;
          const res = parsed(call.res_schema);
          const example = call.res_sample ?? undefined;
          return [
            status,
            {
              description: `Seen ${n} time${n === 1 ? '' : 's'}`,
              ...(res
                ? {
                    content: {
                      'application/json': {
                        schema: schemaOfShape(res),
                        ...(example ? { example } : {}),
                      },
                    },
                  }
                : {}),
            },
          ];
        }),
      ),
    };
    if (req)
      op.requestBody = {
        content: {
          'application/json': {
            schema: schemaOfShape(req),
            ...(latest.req_sample ? { example: latest.req_sample } : {}),
          },
        },
      };
    (paths[ep.path] ??= {})[ep.method.toLowerCase()] = op;
  }
  return stringify(
    {
      openapi: '3.1.0',
      info: {
        title: `${title} (as recorded)`,
        version: 'recorded',
        description:
          "Built by MudPuppy from the request and response shapes the portal sent and returned; not the provider's own contract.",
      },
      servers: servers.map((url) => ({ url })),
      paths,
    },
    { sortMapEntries: false, lineWidth: 0 },
  );
}
