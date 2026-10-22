/**
 * The reconciler's writer (spec 039 design § 7): load a portal's Layer A evidence and recorded
 * decisions, run `reconcile` from `@mudpuppy/model`, and write the difference as one new model
 * version in one transaction. When nothing was recorded or decided since the last version, it
 * writes nothing (idempotence, design § 19.2). `rebuild` ignores that check and re-derives every
 * status; the registry (`model_screens`, `action_classes`, the `model_transitions` key) keeps ids.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@mudpuppy/core';
import { MODEL_DEFAULTS, compare, reconcile, type ReconcileOutput } from '@mudpuppy/model';

import { activeProfile, LEGACY_PROFILE } from './fingerprint-profiles.js';
import { interpretVersion, modelSnapshot, type InterpretStats } from './interpret-writer.js';
import { loadReconcileInput } from './model-input.js';
import { writeProcessInstances } from './process-instances.js';

type Raw = BetterSqlite3.Database;

export interface ReconcileResult {
  portal: string;
  /** The model version written; null when nothing changed since the last one. */
  modelVersion: string | null;
  seq: number | null;
  stats: {
    states: number;
    screens: number;
    newScreens: number;
    lineage: number;
    actionClasses: number;
    transitions: number;
    conflicts: number;
  };
  /** Deviations of the new version and how rules R1–R8 classified them (spec 039 § 8). */
  interpreted?: InterpretStats;
  /** Process instances written for the new version (T073). */
  instances?: number;
}

interface Watermarks {
  observation: string | null;
  decision: string | null;
}

function watermarks(raw: Raw, portal: string): Watermarks {
  const obs = raw
    .prepare(
      'SELECT max(v.id) AS w FROM observations v JOIN runs r ON r.id = v.run_id WHERE r.portal_id = ?',
    )
    .get(portal) as { w: string | null };
  const dec = raw
    .prepare(
      `SELECT max(w) AS w FROM (
         SELECT max(labelled_at) AS w FROM state_pair_labels WHERE portal_id = ?
         UNION ALL SELECT max(decided_at) FROM parameter_roles WHERE portal_id = ? AND decided_by = 'person'
         UNION ALL SELECT max(accepted_at) FROM tau_acceptances WHERE portal_id = ?
         UNION ALL SELECT max(accepted_at) FROM similarity_classifiers WHERE portal_id = ?)`,
    )
    .get(portal, portal, portal, portal) as { w: string | null };
  return { observation: obs.w, decision: dec.w };
}

/** Reconcile one portal and write the new model version. */
export function reconcilePortalModel(
  raw: Raw,
  portal: string,
  opts: { rebuild?: boolean; now?: string; profile?: string } = {},
): ReconcileResult {
  return raw.transaction(() => {
    const marks = watermarks(raw, portal);
    const profile = activeProfile(raw, portal, opts.profile);
    const last = raw
      .prepare(
        `SELECT id, seq, observation_watermark, decision_watermark, fingerprint_profile
         FROM model_versions WHERE portal_id = ? ORDER BY seq DESC LIMIT 1`,
      )
      .get(portal) as
      | {
          id: string;
          seq: number;
          observation_watermark: string | null;
          decision_watermark: string | null;
          fingerprint_profile: string | null;
        }
      | undefined;
    const input = loadReconcileInput(raw, portal, profile);
    const out = reconcile(input);
    const stats = {
      states: input.states.length,
      screens: out.screens.length,
      newScreens: out.screens.filter((s) => s.id.startsWith('new:')).length,
      lineage: out.lineage.length,
      actionClasses: out.actionClasses.length,
      transitions: out.transitions.length,
      conflicts: out.conflicts.length,
    };
    const unchanged =
      last !== undefined &&
      last.observation_watermark === marks.observation &&
      last.decision_watermark === marks.decision &&
      (last.fingerprint_profile ?? LEGACY_PROFILE) === profile;
    if (unchanged && !opts.rebuild) return { portal, modelVersion: null, seq: null, stats };
    const now = opts.now ?? nowIso();
    const versionId = newId();
    const seq = (last?.seq ?? 0) + 1;
    raw
      .prepare(
        `INSERT INTO model_versions (id, portal_id, seq, built_at, algorithm, threshold,
           observation_watermark, decision_watermark, stats_json, fingerprint_profile)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        versionId,
        portal,
        seq,
        now,
        MODEL_DEFAULTS.algorithm,
        input.tau ?? MODEL_DEFAULTS.tau,
        marks.observation,
        marks.decision,
        JSON.stringify(stats),
        profile,
      );
    const before = modelSnapshot(raw, portal);
    const screenIds = writeScreens(raw, portal, out, versionId, now);
    writeRoles(raw, portal, out, now);
    writeActionsAndTransitions(raw, out, screenIds, versionId);
    writeEpochs(raw, portal, out, versionId);
    const interpreted = interpretVersion(raw, portal, {
      versionId,
      prev: before,
      next: modelSnapshot(raw, portal),
      now,
    });
    // Design § 13.1 (T073): the journeys that entered each process, and how they ended.
    const instances = writeProcessInstances(raw, portal, versionId);
    return { portal, modelVersion: versionId, seq, stats, interpreted, instances };
  })();
}

/** Screens, members and lineage; returns model id per reconcile id (`new:<n>` included). */
function writeScreens(
  raw: Raw,
  portal: string,
  out: ReconcileOutput,
  versionId: string,
  now: string,
): Map<string, string> {
  const ids = new Map<string, string>();
  const maxKey = raw
    .prepare(
      'SELECT max(CAST(substr(key, 4) AS INTEGER)) AS n FROM model_screens WHERE portal_id = ?',
    )
    .get(portal) as { n: number | null };
  let next = maxKey.n ?? 0;
  const titleOf = raw.prepare('SELECT title FROM states WHERE id = ?');
  for (const s of out.screens) {
    const latest = s.members[s.members.length - 1]!;
    const title = (titleOf.get(latest) as { title: string } | undefined)?.title ?? '';
    if (s.id.startsWith('new:')) {
      const id = newId();
      next += 1;
      raw
        .prepare(
          `INSERT INTO model_screens (id, key, portal_id, route_key, title, status, first_model_version, created_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
        )
        .run(id, `SC-${String(next).padStart(4, '0')}`, portal, s.routeKey, title, versionId, now);
      ids.set(s.id, id);
    } else {
      raw
        .prepare(
          "UPDATE model_screens SET route_key = ?, title = ?, status = 'active' WHERE id = ?",
        )
        .run(s.routeKey, title, s.id);
      ids.set(s.id, s.id);
    }
  }
  writeLineage(raw, out, ids, versionId);
  writeMembership(raw, { portal, out, ids, versionId });
  return ids;
}

function writeLineage(
  raw: Raw,
  out: ReconcileOutput,
  ids: ReadonlyMap<string, string>,
  versionId: string,
): void {
  for (const l of out.lineage) {
    const from = ids.get(l.from) ?? l.from;
    const to = l.to === null ? null : (ids.get(l.to) ?? l.to);
    raw
      .prepare(
        'INSERT INTO screen_lineage (id, model_version_id, kind, from_screen_id, to_screen_id, members_moved) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(newId(), versionId, l.kind, from, to, l.membersMoved);
    if (l.kind === 'merge' || l.kind === 'retire')
      raw
        .prepare('UPDATE model_screens SET status = ? WHERE id = ?')
        .run(l.kind === 'merge' ? 'merged' : 'retired', from);
  }
}

/** Membership: close rows that moved, open rows that arrived (r1, r2… by first sighting). */
function writeMembership(
  raw: Raw,
  {
    portal,
    out,
    ids,
    versionId,
  }: {
    portal: string;
    out: ReconcileOutput;
    ids: ReadonlyMap<string, string>;
    versionId: string;
  },
): void {
  const current = new Map<string, string>();
  for (const r of raw
    .prepare(
      `SELECT sm.state_id, sm.screen_id FROM screen_members sm JOIN model_screens s ON s.id = sm.screen_id
       WHERE s.portal_id = ? AND sm.to_model_version IS NULL`,
    )
    .all(portal) as { state_id: string; screen_id: string }[])
    current.set(r.state_id, r.screen_id);
  const close = raw.prepare(
    'UPDATE screen_members SET to_model_version = ? WHERE state_id = ? AND to_model_version IS NULL',
  );
  const open = raw.prepare(
    `INSERT INTO screen_members (screen_id, state_id, ordinal, assigned_by, from_model_version, to_model_version)
     VALUES (?, ?, ?, 'clustering', ?, NULL)`,
  );
  const ordinalOf = raw.prepare(
    'SELECT coalesce(max(ordinal), 0) AS n FROM screen_members WHERE screen_id = ?',
  );
  const firstSeen = raw.prepare('SELECT created_at FROM states WHERE id = ?');
  for (const s of out.screens) {
    const id = ids.get(s.id)!;
    const arriving = s.members
      .filter((m) => current.get(m) !== id)
      .sort((a, b) => {
        const ta = (firstSeen.get(a) as { created_at: string }).created_at;
        const tb = (firstSeen.get(b) as { created_at: string }).created_at;
        return compare(ta, tb) || compare(a, b);
      });
    for (const m of arriving) {
      if (current.has(m)) close.run(versionId, m);
      const n = (ordinalOf.get(id) as { n: number }).n;
      open.run(id, m, n + 1, versionId);
    }
  }
}

function writeRoles(raw: Raw, portal: string, out: ReconcileOutput, now: string): void {
  const upsert = raw.prepare(
    `INSERT INTO parameter_roles (portal_id, route_template, param, role, decided_by, decided_at)
     VALUES (?, ?, ?, ?, 'reconciler', ?)
     ON CONFLICT (portal_id, route_template, param) DO UPDATE SET role = excluded.role, decided_at = excluded.decided_at
     WHERE parameter_roles.decided_by = 'reconciler' AND parameter_roles.role <> excluded.role`,
  );
  for (const [template, roles] of out.roles)
    for (const [param, role] of roles) upsert.run(portal, template, param, role, now);
}

/**
 * An element only seen gets the placeholder kind `click`; once pressed, its class takes the kind
 * the press recorded (`submit`, …) and the reconciler stops producing the placeholder. Its row
 * folds into the real class: references move, the row goes (F-24@039). A placeholder some
 * transition hangs on is kept (the element was clicked as well).
 */
function foldPlaceholderClasses(raw: Raw, out: ReconcileOutput, screenIds: Map<string, string>) {
  const produced = new Set(
    out.actionClasses.map((a) => `${a.screen}\u0000${a.elementKey}\u0000${a.kind}`),
  );
  const find = raw.prepare(
    'SELECT id FROM action_classes WHERE screen_id = ? AND element_key = ? AND kind = ?',
  );
  const moveDeviations = raw.prepare(
    'UPDATE deviations SET action_class_id = ? WHERE action_class_id = ?',
  );
  const moveRefs = raw.prepare(
    'UPDATE entity_refs SET action_class_id = ? WHERE action_class_id = ?',
  );
  const drop = raw.prepare(
    'DELETE FROM action_classes WHERE id = ? AND NOT EXISTS (SELECT 1 FROM model_transitions WHERE action_class_id = ?)',
  );
  for (const a of out.actionClasses) {
    if (a.kind === 'click' || produced.has(`${a.screen}\u0000${a.elementKey}\u0000click`)) continue;
    const screen = screenIds.get(a.screen)!;
    const placeholder = find.get(screen, a.elementKey, 'click') as { id: string } | undefined;
    const real = find.get(screen, a.elementKey, a.kind) as { id: string } | undefined;
    if (!placeholder || !real) continue;
    moveDeviations.run(real.id, placeholder.id);
    moveRefs.run(real.id, placeholder.id);
    drop.run(placeholder.id, placeholder.id);
  }
}

function writeActionsAndTransitions(
  raw: Raw,
  out: ReconcileOutput,
  screenIds: Map<string, string>,
  versionId: string,
): void {
  const upsertClass = raw.prepare(
    `INSERT INTO action_classes (id, screen_id, element_key, kind, is_global, status, streak_json, status_model_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (screen_id, element_key, kind) DO UPDATE SET is_global = excluded.is_global,
       status = excluded.status, streak_json = excluded.streak_json,
       status_model_version = excluded.status_model_version
     WHERE action_classes.status <> excluded.status OR action_classes.streak_json <> excluded.streak_json
       OR action_classes.is_global <> excluded.is_global`,
  );
  const classId = raw.prepare(
    'SELECT id FROM action_classes WHERE screen_id = ? AND element_key = ? AND kind = ?',
  );
  for (const a of out.actionClasses) {
    upsertClass.run(
      newId(),
      screenIds.get(a.screen)!,
      a.elementKey,
      a.kind,
      a.isGlobal ? 1 : 0,
      a.status,
      JSON.stringify(a.streak),
      versionId,
    );
  }
  foldPlaceholderClasses(raw, out, screenIds);
  const findTransition = raw.prepare(
    `SELECT id FROM model_transitions WHERE from_screen_id = ? AND action_class_id = ?
       AND IFNULL(to_screen_id, '') = ? AND result = ?`,
  );
  const insertTransition = raw.prepare(
    `INSERT INTO model_transitions (id, from_screen_id, action_class_id, to_screen_id, result, internal, support,
       first_seen_transition_id, last_seen_transition_id, status, status_model_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateTransition = raw.prepare(
    `UPDATE model_transitions SET support = ?, last_seen_transition_id = ?, status = ?, status_model_version = ?
     WHERE id = ? AND (support <> ? OR last_seen_transition_id <> ? OR status <> ?)`,
  );
  for (const t of out.transitions) {
    const from = screenIds.get(t.fromScreen)!;
    const to = t.toScreen === null ? null : screenIds.get(t.toScreen)!;
    const ac = classId.get(from, t.elementKey, t.kind) as { id: string } | undefined;
    if (!ac) continue; // an executed key no member lists (a role-less clickable): no class to hang it on
    const found = findTransition.get(from, ac.id, to ?? '', t.result) as { id: string } | undefined;
    if (found)
      updateTransition.run(
        t.support,
        t.lastSeen,
        t.status,
        versionId,
        found.id,
        t.support,
        t.lastSeen,
        t.status,
      );
    else
      insertTransition.run(
        newId(),
        from,
        ac.id,
        to,
        t.result,
        t.internal ? 1 : 0,
        t.support,
        t.firstSeen,
        t.lastSeen,
        t.status,
        versionId,
      );
  }
}

function writeEpochs(raw: Raw, portal: string, out: ReconcileOutput, versionId: string): void {
  // Epochs are derived again on every version; the latest version's rows are the ones in force.
  raw.prepare('DELETE FROM build_epochs WHERE portal_id = ?').run(portal);
  const insert = raw.prepare(
    `INSERT INTO build_epochs (id, portal_id, scope, environment, build_id, first_observation_id, last_observation_id,
       overlaps_previous, model_version_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const e of out.epochs)
    insert.run(
      newId(),
      portal,
      e.scope,
      e.environment,
      e.build,
      e.firstObservation,
      e.lastObservation,
      e.overlapsPrevious ? 1 : 0,
      versionId,
    );
}
