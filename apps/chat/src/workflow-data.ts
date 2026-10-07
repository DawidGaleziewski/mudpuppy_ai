// Load the recorded facts `@pathfinder/workflow` needs for one portal (R-30 T015, research R4).
// Read-only queries over the store plus the portal and persona folders; no writes.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { loadEffectiveConfig, portalEnvironments, type Environment } from '@pathfinder/config';
import type {
  ProcessFact,
  RecordedStep,
  RunFact,
  ScopeFact,
  SessionFact,
  Step,
  StepStatus,
  WorkflowInput,
} from '@pathfinder/workflow';

export interface WorkspacePaths {
  repoRoot: string;
}

export function portalFile(paths: WorkspacePaths, portal: string): string {
  return join(paths.repoRoot, 'portals', portal, 'portal.yaml');
}

/** Persona ids of a portal: `personas/<portal>/*.yaml` and one level of process subfolders. */
export function listPersonas(paths: WorkspacePaths, portal: string): string[] {
  const dir = join(paths.repoRoot, 'personas', portal);
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    if (entry.isFile() && entry.name.endsWith('.yaml')) out.push(entry.name.slice(0, -5));
    if (entry.isDirectory())
      for (const sub of readdirSync(join(dir, entry.name)))
        if (sub.endsWith('.yaml')) out.push(`${entry.name}/${sub.slice(0, -5)}`);
  }
  return out.sort();
}

/** Portals with a `portals/<id>/portal.yaml`. */
export function listPortals(paths: WorkspacePaths): string[] {
  const dir = join(paths.repoRoot, 'portals');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'portal.yaml')))
    .map((e) => e.name)
    .sort();
}

const REF = /^ref:(.+)$/;

/**
 * True when some persona of the portal can run now: an anonymous one needs no credentials, a
 * logged-in one needs every `ref:` it names stored in the vault (any environment). A persona that
 * does not load counts as not ready; `request_scan` reports its problems.
 */
export function credentialsReady(
  raw: BetterSqlite3.Database,
  paths: WorkspacePaths,
  portal: string,
): boolean {
  const portalPath = portalFile(paths, portal);
  if (!existsSync(portalPath)) return false;
  let environments: Environment[];
  try {
    environments = portalEnvironments(portalPath).map((e) => e.environment);
  } catch {
    return false; // not loadable: not ready
  }
  const fence = [
    join(paths.repoRoot, 'personas', '_mixins'),
    join(paths.repoRoot, 'personas', portal),
  ];
  // Ready when some persona can run on some environment of the portal (spec 011 FR-008), with
  // that environment's credentials stored.
  for (const environment of environments) {
    const stored = new Set(
      (
        raw
          .prepare(`SELECT ref_name FROM credentials WHERE portal_id = ? AND environment = ?`)
          .all(portal, environment) as { ref_name: string }[]
      ).map((r) => r.ref_name),
    );
    for (const persona of listPersonas(paths, portal)) {
      try {
        const auth = loadEffectiveConfig(
          portalPath,
          join(paths.repoRoot, 'personas', portal, `${persona}.yaml`),
          { fence },
          environment,
        ).persona.auth;
        const refs =
          auth === 'none'
            ? []
            : Object.values(auth)
                .map((v) => REF.exec(v)?.[1])
                .filter((v): v is string => v !== undefined);
        if (refs.every((r) => stored.has(r))) return true;
      } catch {
        // not loadable: not ready
      }
    }
  }
  return false;
}

interface CountRow {
  n: number;
}

function count(raw: BetterSqlite3.Database, sql: string, ...args: unknown[]): number {
  return (raw.prepare(sql).get(...args) as CountRow | undefined)?.n ?? 0;
}

export function loadWorkflowInput(
  raw: BetterSqlite3.Database,
  paths: WorkspacePaths,
  portal: string | null,
  conversationId: string | null,
): WorkflowInput {
  const empty: WorkflowInput = {
    portal,
    portalConfigured: false,
    personas: [],
    credentialsStored: false,
    runs: [],
    statesRecorded: 0,
    frontierPending: 0,
    processes: [],
    sessions: [],
    docRecords: 0,
    scopes: [],
    activeAmendments: 0,
    supersededAmendments: 0,
    recordedSteps: [],
  };
  if (portal === null) return empty;

  const runs = (
    raw
      .prepare(
        `SELECT id, mode, status, warning, started_at, ended_at FROM runs WHERE portal_id = ?`,
      )
      .all(portal) as {
      id: string;
      mode: string;
      status: RunFact['status'];
      warning: string | null;
      started_at: string;
      ended_at: string | null;
    }[]
  ).map((r): RunFact => ({
    id: r.id,
    mode: r.mode,
    status: r.status,
    warning: r.warning,
    startedAt: r.started_at,
    endedAt: r.ended_at,
  }));

  const processes = (
    raw.prepare(`SELECT id, name, outcome FROM processes WHERE portal_id = ?`).all(portal) as {
      id: string;
      name: string;
      outcome: ProcessFact['outcome'];
    }[]
  ).map((p): ProcessFact => ({ id: p.id, name: p.name, outcome: p.outcome }));

  const sessions = (
    raw
      .prepare(`SELECT id, status, started_at, ended_at FROM analysis_sessions WHERE portal_id = ?`)
      .all(portal) as {
      id: string;
      status: SessionFact['status'];
      started_at: string;
      ended_at: string | null;
    }[]
  ).map((s): SessionFact => ({
    id: s.id,
    status: s.status,
    startedAt: s.started_at,
    endedAt: s.ended_at,
  }));

  const scopes = (
    raw
      .prepare(`SELECT id, process_name, created_at FROM process_scopes WHERE portal_id = ?`)
      .all(portal) as { id: string; process_name: string; created_at: string }[]
  ).map((s): ScopeFact => ({ id: s.id, processName: s.process_name, createdAt: s.created_at }));

  const recordedSteps =
    conversationId === null
      ? []
      : (
          raw
            .prepare(
              `SELECT step, status, error_ref, updated_at FROM workflow_steps
               WHERE conversation_id = ? AND portal_id = ?`,
            )
            .all(conversationId, portal) as {
            step: Step;
            status: StepStatus;
            error_ref: string | null;
            updated_at: string;
          }[]
        ).map((s): RecordedStep => ({
          step: s.step,
          status: s.status,
          errorRef: s.error_ref,
          updatedAt: s.updated_at,
        }));

  // Frontier of the newest map run only: older runs' queues were superseded by it.
  const latestMap = runs
    .filter((r) => r.mode === 'map')
    .reduce<RunFact | undefined>(
      (a, r) => (a === undefined || r.startedAt > a.startedAt ? r : a),
      undefined,
    );

  return {
    portal,
    portalConfigured: existsSync(portalFile(paths, portal)),
    personas: listPersonas(paths, portal),
    credentialsStored: credentialsReady(raw, paths, portal),
    runs,
    statesRecorded: count(raw, `SELECT count(*) AS n FROM states WHERE portal_id = ?`, portal),
    frontierPending:
      latestMap === undefined
        ? 0
        : count(
            raw,
            `SELECT count(*) AS n FROM frontier WHERE run_id = ? AND status = 'pending'`,
            latestMap.id,
          ),
    processes,
    sessions,
    docRecords: count(
      raw,
      `SELECT count(*) AS n FROM doc_records WHERE portal_id = ? AND withdrawn = 0`,
      portal,
    ),
    scopes,
    activeAmendments: count(
      raw,
      `SELECT count(*) AS n FROM amendments WHERE portal_id = ? AND status = 'active'`,
      portal,
    ),
    supersededAmendments: count(
      raw,
      `SELECT count(*) AS n FROM amendments WHERE portal_id = ? AND status = 'superseded'`,
      portal,
    ),
    recordedSteps,
  };
}
