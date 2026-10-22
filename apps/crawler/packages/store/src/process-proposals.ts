/**
 * Process proposals from the portal model (spec 039 design § 13.2–13.3; R-78 direction: the
 * system groups by itself, people edit). The weighted screen graph comes from the model and its
 * evidence (correlation ids, mounted apps, endpoint families, forms, direct links); Leiden
 * (`apps/miner communities`) cuts it; each community becomes an open grouping suggestion the
 * Processes page already shows. A dismissed or already suggested set of screens is never written.
 */
import { createHash } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@mudpuppy/core';
import { GroupingSuggestion, observedSteps, screensKey } from '@mudpuppy/chat-model';
import { blockedBy, proposalConstraints } from './proposal-constraints.js';
import {
  boundaryGraph,
  compare,
  correlationIds,
  endpointFamily,
  type ScreenSignals,
  type WeightedEdge,
} from '@mudpuppy/model';

type Raw = BetterSqlite3.Database;

export interface ProcessGraph {
  nodes: string[];
  edges: WeightedEdge[];
}

const pair = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

function parseJson(s: string | null): unknown {
  if (!s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

interface CallRow {
  journey_id: string;
  seq: number;
  to_state: string | null;
  method: string;
  url_template: string;
  url: string | null;
  req_sample: string | null;
  res_sample: string | null;
}

/** Adds `value` to the set under the screen of `state`, when the state has a current screen. */
function addTo(
  sets: Map<string, Set<string>>,
  screenOf: ReadonlyMap<string, string>,
  state: string | null,
  value: string,
): void {
  const s = state ? screenOf.get(state) : undefined;
  if (s) sets.set(s, new Set([...(sets.get(s) ?? []), value]));
}

function currentScreens(raw: Raw, portal: string): Map<string, string> {
  const rows = raw
    .prepare(
      `SELECT m.state_id, m.screen_id FROM screen_members m JOIN model_screens s ON s.id = m.screen_id
       WHERE s.portal_id = ? AND m.to_model_version IS NULL`,
    )
    .all(portal) as { state_id: string; screen_id: string }[];
  return new Map(rows.map((r) => [r.state_id, r.screen_id]));
}

/** Micro-frontend and frame scopes mounted on each screen's visits. */
function scopesOf(raw: Raw, portal: string, screenOf: ReadonlyMap<string, string>) {
  const scopes = new Map<string, Set<string>>();
  const rows = raw
    .prepare(
      `SELECT v.state_id, b.scope FROM observations v JOIN observation_builds ob ON ob.observation_id = v.id
       JOIN builds b ON b.id = ob.build_id WHERE b.portal_id = ? AND b.scope <> 'shell'`,
    )
    .all(portal) as { state_id: string; scope: string }[];
  for (const r of rows) addTo(scopes, screenOf, r.state_id, r.scope);
  return scopes;
}

/** The first form chain each screen belongs to. */
function formsOf(raw: Raw, portal: string, screenOf: ReadonlyMap<string, string>) {
  const forms = new Map<string, string>();
  const rows = raw
    .prepare(
      `SELECT s.id, f.route_template || '#' || coalesce(f.form_name, '') AS form FROM states s
       JOIN form_steps f ON f.id = s.form_step_id WHERE s.portal_id = ?`,
    )
    .all(portal) as { id: string; form: string }[];
  for (const r of rows) {
    const s = screenOf.get(r.id);
    if (s && !forms.has(s)) forms.set(s, r.form);
  }
  return forms;
}

/** Pairs of screens joined by a non-global, non-internal model transition. */
function linksOf(raw: Raw, portal: string): Set<string> {
  const rows = raw
    .prepare(
      `SELECT t.from_screen_id, t.to_screen_id FROM model_transitions t JOIN action_classes a ON a.id = t.action_class_id
       JOIN model_screens s ON s.id = t.from_screen_id
       WHERE s.portal_id = ? AND t.internal = 0 AND t.to_screen_id IS NOT NULL AND a.is_global = 0 AND t.status <> 'retired'`,
    )
    .all(portal) as { from_screen_id: string; to_screen_id: string }[];
  return new Set(rows.map((r) => pair(r.from_screen_id, r.to_screen_id)));
}

/** Correlation ids: screens between the first and last use of one value in a journey share it. */
function sharedIds(calls: readonly CallRow[], screenOf: ReadonlyMap<string, string>): Set<string> {
  const shared = new Set<string>();
  const byJourney = new Map<string, CallRow[]>();
  for (const c of calls) byJourney.set(c.journey_id, [...(byJourney.get(c.journey_id) ?? []), c]);
  const hash = (v: string) => createHash('sha256').update(v).digest('hex');
  for (const list of byJourney.values()) {
    const sightings = list.map((c) => ({
      seq: c.seq,
      method: c.method,
      urlTemplate: c.url_template,
      url: c.url ?? '',
      request: parseJson(c.req_sample),
      response: parseJson(c.res_sample),
    }));
    for (const id of correlationIds(sightings, hash)) {
      const inSpan = list.filter((c) => c.seq >= id.first && c.seq <= id.last);
      const span = [
        ...new Set(inSpan.map((c) => (c.to_state ? screenOf.get(c.to_state) : undefined))),
      ]
        .filter((s): s is string => s !== undefined)
        .sort(compare);
      for (let i = 0; i < span.length; i++)
        for (let j = i + 1; j < span.length; j++) shared.add(pair(span[i]!, span[j]!));
    }
  }
  return shared;
}

/** The weighted graph of the portal's active model screens (design § 13.3). */
export function processGraph(raw: Raw, portal: string): ProcessGraph {
  const screens = (
    raw
      .prepare(
        "SELECT id FROM model_screens WHERE portal_id = ? AND status = 'active' ORDER BY key",
      )
      .all(portal) as { id: string }[]
  ).map((r) => r.id);
  const screenOf = currentScreens(raw, portal);
  const scopes = scopesOf(raw, portal, screenOf);
  const forms = formsOf(raw, portal, screenOf);
  const calls = raw
    .prepare(
      `SELECT e.journey_id, e.seq, e.to_state, n.method, n.url_template, n.url, n.req_sample, n.res_sample
       FROM network_calls n JOIN transitions e ON e.id = n.transition_id JOIN runs r ON r.id = e.run_id
       WHERE r.portal_id = ? AND e.journey_id IS NOT NULL ORDER BY e.journey_id, e.seq`,
    )
    .all(portal) as CallRow[];
  // Calls an action caused belong to the screen it led to.
  const families = new Map<string, Set<string>>();
  for (const c of calls) addTo(families, screenOf, c.to_state, endpointFamily(c.url_template));
  const signals: ScreenSignals[] = screens.map((s) => ({
    screen: s,
    scopes: [...(scopes.get(s) ?? [])],
    families: [...(families.get(s) ?? [])],
    form: forms.get(s) ?? null,
  }));
  return {
    nodes: screens,
    edges: boundaryGraph(signals, linksOf(raw, portal), sharedIds(calls, screenOf)),
  };
}

/**
 * Write one open grouping suggestion per community of two or more screens: the screens in flow
 * order from the one the others are reached from, each by its first page version. Returns the
 * names written; skips dismissed and already suggested sets.
 */
export function writeProposals(
  raw: Raw,
  portal: string,
  communities: readonly (readonly string[])[],
  graph: ProcessGraph,
  now = nowIso(),
  skipped: { screens: readonly string[]; reason: string }[] = [],
): string[] {
  const written: string[] = [];
  // A person's dismissals and kept processes (spec 040 T034); `skipped` says which and why.
  const constraints = proposalConstraints(raw, portal);
  const first = raw.prepare(
    `SELECT s.id, s.title, s.route_template FROM screen_members m JOIN states s ON s.id = m.state_id
     WHERE m.screen_id = ? AND m.to_model_version IS NULL ORDER BY m.ordinal LIMIT 1`,
  );
  const inbound = raw.prepare(
    `SELECT t.from_screen_id, t.to_screen_id FROM model_transitions t JOIN action_classes a ON a.id = t.action_class_id
     WHERE t.to_screen_id = ? AND t.internal = 0 AND a.is_global = 0`,
  );
  const persona = (
    raw
      .prepare(
        'SELECT persona_id FROM runs WHERE portal_id = ? GROUP BY persona_id ORDER BY count(*) DESC LIMIT 1',
      )
      .get(portal) as { persona_id: string } | undefined
  )?.persona_id;
  for (const community of communities) {
    if (community.length < 2) continue;
    const reason = blockedBy(constraints, community);
    if (reason) {
      skipped.push({ screens: community, reason });
      continue;
    }
    const members = new Set(community);
    const order = flowOrder(raw, community, members, inbound);
    const states = order
      .map((s) => first.get(s) as { id: string; title: string; route_template: string } | undefined)
      .filter((s): s is { id: string; title: string; route_template: string } => s !== undefined);
    if (states.length < 2) continue;
    const key = screensKey(states.map((s) => s.id));
    const earlier = raw
      .prepare('SELECT 1 FROM grouping_suggestions WHERE portal_id = ? AND screens_key = ?')
      .get(portal, key);
    if (earlier) continue;
    const weights = graph.edges.filter((e) => members.has(e.a) && members.has(e.b));
    const why =
      `Grouped by the portal model (Leiden over ${weights.length} weighted links: shared ids, ` +
      `embedded apps, API families, forms and direct links). Starts at ${states[0]!.route_template}.`;
    const suggestion = GroupingSuggestion.parse({
      id: newId(),
      portal_id: portal,
      name: states[0]!.title,
      persona: persona ?? 'unknown',
      steps: observedSteps(states.map((s) => ({ ...s, screen_id: null }))),
      why,
      screens_key: key,
      status: 'open',
      conversation_id: null,
      process_id: null,
      decided_by: null,
      decided_at: null,
      created_at: now,
    });
    raw
      .prepare(
        `INSERT INTO grouping_suggestions (id, portal_id, name, persona, steps, why, screens_key, status,
           conversation_id, process_id, decided_by, decided_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, NULL, NULL, ?)`,
      )
      .run(
        suggestion.id,
        portal,
        suggestion.name,
        suggestion.persona,
        JSON.stringify(suggestion.steps),
        why,
        key,
        now,
      );
    written.push(suggestion.name);
  }
  return written;
}

/**
 * The community's screens in flow order: from a start screen (one reached from outside the
 * community, else the first), breadth first along its non-global links, then the rest.
 */
function flowOrder(
  raw: Raw,
  community: readonly string[],
  members: ReadonlySet<string>,
  inbound: BetterSqlite3.Statement,
): string[] {
  const sorted = [...community].sort(compare);
  const into = new Map<string, string[]>();
  const out = new Map<string, string[]>();
  for (const s of sorted)
    for (const t of inbound.all(s) as { from_screen_id: string; to_screen_id: string }[]) {
      into.set(s, [...(into.get(s) ?? []), t.from_screen_id]);
      if (members.has(t.from_screen_id))
        out.set(t.from_screen_id, [...(out.get(t.from_screen_id) ?? []), s]);
    }
  const start =
    sorted.find((s) => (into.get(s) ?? []).some((f) => !members.has(f))) ??
    sorted.find((s) => !(into.get(s) ?? []).some((f) => members.has(f))) ??
    sorted[0]!;
  const seen = new Set([start]);
  const queue = [start];
  const order: string[] = [];
  while (queue.length > 0) {
    const s = queue.shift()!;
    order.push(s);
    for (const n of (out.get(s) ?? []).sort(compare))
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  }
  return [...order, ...sorted.filter((s) => !seen.has(s))];
}
