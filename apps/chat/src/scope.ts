// Process narrowing (R-30 T026, FR-013..FR-016): propose candidate processes from recorded data,
// record the scope the BA confirmed, and hand a scoped documentation job to the `ba` agent.
// Candidates come only from what was recorded (traced processes, documented process records,
// mapped states); nothing is invented, and an empty result says so (spec edge case).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { z } from 'zod';
import { newId, nowIso } from '@mudpuppy/core';
import { ProcessScope } from '@mudpuppy/chat-model';
import { syncScopeProcess } from './scope-process.js';
import { recordStep } from './steps.js';

export class ScopeRefusal extends Error {
  constructor(
    readonly code: 'MISSING_INPUT' | 'INVALID' | 'NOT_FOUND',
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ScopeRefusal';
  }
}

export interface StateRef {
  id: string;
  title: string;
  route: string;
}

export interface Candidate {
  source: 'traced_process' | 'documented_process' | 'matching_states';
  name: string;
  /** Proposed start and end; null when the BA has to pick them in the checklist. */
  startStateId: string | null;
  endStateId: string | null;
  states: StateRef[];
  /** Share of the description's words found in the candidate (0..1). */
  score: number;
}

const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'for',
  'in',
  'on',
  'i',
  'want',
  'process',
  'proces',
  'i',
  'w',
  'na',
  'do',
  'z',
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Prefix match so "insurance" finds "insur…" variants and Polish inflections share a stem. */
function score(query: string[], text: string): number {
  if (query.length === 0) return 0;
  const hay = words(text);
  const hit = query.filter((q) =>
    hay.some((h) => h.startsWith(q.slice(0, 5)) || q.startsWith(h.slice(0, 5))),
  );
  return hit.length / query.length;
}

export function listProcessCandidates(
  raw: BetterSqlite3.Database,
  portal: string,
  description: string,
  limit = 5,
): { candidates: Candidate[]; hint: string | null } {
  const q = words(description);
  const states = raw
    .prepare(
      `SELECT id, title, route_template AS route FROM states WHERE portal_id = ? ORDER BY created_at`,
    )
    .all(portal) as StateRef[];
  const byId = new Map(states.map((s) => [s.id, s]));
  if (states.length === 0)
    return { candidates: [], hint: 'nothing is mapped for this portal yet: scan it first' };

  const out: Candidate[] = [];

  const traced = raw
    .prepare(`SELECT id, name, goal FROM processes WHERE portal_id = ? AND outcome IS NOT NULL`)
    .all(portal) as { id: string; name: string; goal: string }[];
  const stepsOf = raw.prepare(
    `SELECT state_before, state_after FROM process_steps WHERE process_id = ? ORDER BY ord`,
  );
  for (const p of traced) {
    const ids: string[] = [];
    for (const s of stepsOf.all(p.id) as {
      state_before: string | null;
      state_after: string | null;
    }[])
      for (const id of [s.state_before, s.state_after])
        if (id !== null && !ids.includes(id)) ids.push(id);
    const refs = ids.map((id) => byId.get(id)).filter((s): s is StateRef => s !== undefined);
    out.push({
      source: 'traced_process',
      name: p.name,
      startStateId: refs[0]?.id ?? null,
      endStateId: refs.at(-1)?.id ?? null,
      states: refs,
      score: score(q, `${p.name} ${p.goal} ${refs.map((r) => r.title).join(' ')}`),
    });
  }

  const documented = raw
    .prepare(
      `SELECT title FROM doc_records WHERE portal_id = ? AND kind = 'process' AND withdrawn = 0`,
    )
    .all(portal) as { title: string }[];
  for (const d of documented)
    if (!out.some((c) => c.name === d.title))
      out.push({
        source: 'documented_process',
        name: d.title,
        startStateId: null,
        endStateId: null,
        states: [],
        score: score(q, d.title),
      });

  const matching = states.filter((s) => score(q, `${s.title} ${s.route}`) > 0);
  if (matching.length > 0)
    out.push({
      source: 'matching_states',
      name: `Screens matching "${description}"`,
      startStateId: null,
      endStateId: null,
      states: matching,
      score: Math.max(...matching.map((s) => score(q, `${s.title} ${s.route}`))),
    });

  const candidates = out
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
  return {
    candidates,
    hint:
      candidates.length > 0
        ? null
        : 'no mapped process or screen matches that description: offer a trace of the process or a broader scan',
  };
}

export const SetScopeInput = z.object({
  portal: z.string().min(1),
  process_name: z.string().min(1),
  persona: z.string().min(1),
  start_state_id: z.string().min(1),
  end_state_id: z.string().min(1),
  selected_state_ids: z.array(z.string().min(1)).default([]),
  comments: z.record(z.string(), z.string()).default({}),
  source: z.enum(['agent_proposal', 'ba_description']).default('ba_description'),
});
export type SetScopeInput = z.input<typeof SetScopeInput>;

export function setProcessScope(
  raw: BetterSqlite3.Database,
  repoRoot: string,
  conversationId: string,
  input: SetScopeInput,
): ProcessScope {
  const s = SetScopeInput.parse(input);
  const missing: string[] = [];
  if (!existsSync(join(repoRoot, 'personas', s.portal, `${s.persona}.yaml`)))
    missing.push(`persona ${s.persona}`);
  const selected = [...new Set([s.start_state_id, ...s.selected_state_ids, s.end_state_id])];
  const known = new Set(
    (
      raw
        .prepare(
          `SELECT id FROM states WHERE portal_id = ? AND id IN (${selected.map(() => '?').join(',')})`,
        )
        .all(s.portal, ...selected) as { id: string }[]
    ).map((r) => r.id),
  );
  for (const id of selected) if (!known.has(id)) missing.push(`state ${id} of ${s.portal}`);
  for (const id of Object.keys(s.comments))
    if (!selected.includes(id)) missing.push(`comment on state ${id}, which is not selected`);
  if (missing.length > 0)
    throw new ScopeRefusal('INVALID', 'the scope refers to things that do not exist', missing);

  const row = ProcessScope.parse({
    id: newId(),
    conversation_id: conversationId,
    portal_id: s.portal,
    process_name: s.process_name,
    persona: s.persona,
    start_state_id: s.start_state_id,
    end_state_id: s.end_state_id,
    selected_state_ids: selected,
    comments: s.comments,
    source: s.source,
    created_at: nowIso(),
  });
  // The scope and its BA process (spec 022 T035) are written together.
  raw.transaction(() => {
    raw
      .prepare(
        `INSERT INTO process_scopes
         (id, conversation_id, portal_id, process_name, persona, start_state_id, end_state_id,
          selected_state_ids, comments, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.conversation_id,
        row.portal_id,
        row.process_name,
        row.persona,
        row.start_state_id,
        row.end_state_id,
        JSON.stringify(row.selected_state_ids),
        JSON.stringify(row.comments),
        row.source,
        row.created_at,
      );
    syncScopeProcess(raw, row);
  })();
  recordStep(raw, { conversationId, portalId: s.portal, step: 'narrow', status: 'done' });
  return row;
}

export interface DocumentationHandoff {
  step: 'document';
  status: 'pending';
  scopeId: string;
  handoff: { agent: 'ba'; prompt: string };
}

export function requestDocumentation(
  raw: BetterSqlite3.Database,
  conversationId: string,
  portal: string,
  scopeId: string,
): DocumentationHandoff {
  const scope = raw
    .prepare(`SELECT * FROM process_scopes WHERE id = ? AND portal_id = ?`)
    .get(scopeId, portal) as
    | {
        process_name: string;
        persona: string;
        start_state_id: string;
        end_state_id: string;
        selected_state_ids: string;
        comments: string;
      }
    | undefined;
  if (scope === undefined)
    throw new ScopeRefusal('NOT_FOUND', `no process scope ${scopeId} for ${portal}`, [
      'a process scope (pick its start and end)',
    ]);
  const running = raw
    .prepare(`SELECT id FROM analysis_sessions WHERE portal_id = ? AND status = 'running' LIMIT 1`)
    .get(portal) as { id: string } | undefined;
  if (running !== undefined)
    throw new ScopeRefusal(
      'INVALID',
      `documentation of ${portal} is already running (${running.id})`,
    );

  const selected = JSON.parse(scope.selected_state_ids) as string[];
  const comments = JSON.parse(scope.comments) as Record<string, string>;
  recordStep(raw, { conversationId, portalId: portal, step: 'document', status: 'pending' });
  const commentLines = Object.entries(comments).map(([id, text]) => `- ${id}: ${text}`);
  return {
    step: 'document',
    status: 'pending',
    scopeId,
    handoff: {
      agent: 'ba',
      prompt: [
        `Document portal "${portal}", scoped to one process: "${scope.process_name}" as persona "${scope.persona}" (scope ${scopeId}).`,
        `It starts at state ${scope.start_state_id} and ends at state ${scope.end_state_id}.`,
        `States in scope: ${selected.join(', ')}.`,
        'Cite only evidence recorded on these states and the transitions between them; anything outside the scope is out of this job.',
        ...(commentLines.length > 0 ? ['BA comments per state:', ...commentLines] : []),
        'Finish with the session summary and the gaps.',
      ].join('\n'),
    },
  };
}
