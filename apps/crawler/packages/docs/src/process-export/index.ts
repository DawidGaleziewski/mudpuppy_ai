// The rebuild-grade export (spec 034 R-68): one process as a folder, or a whole portal as a folder of
// process folders with a shared README, glossary, API index and screen list (owner answer 8 of
// 2026-10-16). File name → content; no wall-clock time, so the same store gives the same bytes.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RawDb } from '../keys.js';
import { cell, doc, inline, table } from '../render/format.js';
import { loadExportModel } from '../render/export-load.js';
import { openApi } from './contracts.js';
import { loadProcessExport, type ProcessExportModel, type StepModel } from './model.js';
import { elementsSvg, validationNotes, validationSvg } from './pictures.js';
import { contractsDoc } from './render-contracts.js';
import { elementsImage, validationImage } from './render-elements.js';
import { businessRequirements, ears, functionalRequirements, gaps } from './render-records.js';
import { processSteps, readme, stateImage, wireframeImage } from './render-steps.js';
import { processKeys } from './steps.js';

export {
  processKeys,
  resolveProcessSteps,
  type ResolvedProcess,
  type ProcessStep,
} from './steps.js';
export { loadProcessExport, type ProcessExportModel } from './model.js';

export interface ProcessExportOptions {
  environment: string;
  /** The evidence store: screenshots and wireframes are copied into `images/`. */
  evidenceRoot?: string;
}

type Files = Map<string, string | Uint8Array>;

/** Keys sorted at every level: `process.json` is canonical. */
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v !== null && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, sorted(x)]),
    );
  return v;
}

function processJson(m: ProcessExportModel): string {
  return `${JSON.stringify(
    sorted({
      format: 'mudpuppy-process-export/1',
      portal: m.portal,
      environment: m.environment,
      as_of: m.as_of,
      process: {
        key: m.process.key,
        kind: m.process.kind,
        title: m.process.title,
        ...(m.record ? { content: m.record.content, status: m.record.status } : {}),
      },
      // Spec 039 T078: the portal model's view; DMN files themselves are under rules/.
      ...(m.facts
        ? {
            model: {
              version: m.facts.modelVersion,
              triggers: m.facts.triggers,
              outcomes: m.facts.outcomes,
              variants: m.facts.variants,
              explored: m.facts.explored,
              rules: m.facts.rules.map((r) => ({ key: r.key, status: r.status })),
            },
          }
        : {}),
      steps: m.steps.map((s) => ({
        n: s.step.n,
        title: s.step.title,
        route: s.step.route_template,
        state_id: s.step.state_id,
        also_cited: s.step.also_cited,
        states: s.step.states.map((x, i) => ({ ...x, image: stateImage(s.step.n, i, x) })),
        wireframe: wireframeImage(s),
        fields: s.fields,
        elements: s.elements,
        validation: s.validation,
        records: s.records.map((r) => r.key),
      })),
      records: m.srs.records.map((r) => ({
        key: r.key,
        kind: r.kind,
        title: r.title,
        status: r.status,
        confidence: r.confidence,
        content: r.content,
        evidence: r.evidence.map((e) => ({ kind: e.target_kind, id: e.target_id, run: e.run_id })),
      })),
      network: {
        endpoints: m.contracts.endpoints.map((e) => ({
          method: e.method,
          path: e.path,
          host: e.host,
          steps: e.steps,
          statuses: e.statuses,
          calls: e.calls.length,
        })),
        noise: m.contracts.noise,
      },
    }),
    null,
    2,
  )}\n`;
}

function images(m: ProcessExportModel, root: string): Files {
  const files: Files = new Map();
  const read = (ref: string): Uint8Array | null => {
    try {
      return new Uint8Array(readFileSync(join(root, ref)));
    } catch {
      return null;
    }
  };
  for (const s of m.steps) {
    s.step.states.forEach((x, i) => {
      const path = stateImage(s.step.n, i, x);
      const bytes = path && x.screenshot_ref ? read(x.screenshot_ref) : null;
      if (path && bytes) files.set(path, bytes);
    });
    const wire = wireframeImage(s);
    const main = s.step.states.find((x) => x.kind === 'main') ?? s.step.states[0];
    const bytes = wire && main?.wireframe_svg_ref ? read(main.wireframe_svg_ref) : null;
    if (wire && bytes) files.set(wire, bytes);
    for (const [p, b] of annotated(s, read)) files.set(p, b);
  }
  return files;
}

/** The marked screenshots of a step: its elements per happy-path state, its validation messages. */
function annotated(s: StepModel, read: (ref: string) => Uint8Array | null): Files {
  const files: Files = new Map();
  const title = (what: string) => `Step ${s.step.n} ${s.step.title}: ${what}`;
  for (const p of s.pictures) {
    const ref = s.step.states[p.index]?.screenshot_ref;
    const png = ref ? read(ref) : null;
    if (png === null) continue;
    files.set(
      elementsImage(s.step.n, p.index),
      elementsSvg(png, p.page, p.marks, title('elements')),
    );
    const path = p === s.pictures[0] ? validationImage(s) : null;
    if (path)
      files.set(
        path,
        validationSvg(png, p.page, validationNotes(s.validation, p.marks), title('validation')),
      );
  }
  return files;
}

/** Render one process as its folder's files, or null when the portal has no such process. */
export function exportProcess(
  raw: RawDb,
  portal: string,
  key: string,
  opts: ProcessExportOptions,
): Files | null {
  const m = loadProcessExport(raw, portal, key, opts);
  if (m === null) return null;
  const hosts = [
    ...new Set(m.contracts.endpoints.map((e) => e.host).filter((h): h is string => h !== null)),
  ];
  const files: Files = new Map<string, string | Uint8Array>([
    ['README.md', readme(m)],
    ['PROCESS_STEPS.md', processSteps(m)],
    ['BUSINESS_REQUIREMENTS.md', businessRequirements(m)],
    ['FUNCTIONAL_REQUIREMENTS.md', functionalRequirements(m)],
    ['EARS.md', ears(m)],
    ['CONTRACTS.md', contractsDoc(m)],
    [
      'openapi.yaml',
      openApi(
        m.process.title,
        m.contracts,
        hosts.map((h) => `https://${h}`),
      ),
    ],
    ['GAPS.md', gaps(m)],
    ['process.json', processJson(m)],
  ]);
  for (const r of m.facts?.rules ?? []) files.set(`rules/${r.key}.dmn`, r.dmn);
  if (opts.evidenceRoot) for (const [p, b] of images(m, opts.evidenceRoot)) files.set(p, b);
  return files;
}

/** A folder name for a process: its key, lower case (`proc-001`, `prc-002`). */
export const processFolder = (key: string): string => key.toLowerCase();

function portalReadme(
  raw: RawDb,
  portal: string,
  models: ProcessExportModel[],
  as_of: string,
): string {
  const screens = (
    raw.prepare('SELECT count(*) AS n FROM states WHERE portal_id = ?').get(portal) as { n: number }
  ).n;
  const runs = (
    raw.prepare('SELECT count(*) AS n FROM runs WHERE portal_id = ?').get(portal) as { n: number }
  ).n;
  return doc([
    `# ${portal}: documentation (as-is)`,
    '',
    `Exported by MudPuppy · documentation as of ${as_of} · drafts included and marked **DRAFT**.`,
    '',
    ...table(
      ['', ''],
      [
        ['Scans', String(runs)],
        ['Screens recorded', String(screens)],
        ['Documented processes', String(models.length)],
      ],
    ),
    '',
    '## Processes',
    '',
    ...(models.length === 0
      ? ['_No process is documented yet: ask the BA to document the portal._']
      : table(
          ['Key', 'Process', 'Steps', 'Status', 'Folder'],
          models.map((m) => [
            m.process.key,
            m.process.title,
            m.process.steps.filter((s) => !s.also_cited).length,
            m.record?.status ?? 'workspace',
            `[${processFolder(m.process.key)}/](${processFolder(m.process.key)}/README.md)`,
          ]),
        )),
    '',
    '## Shared files',
    '',
    "- [GLOSSARY.md](GLOSSARY.md): the portal's terms, verbatim and in English.",
    '- [APIS.md](APIS.md): every endpoint the processes call.',
    '- [SCREENS.md](SCREENS.md): every recorded screen, in a process or in none.',
    '',
    '## For an agent rebuilding this portal',
    '',
    "Start with a process folder's `process.json`: steps, fields, records and calls with ids and the paths of the pictures. The Markdown files are the same content for people. `GAPS.md` lists what to ask before building.",
  ]);
}

function glossaryDoc(raw: RawDb, portal: string, environment: string): string {
  const full = loadExportModel(raw, portal, { environment, mode: 'all' });
  const terms = full.records.filter((r) => r.kind === 'glossary_term');
  return doc([
    `# ${portal} glossary`,
    '',
    ...(terms.length === 0
      ? ['_No term documented yet._']
      : table(
          ['Term (verbatim)', 'Meaning', 'Status'],
          terms.map((t) => [
            String(t.content.term_verbatim ?? t.title),
            inline(t.content.definition),
            t.status,
          ]),
        )),
  ]);
}

function apisDoc(models: ProcessExportModel[]): string {
  const rows = new Map<string, { calls: number; statuses: Set<number>; used: Set<string> }>();
  for (const m of models)
    for (const e of m.contracts.endpoints) {
      const k = `${e.method} ${e.path}`;
      const row = rows.get(k) ?? { calls: 0, statuses: new Set<number>(), used: new Set<string>() };
      row.calls += e.calls.length;
      for (const s of Object.keys(e.statuses)) row.statuses.add(Number(s));
      row.used.add(`${m.process.key} step ${e.steps.join(', ')}`);
      rows.set(k, row);
    }
  return doc([
    '# APIs',
    '',
    "Every endpoint the documented processes call. Per-process detail (attempts, samples) is in each process folder's CONTRACTS.md.",
    '',
    ...(rows.size === 0
      ? ['_No API call recorded on a documented process._']
      : table(
          ['Endpoint', 'Calls', 'Statuses', 'Used by'],
          [...rows.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, r]) => [
              `\`${k}\``,
              r.calls,
              [...r.statuses].sort().join(', '),
              [...r.used].join('; '),
            ]),
        )),
  ]);
}

function screensDoc(raw: RawDb, portal: string, models: ProcessExportModel[]): string {
  const where = new Map<string, string>();
  for (const m of models)
    for (const s of m.steps)
      for (const x of s.step.states) where.set(x.state_id, `${m.process.key} · ${s.step.n}`);
  const all = raw
    .prepare(
      "SELECT id, title, route_template FROM states WHERE portal_id = ? AND state_kind = 'main' ORDER BY route_template, title",
    )
    .all(portal) as { id: string; title: string; route_template: string }[];
  const inProcess = all.filter((s) => where.has(s.id));
  const loose = all.filter((s) => !where.has(s.id));
  return doc([
    `# ${portal} screens`,
    '',
    `## In a process (${inProcess.length})`,
    '',
    ...table(
      ['Title', 'Route', 'Process · step'],
      inProcess.map((s) => [s.title, `\`${s.route_template}\``, where.get(s.id)]),
    ),
    '',
    `## In no process (${loose.length})`,
    '',
    ...(loose.length === 0
      ? ['_None._']
      : table(
          ['Title', 'Route'],
          loose.map((s) => [cell(s.title), `\`${s.route_template}\``]),
        )),
  ]);
}

/** The whole portal: a README, the shared files and one folder per documented process. */
export function exportPortal(raw: RawDb, portal: string, opts: ProcessExportOptions): Files {
  const models = processKeys(raw, portal)
    .map((k) => loadProcessExport(raw, portal, k, opts))
    .filter((m): m is ProcessExportModel => m !== null);
  const as_of = loadExportModel(raw, portal, { environment: opts.environment, mode: 'all' }).as_of;
  const files: Files = new Map<string, string | Uint8Array>([
    ['README.md', portalReadme(raw, portal, models, as_of)],
    ['GLOSSARY.md', glossaryDoc(raw, portal, opts.environment)],
    ['APIS.md', apisDoc(models)],
    ['SCREENS.md', screensDoc(raw, portal, models)],
  ]);
  for (const m of models) {
    const folder = processFolder(m.process.key);
    for (const [p, c] of exportProcess(raw, portal, m.process.key, opts) ?? [])
      files.set(`${folder}/${p}`, c);
  }
  return files;
}
