import {
  byKind,
  doc,
  field,
  FILE_OF_KIND,
  incoming,
  inline,
  keyLink,
  list,
  recordBlock,
  table,
} from '../format.js';
import { capabilityMap, processMap, screenNav } from '../mermaid.js';
import type { StateInventory } from '../../param-inventory.js';
import type { ExportModel, ExportRecord } from '../model.js';

const mermaid = (text: string): string[] => ['```mermaid', text.trimEnd(), '```'];
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** `02-capabilities.md`: capability map, then each CAP with what it contains. */
export function capabilities(m: ExportModel): string {
  const file = FILE_OF_KIND.capability;
  const caps = byKind(m.records, 'capability');
  const title = new Map(m.records.map((r) => [r.key, r.title]));
  const contained = (c: ExportRecord) =>
    c.relations.filter((x) => x.type === 'contains').map((x) => x.to_key);
  return doc([
    '# 2. Capabilities',
    '',
    ...(caps.length === 0
      ? ['_No capabilities documented._']
      : mermaid(
          capabilityMap({
            capabilities: caps.map((c) => ({
              key: c.key,
              title: c.title,
              contains: contained(c).map((k) => ({ key: k, title: title.get(k) ?? k })),
            })),
          }),
        )),
    ...caps.flatMap((c) =>
      recordBlock(
        c,
        file,
        [
          inline(c.content.description),
          '',
          '**Contains:**',
          '',
          ...list(contained(c).map((k) => `${keyLink(k, file)} ${title.get(k) ?? ''}`)),
        ],
        3,
        ['contains'],
      ),
    ),
  ]);
}

/** `03-screens.md`: navigation diagram, then each SCR. */
export function screens(m: ExportModel): string {
  const file = FILE_OF_KIND.screen;
  const all = byKind(m.records, 'screen');
  const nav = m.screen_nav;
  return doc([
    '# 3. Screens',
    '',
    ...(all.length === 0
      ? ['_No screens documented._']
      : [
          '## Navigation',
          '',
          ...mermaid(screenNav(nav)),
          ...(nav.omitted > 0
            ? [
                '',
                `${nav.omitted} transition${nav.omitted === 1 ? '' : 's'} to screens reached from most pages (global navigation) are left out of the diagram.`,
              ]
            : []),
        ]),
    ...all.flatMap((s) => {
      const elements = Array.isArray(s.content.elements)
        ? (s.content.elements as { role?: unknown; label_verbatim?: unknown }[])
        : [];
      const items = incoming(m.records, s.key, 'appears_on');
      return recordBlock(s, file, [
        field('Purpose', s.content.purpose),
        '',
        '**Route templates:**',
        '',
        ...list(strings(s.content.route_templates).map((r) => `\`${r}\``)),
        '',
        '**Elements** (labels verbatim):',
        '',
        ...(elements.length === 0
          ? ['_none recorded_']
          : table(
              ['Role', 'Label'],
              elements.map((e) => [e.role, e.label_verbatim]),
            )),
        '',
        '**Data items shown:**',
        '',
        ...list(items.map((d) => `${keyLink(d.key, file)} ${d.title}`)),
        '',
        '**Entry points:**',
        '',
        ...list(strings(s.content.entry_points)),
        ...observedUrls(m.screen_urls[s.key]),
      ]);
    }),
  ]);
}

/**
 * The URLs a screen was reached under and the parameters they carried, as recorded (spec 019,
 * R-37/R-38): what a re-creating team needs to keep old links and parameter wiring working.
 */
function observedUrls(inv: StateInventory | undefined): string[] {
  if (!inv) return [];
  return [
    '',
    '**URLs observed** (verbatim):',
    '',
    ...list(
      inv.entry_urls.map(
        (e) =>
          `\`${e.url}\` (${e.visits} visit${e.visits === 1 ? '' : 's'}${e.hop_kinds.length ? `; via ${e.hop_kinds.join(' → ')}` : ''})`,
      ),
    ),
    ...(inv.entry_urls_more > 0 ? ['', `and ${inv.entry_urls_more} more`] : []),
    ...(inv.params.length === 0
      ? []
      : [
          '',
          '**URL parameters:**',
          '',
          ...table(
            ['Name', 'In', 'Values seen', 'Distinct'],
            inv.params.map((p) => [
              `\`${p.name}\``,
              p.in.replace('_', ' '),
              p.values.map((v) => (v === null ? '(no value)' : `\`${v}\``)).join(', '),
              String(p.distinct),
            ]),
          ),
        ]),
  ];
}

type Flow = { n?: unknown; actor_or_system?: unknown; text?: unknown }[];
const flowLines = (flow: Flow, prefix = ''): string[] =>
  flow.map((s) => `${prefix}${String(s.n)}. ${inline(s.actor_or_system)}: ${inline(s.text)}`);

function useCaseBody(u: ExportRecord): string[] {
  const c = u.content;
  const alternates = Array.isArray(c.alternate_flows) ? (c.alternate_flows as Flow[]) : [];
  const exceptions = Array.isArray(c.exception_flows) ? (c.exception_flows as Flow[]) : [];
  const branches = [
    ...alternates.flatMap((f, i) => [`*Alternate flow A${i + 1}:*`, '', ...flowLines(f), '']),
    ...exceptions.flatMap((f, i) => [`*Exception flow E${i + 1}:*`, '', ...flowLines(f), '']),
  ];
  return [
    field('Primary actor', c.primary_actor),
    '',
    field('Trigger', c.trigger),
    '',
    '**Preconditions:**',
    '',
    ...list(strings(c.preconditions)),
    '',
    '**Main success scenario:**',
    '',
    ...flowLines(Array.isArray(c.main_flow) ? (c.main_flow as Flow) : []),
    '',
    '**Extensions:**',
    '',
    ...(branches.length === 0 ? ['_none recorded_'] : branches),
    '',
    '**Postconditions:**',
    '',
    ...list(strings(c.postconditions)),
  ];
}

/** `04-processes-and-use-cases.md`: each PROC with its process map and the UCs describing it. */
export function processes(m: ExportModel): string {
  const file = FILE_OF_KIND.process;
  const procs = byKind(m.records, 'process');
  const ucs = byKind(m.records, 'use_case');
  const placed = new Set<string>();
  const out: string[] = ['# 4. Processes and use cases', '', '## 4.1 Processes'];
  if (procs.length === 0) out.push('', '_No processes documented._');
  for (const p of procs) {
    const c = p.content;
    out.push(
      ...recordBlock(p, file, [
        field('Goal', c.goal),
        '',
        field('Persona', c.persona),
        '',
        field('Trigger', c.trigger),
        '',
        field('Outcome', c.outcome),
        '',
        field('Observed extent', String(c.observed_extent ?? '').replace(/_/g, ' ')),
        '',
        ...(p.trace
          ? ['**Process map:**', '', ...mermaid(processMap(p.trace))]
          : ['_No trace recorded for this process._']),
        ...(p.boundary
          ? [
              '',
              `**Not observable beyond the boundary** (${inline(p.boundary.action)}): ${inline(p.boundary.not_observable)}`,
            ]
          : []),
      ]),
    );
    for (const u of incoming(ucs, p.key, 'describes')) {
      if (placed.has(u.key)) continue;
      placed.add(u.key);
      out.push(...recordBlock(u, file, useCaseBody(u), 4));
    }
  }
  const rest = ucs.filter((u) => !placed.has(u.key));
  out.push('', '## 4.2 Use cases not linked to a process');
  if (rest.length === 0) out.push('', '_none_');
  for (const u of rest) out.push(...recordBlock(u, file, useCaseBody(u)));
  return doc(out);
}
