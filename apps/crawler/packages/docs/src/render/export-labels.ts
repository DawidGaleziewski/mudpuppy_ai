/** Labels of what the export cites: evidence targets, data item sightings, screen-to-screen links. */
import type { DocKind, EvidenceTargetKind } from '@mudpuppy/docs-model';
import type { RawDb } from '../keys.js';
import type { ScreenNavInput } from './mermaid.js';
import type { ExportRecord } from './model.js';

export const json = (text: string | null): unknown => {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const accessibleName = (actionJson: string | null): string | null => {
  const a = json(actionJson);
  return a && typeof a === 'object' && 'accessible_name' in a ? String(a.accessible_name) : null;
};

/** Labels as the Docs tab shows them (queries_docs.py `_TARGETS`); never evidence file content. */
const TARGET_LABEL: Partial<
  Record<EvidenceTargetKind, { table: string; label: (r: Record<string, unknown>) => string }>
> = {
  state: { table: 'states', label: (r) => `${String(r.title)} (${String(r.route_template)})` },
  // spec 019: an observation is shown by its verbatim URL (the dashboard's `_TARGETS` does the same)
  observation: { table: 'observations', label: (r) => String(r.url) },
  screen_region: {
    table: 'states',
    label: (r) => `${String(r.title)} (${String(r.route_template)})`,
  },
  transition: {
    table: 'transitions',
    label: (r) => {
      const name = accessibleName(r.action_json as string | null);
      return name ? `transition: "${name}"` : 'transition';
    },
  },
  action: {
    table: 'actions',
    label: (r) => `${String(r.role)} "${String(r.accessible_name ?? '')}"`,
  },
  form: {
    table: 'forms',
    label: (r) => {
      const fields = json(r.fields_json as string);
      const names = Array.isArray(fields)
        ? fields
            .map((f: unknown) => (f && typeof f === 'object' && 'name' in f ? String(f.name) : ''))
            .filter(Boolean)
        : [];
      return `form: ${names.slice(0, 4).join(', ') || 'fields not named'}`;
    },
  },
  network_call: {
    table: 'network_calls',
    label: (r) => `${String(r.method)} ${String(r.url_template)}`,
  },
  open_question: { table: 'open_questions', label: (r) => String(r.text) },
  decision: {
    table: 'decision_log',
    label: (r) =>
      `${String(r.kind)} ${String(r.rule ?? '')}: ${String(r.reason)}`.replace(/ +/g, ' '),
  },
  process: { table: 'processes', label: (r) => String(r.name) },
  process_step: {
    table: 'process_steps',
    label: (r) => `step ${String(r.ord)}: ${String(r.intent)}`,
  },
};

function labelOf(raw: RawDb, kind: EvidenceTargetKind, id: string): string | null {
  const spec = TARGET_LABEL[kind];
  if (spec) {
    const row = raw.prepare(`SELECT * FROM ${spec.table} WHERE id = ?`).get(id) as
      Record<string, unknown> | undefined;
    return row ? spec.label(row) : null;
  }
  if (kind === 'doc_record') {
    const row = raw.prepare('SELECT key, title FROM doc_records WHERE id = ?').get(id) as
      { key: string; title: string } | undefined;
    return row ? row.title : null;
  }
  if (kind === 'review') {
    const row = raw.prepare('SELECT action, reviewer FROM doc_reviews WHERE id = ?').get(id) as
      { action: string; reviewer: string } | undefined;
    return row ? `review (${row.action}) by ${row.reviewer}` : null;
  }
  return null;
}

export function labelsOf(
  raw: RawDb,
  links: readonly { target_kind: EvidenceTargetKind; target_id: string }[],
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const kind of new Set(links.map((l) => l.target_kind))) {
    const ids = [...new Set(links.filter((l) => l.target_kind === kind).map((l) => l.target_id))];
    for (const id of ids) {
      const label = labelOf(raw, kind, id);
      if (label !== null) labels.set(`${kind}:${id}`, label);
    }
  }
  return labels;
}

export function sightingLabels(raw: RawDb, rendered: ExportRecord[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rendered) {
    if (r.kind !== 'data_item' || !Array.isArray(r.content.seen_in)) continue;
    for (const s of r.content.seen_in as { kind?: string; target_id?: string }[]) {
      if (!s.target_id || out[s.target_id]) continue;
      if (s.kind === 'form') {
        const row = raw
          .prepare(
            'SELECT s.route_template FROM forms f JOIN states s ON s.id = f.state_id WHERE f.id = ?',
          )
          .get(s.target_id) as { route_template: string } | undefined;
        if (row) out[s.target_id] = `form on ${row.route_template}`;
      } else if (s.kind === 'network_call') {
        const row = raw
          .prepare('SELECT method, url_template FROM network_calls WHERE id = ?')
          .get(s.target_id) as { method: string; url_template: string } | undefined;
        if (row) out[s.target_id] = `${row.method} ${row.url_template}`;
      } else if (s.kind === 'observation') {
        const row = raw.prepare('SELECT url FROM observations WHERE id = ?').get(s.target_id) as
          { url: string } | undefined;
        if (row) out[s.target_id] = `URL ${row.url}`;
      }
    }
  }
  return out;
}

/**
 * Mirror of the dashboard's `screen_diagram_input`: transitions that lead from a state one rendered
 * screen cites to a state another cites; targets reached from more than half the screens
 * (global navigation) are left out and counted.
 */
export function screenNavInput(
  raw: RawDb,
  rendered: ExportRecord[],
  selected: ReadonlyMap<
    string,
    { record: { kind: DocKind; seq: number; key: string }; shown: { id: string } }
  >,
): ScreenNavInput & { omitted: number } {
  const screens = rendered.filter((r) => r.kind === 'screen');
  const owner = new Map<string, string>();
  for (const s of [...selected.values()]
    .filter((x) => x.record.kind === 'screen')
    .sort((a, b) => a.record.seq - b.record.seq)) {
    const states = raw
      .prepare(
        `SELECT target_id FROM doc_evidence WHERE revision_id = ? AND target_kind = 'state' ORDER BY id`,
      )
      .all(s.shown.id) as { target_id: string }[];
    for (const { target_id } of states)
      if (!owner.has(target_id)) owner.set(target_id, s.record.key);
  }
  const pairs = new Map<string, { from: string; to: string; label: string }>();
  if (owner.size > 0) {
    const ids = [...owner.keys()];
    const marks = ids.map(() => '?').join(',');
    const transitions = raw
      .prepare(
        `SELECT from_state, to_state, action_json FROM transitions
         WHERE from_state IN (${marks}) AND to_state IN (${marks}) ORDER BY id LIMIT 200`,
      )
      .all(...ids, ...ids) as { from_state: string; to_state: string; action_json: string }[];
    for (const e of transitions) {
      const a = owner.get(e.from_state)!;
      const b = owner.get(e.to_state)!;
      const name = accessibleName(e.action_json);
      const k = `${a}\u0000${b}`;
      if (a !== b && name && !pairs.has(k)) pairs.set(k, { from: a, to: b, label: name });
    }
  }
  const sources = new Map<string, Set<string>>();
  for (const p of pairs.values()) sources.set(p.to, (sources.get(p.to) ?? new Set()).add(p.from));
  const global = new Set(
    [...sources]
      .filter(([, s]) => s.size > Math.max(3, Math.floor(screens.length / 2)))
      .map(([to]) => to),
  );
  const kept = [...pairs.values()].filter((p) => !global.has(p.to));
  return {
    screens: screens.map((s) => ({ key: s.key, title: s.title })),
    transitions: kept,
    omitted: pairs.size - kept.length,
  };
}
