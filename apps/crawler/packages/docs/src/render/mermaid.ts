/**
 * Mermaid source built from structured documentation (research §9): process map, screen
 * navigation, capability map. Never authored by an agent. The dashboard has a Python twin
 * (`apps/dashboard/src/pathfinder_dashboard/diagrams.py`); both must produce byte-identical text
 * for the shared goldens in `specs/004-ba-documentation/contracts/diagram-fixtures/`.
 *
 * Determinism: inputs are sorted here (by ord or key), labels are escaped the same way in both
 * twins, output ends with one newline.
 */

export interface ProcessMapInput {
  process: { key: string; title: string };
  steps: { ord: number; kind: string; intent: string }[];
  /** Present when the trace stopped at a safety boundary. */
  boundary?: { action: string; not_observable: string } | null;
}

export interface ScreenNavInput {
  screens: { key: string; title: string }[];
  transitions: { from: string; to: string; label: string }[];
}

export interface CapabilityMapInput {
  capabilities: { key: string; title: string; contains: { key: string; title: string }[] }[];
}

/** Node id from a record key: `SCR-001` → `SCR_001` (a hyphen can read as part of an arrow). */
export function nodeId(key: string): string {
  return key.replace(/[^A-Za-z0-9_]/g, '_');
}

/** A label safe inside `"…"`: quotes and angle brackets as entities, whitespace collapsed. */
export function label(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/&/g, '#amp;')
    .replace(/"/g, '#quot;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;');
}

const byKey = <T extends { key: string }>(a: T, b: T): number =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

export function processMap(input: ProcessMapInput): string {
  const steps = [...input.steps].sort((a, b) => a.ord - b.ord);
  const lines = ['flowchart TD', `  start(["${label(input.process.title)}"])`];
  for (const s of steps)
    lines.push(`  s${s.ord}["${s.ord}. ${label(s.kind)}: ${label(s.intent)}"]`);
  if (input.boundary)
    lines.push(
      `  boundary{{"${label(input.boundary.action)}: ${label(input.boundary.not_observable)}"}}`,
    );
  let prev = 'start';
  for (const s of steps) {
    lines.push(`  ${prev} --> s${s.ord}`);
    prev = `s${s.ord}`;
  }
  if (input.boundary) {
    lines.push(`  ${prev} -.-> boundary`);
    lines.push('  classDef notObservable stroke-dasharray: 4 3');
    lines.push('  class boundary notObservable');
  }
  return `${lines.join('\n')}\n`;
}

export function screenNav(input: ScreenNavInput): string {
  const screens = [...input.screens].sort(byKey);
  const known = new Set(screens.map((s) => s.key));
  const transitions = input.transitions
    .filter((t) => known.has(t.from) && known.has(t.to))
    .map((t) => ({ ...t, label: label(t.label) }))
    .sort((a, b) =>
      a.from !== b.from
        ? a.from < b.from
          ? -1
          : 1
        : a.to !== b.to
          ? a.to < b.to
            ? -1
            : 1
          : a.label < b.label
            ? -1
            : a.label > b.label
              ? 1
              : 0,
    );
  const lines = ['flowchart LR'];
  for (const s of screens) lines.push(`  ${nodeId(s.key)}["${label(s.key)}: ${label(s.title)}"]`);
  const seen = new Set<string>();
  for (const t of transitions) {
    const line = `  ${nodeId(t.from)} -->|"${t.label}"| ${nodeId(t.to)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return `${lines.join('\n')}\n`;
}

export function capabilityMap(input: CapabilityMapInput): string {
  const lines = ['flowchart TB'];
  for (const c of [...input.capabilities].sort(byKey)) {
    lines.push(`  subgraph ${nodeId(c.key)}["${label(c.key)}: ${label(c.title)}"]`);
    for (const p of [...c.contains].sort(byKey))
      lines.push(`    ${nodeId(c.key)}__${nodeId(p.key)}["${label(p.key)}: ${label(p.title)}"]`);
    lines.push('  end');
  }
  return `${lines.join('\n')}\n`;
}
