// CONTRACTS.md of a process export (spec 034 R-68, owner answers 4 and 7 of 2026-10-16): the APIs
// per step, what was sent and returned per attempt with the recorded samples, the noise left out,
// and pseudo-code of what the page checks before it calls them (from the recorded form fields).

import { doc, inline, table } from '../render/format.js';
import { responseVersions, type Endpoint } from './contracts.js';
import type { ProcessExportModel, StepModel } from './model.js';
import { navLine } from './render-steps.js';

const shape = (json: string): string => {
  try {
    const v = JSON.parse(json) as unknown;
    return v === null || (typeof v === 'object' && Object.keys(v).length === 0)
      ? ''
      : JSON.stringify(v, null, 2);
  } catch {
    return '';
  }
};

/**
 * The response contracts by schema hash (spec 039 § 16, spec 040 T031): shown when the endpoint
 * answered in more than one shape, oldest first, each with when it was seen and its shape.
 */
function versionsBlock(ep: Endpoint): string[] {
  const versions = responseVersions(ep);
  if (versions.length < 2) return [];
  return [
    '',
    `### Response contracts · ${versions.length}`,
    '',
    'The response changed shape while it was recorded (grouped by schema hash: the key paths and their types).',
    '',
    ...table(
      ['#', 'Schema', 'First seen', 'Last seen', 'Calls', 'Statuses'],
      versions.map((v, i) => [
        i + 1,
        v.hash ? `\`${v.hash.slice(0, 12)}\`` : 'not JSON',
        v.first.slice(0, 19),
        v.last.slice(0, 19),
        v.calls.length,
        [...new Set(v.calls.map((c) => c.status))].join(', '),
      ]),
    ),
    ...versions.flatMap((v, i) => {
      const res = shape(v.calls[v.calls.length - 1]!.res_schema);
      return res ? ['', `Contract ${i + 1}:`, '', '```json', res, '```'] : [];
    }),
  ];
}

function endpointBlock(ep: Endpoint): string[] {
  const latest = ep.calls[ep.calls.length - 1]!;
  const req = shape(latest.req_schema);
  const res = shape(latest.res_schema);
  const statuses = Object.entries(ep.statuses)
    .map(([s, n]) => `${s} ×${n}`)
    .join(', ');
  const sampled = ep.calls.find((c) => c.req_sample !== null || c.res_sample !== null);
  return [
    '',
    `## ${ep.method} ${ep.path}`,
    '',
    `${ep.host ? `Host \`${ep.host}\` · ` : ''}called from step ${ep.steps.join(', ')} · ${statuses}`,
    ...(req ? ['', '**Request** (shape)', '', '```json', req, '```'] : []),
    ...(res ? ['', '**Response** (shape)', '', '```json', res, '```'] : []),
    ...versionsBlock(ep),
    '',
    '### Attempts',
    '',
    ...table(
      ['#', 'Scan', 'Sent by', 'Status', 'When'],
      ep.calls.map((c, i) => [
        i + 1,
        `\`${c.run_id}\``,
        c.trigger ?? 'page load',
        c.status,
        c.created_at.slice(0, 19),
      ]),
    ),
    ...(sampled
      ? [
          '',
          `Sample (attempt ${ep.calls.indexOf(sampled) + 1}, recorded outside production):`,
          '',
          '```text',
          ...(sampled.req_sample ? [`request:  ${sampled.req_sample}`] : []),
          ...(sampled.res_sample ? [`response: ${sampled.res_sample}`] : []),
          '```',
        ]
      : []),
  ];
}

/** What the page checks before it moves on, from the recorded fields (no source code is read). */
function clientLogic(steps: readonly StepModel[]): string[] {
  const out: string[] = [];
  for (const s of steps) {
    const required = s.fields.filter((f) => f.required).map((f) => `"${f.label}"`);
    const checks = s.fields
      .filter((f) => f.validation !== '')
      .map((f) => `    check "${f.label}": ${inline(f.validation)}`);
    if (required.length === 0 && checks.length === 0) continue;
    out.push(`on step ${s.step.n} (${inline(s.step.title)}) submit:`);
    if (required.length > 0) out.push(`    require ${required.join(', ')}`);
    out.push(...checks);
  }
  return out.length === 0 ? ['_No form checks recorded._'] : ['```text', ...out, '```'];
}

export function contractsDoc(m: ProcessExportModel): string {
  const c = m.contracts;
  const kept = c.endpoints.reduce((n, e) => n + e.calls.length, 0);
  return doc([
    `# ${m.process.key} Contracts`,
    '',
    navLine('CONTRACTS.md'),
    '',
    'Which APIs the process calls, what each step sends and gets back, per attempt. Machine-readable: [openapi.yaml](openapi.yaml), built from the recorded shapes.',
    '',
    '## Signal and noise',
    '',
    `Kept here: **${c.endpoints.length} endpoint${c.endpoints.length === 1 ? '' : 's'}, ${kept} call${kept === 1 ? '' : 's'}**. Left out as noise: ${c.noise.static} static file${c.noise.static === 1 ? '' : 's'}, ${c.noise.analytics} analytics call${c.noise.analytics === 1 ? '' : 's'}.`,
    '',
    '## By step',
    '',
    ...(c.endpoints.length === 0
      ? ['_No API call recorded on this process._']
      : table(
          ['Step', 'Trigger', 'Call', 'Statuses'],
          c.byStep.flatMap((b) =>
            [
              ...new Set(
                b.calls.map((x) => `${x.trigger ?? 'page load'}|${x.method} ${x.url_template}`),
              ),
            ].map((k) => {
              const [trigger, call] = k.split('|');
              const statuses = [
                ...new Set(
                  b.calls
                    .filter(
                      (x) => `${x.trigger ?? 'page load'}|${x.method} ${x.url_template}` === k,
                    )
                    .map((x) => x.status),
                ),
              ];
              return [b.n, trigger, `\`${call}\``, statuses.join(', ')];
            }),
          ),
        )),
    ...c.endpoints.flatMap(endpointBlock),
    '',
    '## Logic seen on the client (pseudo-code)',
    '',
    'What the page checks before it moves on, from the recorded form fields; not from source code.',
    '',
    ...clientLogic(m.steps),
  ]);
}
