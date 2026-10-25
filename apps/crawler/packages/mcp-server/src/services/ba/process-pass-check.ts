// The processes pass's coverage for login walls (spec 080, R-97 (1)): over six 2.0 trials the BA
// never wrote P05 "Przedłuż polisę", whose first screen is a login wall; it wrote a follow-up
// instead, and the guidance line of spec 045 did not change that. When the BA records the
// `processes` or the `synthesis` pass, the server lists the session's screens behind a login wall
// that a link or button of the page body reaches by a name of its own, and that no live process
// record cites: the BA writes the process (until_boundary) or says in the gaps why it is none.

import { readFileSync } from 'node:fs';
import type { BaContext } from '../../context.js';
import { json } from './common.js';

/** A screen behind a login wall and the names of the presses that reached it. */
export interface WallCandidate {
  stateId: string;
  route: string;
  triggers: string[];
}

/** Words of a login prompt: log in, sign in, password (pl, en, de, fr, es). */
const LOGIN_WORDS =
  /zaloguj|logowani|log ?in\b|login|sign ?in|anmeld|einlogg|connexion|connecter|iniciar sesi|hasło|password|passwort|mot de passe|contraseña/i;

const CONTROL =
  /^\s*- (link|button|textbox|combobox|checkbox|radio|spinbutton|searchbox|listbox|switch|menuitem|tab)\b(?: "(.*?)")?/;

/** Menus, banners and footers reach areas of a site; the body offers its actions (D-1). */
const SHARED = /^(banner|navigation|contentinfo)( "[^"]*")? > /;

/** At most this many controls in `main`: a wall offers a way to log in and little else. */
const WALL_CONTROLS = 5;

/**
 * True when the page's `main` is a login wall: a control named like a login prompt and at most
 * five controls. A page without `main` is read whole.
 */
export function isLoginWall(snapshot: string): boolean {
  const lines = snapshot.split('\n');
  const start = lines.findIndex((l) => /^\s*- main\b/.test(l));
  let body = lines;
  if (start >= 0) {
    const indent = lines[start]!.length - lines[start]!.trimStart().length;
    const end = lines.findIndex(
      (l, i) => i > start && l.trim() !== '' && l.length - l.trimStart().length <= indent,
    );
    body = lines.slice(start + 1, end < 0 ? undefined : end);
  }
  const controls = body.map((l) => CONTROL.exec(l)).filter((m) => m !== null);
  if (controls.length === 0 || controls.length > WALL_CONTROLS) return false;
  return controls.some((m) => LOGIN_WORDS.test(m[2] ?? ''));
}

interface PressAction {
  accessible_name?: unknown;
  locators?: { kind?: string; value?: string }[];
}

/** The press's own name when it is a body control and not itself a login prompt. */
export function triggerName(actionJson: string): string | null {
  const a = json<PressAction>(actionJson);
  const name = typeof a.accessible_name === 'string' ? a.accessible_name.trim() : '';
  if (!name || LOGIN_WORDS.test(name)) return null;
  const container = a.locators?.find((l) => l.kind === 'container')?.value;
  return container !== undefined && SHARED.test(container) ? null : name;
}

const readSnapshot = (ctx: BaContext, ref: string): string | null => {
  try {
    return readFileSync(ctx.evidence.resolve(ref), 'utf8');
  } catch {
    return null; // a missing snapshot is the evidence reads' concern
  }
};

/** The session's login-wall screens and the body presses that reached each, from other pages. */
export function wallCandidates(ctx: BaContext, sessionId: string): WallCandidate[] {
  const states = ctx.raw
    .prepare(
      `SELECT o.state_id, min(o.evidence_ref) AS evidence_ref, s.route_template AS route
       FROM state_observations o
       JOIN analysis_session_runs r ON r.run_id = o.run_id
       JOIN states s ON s.id = o.state_id
       WHERE r.session_id = ? GROUP BY o.state_id ORDER BY s.route_template, o.state_id`,
    )
    .all(sessionId) as { state_id: string; evidence_ref: string; route: string }[];
  const presses = ctx.raw.prepare(
    `SELECT DISTINCT e.action_json FROM transitions e
     JOIN analysis_session_runs r ON r.run_id = e.run_id
     WHERE r.session_id = ? AND e.to_state = ? AND e.from_state <> e.to_state
       AND e.status = 'executed'`,
  );
  const out: WallCandidate[] = [];
  for (const s of states) {
    const snapshot = readSnapshot(ctx, s.evidence_ref);
    if (snapshot === null || !isLoginWall(snapshot)) continue;
    const triggers = [
      ...new Set(
        (presses.all(sessionId, s.state_id) as { action_json: string }[])
          .map((p) => triggerName(p.action_json))
          .filter((n): n is string => n !== null),
      ),
    ];
    if (triggers.length > 0) out.push({ stateId: s.state_id, route: s.route, triggers });
  }
  return out;
}

/** Route templates a live process record cites: its states, screen regions and transitions into them. */
function citedRoutes(ctx: BaContext, portalId: string): Set<string> {
  const rows = ctx.raw
    .prepare(
      `SELECT s.route_template AS route FROM doc_records d
       JOIN doc_revisions v ON v.record_id = d.id AND v.rev_no = d.latest_rev
       JOIN doc_evidence l ON l.revision_id = v.id
       JOIN states s ON s.id = l.target_id
       WHERE d.portal_id = ? AND d.kind = 'process' AND d.withdrawn = 0
         AND l.target_kind IN ('state', 'screen_region')
       UNION
       SELECT s.route_template FROM doc_records d
       JOIN doc_revisions v ON v.record_id = d.id AND v.rev_no = d.latest_rev
       JOIN doc_evidence l ON l.revision_id = v.id
       JOIN transitions e ON e.id = l.target_id
       JOIN states s ON s.id = e.to_state
       WHERE d.portal_id = ? AND d.kind = 'process' AND d.withdrawn = 0
         AND l.target_kind = 'transition'`,
    )
    .all(portalId, portalId) as { route: string }[];
  return new Set(rows.map((r) => r.route));
}

/** The warning for a `processes` or `synthesis` pass that left login-wall processes out; none when complete. */
export function processPassWarnings(ctx: BaContext, sessionId: string, portalId: string): string[] {
  const cited = citedRoutes(ctx, portalId);
  const missing = wallCandidates(ctx, sessionId).filter((c) => !cited.has(c.route));
  if (missing.length === 0) return [];
  const list = missing
    .map(
      (c) =>
        `${c.route} (state ${c.stateId}) reached by ${c.triggers.map((t) => `"${t}"`).join(', ')}`,
    )
    .join('; ');
  return [
    `${String(missing.length)} screen(s) behind a login wall are reached by a link or button that names an action, and no process record cites them: ${list}. A process whose first screen is a login wall is still a process: write one process record each (the link's words as its name and trigger, observed_extent until_boundary, cite the wall's state; what lies behind the wall is an open question), or say in the synthesis gaps why it is not a process.`,
  ];
}
