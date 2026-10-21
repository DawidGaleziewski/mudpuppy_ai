// README.md and PROCESS_STEPS.md of a process export (spec 034 R-68, layout of the owner-rated
// mocks in specs/034-…/mocks/demo-insurer/travel-quote/). Pure functions of the model.

import { cell, doc, inline, table } from '../render/format.js';
import type { ExportRecord } from '../render/model.js';
import type { ProcessExportModel, StepModel } from './model.js';
import { elementsSection, validationSection } from './render-elements.js';
import type { StepState } from './steps.js';

/** The file a record kind lives in, inside a process folder. */
export const PROCESS_FILE: Record<string, string> = {
  business_rule: 'BUSINESS_REQUIREMENTS.md',
  capability: 'BUSINESS_REQUIREMENTS.md',
  use_case: 'BUSINESS_REQUIREMENTS.md',
  process: 'README.md',
  requirement: 'FUNCTIONAL_REQUIREMENTS.md',
  nfr: 'FUNCTIONAL_REQUIREMENTS.md',
  assumption: 'GAPS.md',
  open_question: 'GAPS.md',
  followup: 'GAPS.md',
};

export const NAV = [
  ['README', 'README.md'],
  ['Steps', 'PROCESS_STEPS.md'],
  ['Business', 'BUSINESS_REQUIREMENTS.md'],
  ['Functional', 'FUNCTIONAL_REQUIREMENTS.md'],
  ['EARS', 'EARS.md'],
  ['Contracts', 'CONTRACTS.md'],
  ['Gaps', 'GAPS.md'],
] as const;

/** The file links on top of every file, the current one in plain text. */
export const navLine = (current: string): string =>
  NAV.map(([label, file]) => (file === current ? label : `[${label}](${file})`)).join(' · ');

/** A record key, linked to its file in the process folder when it has one there. */
export function recordLink(r: Pick<ExportRecord, 'key' | 'kind'>, from: string): string {
  const file = PROCESS_FILE[r.kind];
  if (file === undefined) return `\`${r.key}\``;
  return file === from
    ? `[\`${r.key}\`](#${r.key.toLowerCase()})`
    : `[\`${r.key}\`](${file}#${r.key.toLowerCase()})`;
}

const KIND_LABEL: Record<string, string> = {
  main: 'happy path',
  validation: 'validation',
  technical: 'technical (error)',
};

/** Image paths are a pure function of the step and the state's position: byte-stable exports. */
export function stateImage(n: number, i: number, s: StepState): string | null {
  return s.screenshot_ref ? `images/step-${n}-${i + 1}-${s.kind}.png` : null;
}

export function wireframeImage(sm: StepModel): string | null {
  const main = sm.step.states.find((s) => s.kind === 'main') ?? sm.step.states[0];
  return main?.wireframe_svg_ref ? `images/step-${sm.step.n}-wireframe.svg` : null;
}

const content = (r: ExportRecord | null, field: string): string =>
  r && typeof r.content[field] === 'string' ? inline(r.content[field]) : '—';

const FILE_ROWS: string[][] = [
  [
    '[PROCESS_STEPS.md](PROCESS_STEPS.md)',
    'Every step: its states with pictures, wireframe, fields, rules and requirements, where it goes next',
  ],
  [
    '[BUSINESS_REQUIREMENTS.md](BUSINESS_REQUIREMENTS.md)',
    'Capability and use-case goals, business rules with decision tables and pseudo-code',
  ],
  [
    '[FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md)',
    'Requirements with acceptance criteria, non-functional requirements',
  ],
  ['[EARS.md](EARS.md)', 'Each requirement, rule and NFR as the EARS statement the BA wrote'],
  [
    '[CONTRACTS.md](CONTRACTS.md) + [openapi.yaml](openapi.yaml)',
    'APIs per step, what was sent and returned per attempt, OpenAPI',
  ],
  ['[GAPS.md](GAPS.md)', 'Open questions, assumptions, follow-ups: what to ask before rebuilding'],
  ['`images/`', 'Screenshots per state, wireframes per step'],
  ['`process.json`', 'All of the above as data, for agents'],
];

export function readme(m: ProcessExportModel): string {
  const p = m.process;
  const r = m.record;
  const count = (kind: string) => m.srs.records.filter((x) => x.kind === kind).length;
  return doc([
    `# ${p.key} ${inline(p.title)}`,
    '',
    `Portal \`${m.portal}\` · environment ${m.environment} · ${r ? `${r.status} · observed **${content(r, 'observed_extent')}**` : 'workspace process'} · documentation as of ${m.as_of}`,
    '',
    navLine('README.md'),
    '',
    '## What this service does',
    '',
    r && typeof r.content.summary === 'string'
      ? inline(r.content.summary)
      : `The process "${inline(p.title)}" of ${m.portal}.`,
    '',
    ...table(
      ['', ''],
      [
        ['Goal', content(r, 'goal')],
        ['Persona', content(r, 'persona')],
        ['Trigger', content(r, 'trigger')],
        ['Outcome', content(r, 'outcome')],
        ['Steps', String(p.steps.filter((s) => !s.also_cited).length)],
        ['Fields', String(m.steps.reduce((n, s) => n + s.fields.length, 0))],
        [
          'Business rules · requirements · NFRs · open questions',
          `${count('business_rule')} · ${count('requirement')} · ${count('nfr')} · ${count('open_question')}`,
        ],
        ['APIs called', String(m.contracts.endpoints.length)],
      ],
    ),
    '',
    '## The steps at a glance',
    '',
    ...table(
      ['#', 'Step', 'Route', 'States'],
      m.steps.map((s) => [
        s.step.also_cited ? `(${s.step.n})` : s.step.n,
        `[${cell(s.step.title)}](PROCESS_STEPS.md#step-${s.step.n})`,
        `\`${s.step.route_template}\``,
        s.step.states.map((x) => stateName(s.step.n, x)).join(', ') || '—',
      ]),
    ),
    ...(m.steps.some((s) => s.step.also_cited)
      ? ['', '(n): cited by the documentation, not on the walked path.']
      : []),
    '',
    ...modelSection(m),
    '## Files',
    '',
    ...table(
      ['File', 'What it holds'],
      [
        ...FILE_ROWS,
        ...(m.facts && m.facts.rules.length > 0
          ? [['`rules/*.dmn`', 'The decision rules on these screens as DMN 1.3 tables']]
          : []),
      ],
    ),
    '',
    '## Scans behind this documentation',
    '',
    ...table(
      ['Scan', 'Mode', 'Persona', 'Date'],
      m.srs.runs
        .filter((x) => p.runs.includes(x.id))
        .map((x) => [`\`${x.id}\``, x.mode, x.persona_id, x.date]),
    ),
  ]);
}

/**
 * What the portal model knows of the process (spec 039 T078): how journeys entered it, how they
 * ended, the paths walked, how far it was explored and the decision rules on its screens.
 */
function modelSection(m: ProcessExportModel): string[] {
  const f = m.facts;
  if (!f || f.modelVersion === null) return [];
  const outcomes = Object.entries(f.outcomes)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([o, n]) => `${o.replace(/_/g, ' ')} ${n}`)
    .join(' · ');
  return [
    '## The process in the portal model',
    '',
    `Model version ${f.modelVersion}. ${f.explored ?? 'Not explored yet: the stopping rule has not run on this process.'}`,
    '',
    ...(f.triggers.length > 0
      ? [
          'Ways in (triggers):',
          '',
          ...table(
            ['Pressed on', 'Element', 'Times'],
            f.triggers.map((t) => [t.screen, `\`${t.element}\``, String(t.count)]),
          ),
          '',
          `How the walks ended: ${outcomes}.`,
          '',
          ...table(
            ['Screens walked', 'Outcome', 'Times'],
            f.variants.map((v) => [v.screens.join(' → '), v.outcome, String(v.count)]),
          ),
          '',
        ]
      : ['No journey entered the process through a trigger yet.', '']),
    ...(f.rules.length > 0
      ? [
          `Decision rules: ${f.rules.map((r) => `[${r.key}](rules/${r.key}.dmn) (${r.status})`).join(', ')}.`,
          '',
        ]
      : []),
  ];
}

/** `4b` for a variant of step 4, else the kind ("technical (error)"). */
const stateName = (n: number, s: StepState): string =>
  s.variant !== null ? `${n}${s.variant}` : (KIND_LABEL[s.kind] ?? s.kind);

function statesTable(sm: StepModel): string[] {
  return table(
    ['State', 'Kind', 'Reached by', 'Picture'],
    sm.step.states.map((s, i) => {
      const img = stateImage(sm.step.n, i, s);
      const step = s.form_step ? ` · form step ${s.form_step.index} (${s.form_step.label})` : '';
      const variants = s.variants > 1 ? ` · ${s.variants} recordings with other typed values` : '';
      // The table escapes pipes itself; the alt text only drops the characters Markdown reads.
      const alt = s.title.replace(/[[\]|]/g, ' ');
      return [
        `${s.variant !== null ? `**${sm.step.n}${s.variant}** ` : ''}${s.title}${step}${variants}`,
        KIND_LABEL[s.kind] ?? s.kind,
        s.reached_by.join('; ') || '—',
        img ? `![${alt}](${img})` : '_no picture_',
      ];
    }),
  );
}

/**
 * The step's variants and what makes each: a page whose form differs by an earlier choice is one
 * step with variants (owner review 2026-10-17), told apart by the actions that lead to each.
 */
function variantLines(sm: StepModel): string[] {
  const vs = sm.step.states.filter((s) => s.variant !== null);
  if (vs.length < 2) return [];
  const shared = vs.map((v) => new Set(v.reached_by));
  return [
    '',
    `**One step, ${vs.length} variants.** The page's form differs depending on what came before:`,
    '',
    ...vs.map((v, i) => {
      const own = v.reached_by.filter((r) => shared.some((s, j) => j !== i && !s.has(r)));
      const when = (own.length > 0 ? own : v.reached_by).join('; ') || 'not recorded';
      return `- **${sm.step.n}${v.variant}**: when reached by ${when}.`;
    }),
  ];
}

function fieldsTable(sm: StepModel): string[] {
  if (sm.fields.length === 0) return ['_No form field recorded on this step._'];
  return table(
    [
      '#',
      'Label (verbatim)',
      'English',
      'Type',
      'Required',
      'Validation',
      'Options',
      'Documented as',
    ],
    sm.fields.map((f, i) => [
      i + 1,
      f.only_in
        ? `${f.label} _(only in ${f.only_in.map((v) => `${sm.step.n}${v}`).join(', ')})_`
        : f.label,
      f.name_en ?? '—',
      f.type,
      f.required ? 'yes' : 'no',
      f.validation || '—',
      f.options || '—',
      f.data_item ?? '—',
    ]),
  );
}

function nextTable(m: ProcessExportModel, sm: StepModel): string[] {
  const calls = m.contracts.byStep.find((b) => b.n === sm.step.n)?.calls ?? [];
  const triggers = [...new Set(calls.map((c) => c.trigger ?? 'page load'))];
  if (triggers.length === 0) return ['_No API call recorded on this step._'];
  return table(
    ['Trigger', 'Calls'],
    triggers.map((t) => [
      t,
      [
        ...new Set(
          calls
            .filter((c) => (c.trigger ?? 'page load') === t)
            .map((c) => `${c.method} ${c.url_template} (${c.status})`),
        ),
      ].join(', '),
    ]),
  );
}

export function processSteps(m: ProcessExportModel): string {
  const lines = [`# ${m.process.key} Process steps`, '', navLine('PROCESS_STEPS.md'), ''];
  for (const sm of m.steps) {
    const wire = wireframeImage(sm);
    lines.push(
      '---',
      '',
      `## <a id="step-${sm.step.n}"></a>Step ${sm.step.n} · ${inline(sm.step.title)}`,
      '',
      `route \`${sm.step.route_template}\` · state \`${sm.step.state_id}\`${sm.step.also_cited ? ' · cited, not on the walked path' : ''}`,
      '',
      '### States',
      '',
      ...statesTable(sm),
      ...variantLines(sm),
      '',
      '### Wireframe and fields',
      '',
      wire ? `![Wireframe of step ${sm.step.n}](${wire})` : '_No wireframe recorded._',
      '',
      ...fieldsTable(sm),
      '',
      '### Elements on the page',
      '',
      ...elementsSection(sm),
      '',
      '### Validation',
      '',
      ...validationSection(sm),
      '',
      '### Rules and requirements on this step',
      '',
      ...(sm.records.filter((r) => PROCESS_FILE[r.kind] !== undefined && r.kind !== 'process')
        .length === 0
        ? ['_None documented yet._']
        : sm.records
            .filter((r) => PROCESS_FILE[r.kind] !== undefined && r.kind !== 'process')
            .map(
              (r) =>
                `- ${recordLink(r, 'PROCESS_STEPS.md')} ${inline(r.title)} (${r.status}, ${r.confidence})`,
            )),
      '',
      '### API calls',
      '',
      ...nextTable(m, sm),
      '',
    );
  }
  return doc(lines);
}
