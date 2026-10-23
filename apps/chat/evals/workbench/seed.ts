/**
 * A fresh workspace per Workbench task (spec 043 T020): the portal's config, the migrations and a
 * small store the golden prompts talk about: scan 01a110d5-0000 stopped at /kontakt on a failure,
 * scan 01a2bbbb-0000 running (the short forms people see, Q6), rules BR-021…BR-026, one Workbench
 * conversation. A task's page text goes where
 * portal text reaches the assistant (the stop reason, inside <scan_data>).
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newId } from '@mudpuppy/core';
import { migrateUp, openDb } from '@mudpuppy/store';

export const STOPPED = '01a110d5-0000-7000-8000-000000000001';
export const RUNNING = '01a2bbbb-0000-7000-8000-000000000002';
const T = '2026-10-06T10:47:00.000Z';
const RULES = [
  'Driver must be 21 or older',
  'Zakres is required',
  'OC + AC needs the vehicle value',
  'Price depends on data not visible from the UI',
  'Premium customers get a discount field',
  'Postal code must be NN-NNN',
];

export interface TaskWorkspace {
  dir: string;
  storePath: string;
  conversationId: string;
  remove: () => void;
}

export function seedWorkspace(root: string, portal: string, pageText?: string): TaskWorkspace {
  const dir = mkdtempSync(join(tmpdir(), `pf-workbench-${portal}-`));
  cpSync(join(root, 'portals', portal), join(dir, 'portals', portal), { recursive: true });
  cpSync(join(root, 'data', 'migrations'), join(dir, 'data', 'migrations'), { recursive: true });
  mkdirSync(join(dir, 'data', 'db'), { recursive: true });
  const storePath = join(dir, 'data', 'db', 'sandbox.sqlite');
  const { raw } = openDb(storePath);
  migrateUp(raw, join(dir, 'data', 'migrations'));
  const run = raw.prepare(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport,
       locale, browser, config_snapshot, status, warning, started_at, ended_at)
     VALUES (?, ?, 'guest', 'map', 'sandbox', '2026-10-06', '1280x800', 'pl-PL', 'chromium', '{}', ?, ?, ?, ?)`,
  );
  run.run(STOPPED, portal, 'stopped_warning', pageText ?? 'element not found after 10 s', T, T);
  run.run(RUNNING, portal, 'running', null, T, null);
  const state = raw.prepare(
    `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref,
       confidence, stabilization, first_seen_run, created_at)
     VALUES (?, ?, ?, 'c', ?, ?, 'ev', 'observed', 'settled', ?, ?)`,
  );
  const seen = raw.prepare(
    `INSERT INTO state_observations (run_id, state_id, persona_id, evidence_ref, observed_at)
     VALUES (?, ?, 'guest', 'ev', ?)`,
  );
  for (const [id, route, title] of [
    ['st-home', '/', 'Ubezpieczenia dla Ciebie'],
    ['st-compare', '/porownanie', 'Porównanie'],
    ['st-contact', '/kontakt', 'Kontakt'],
  ] as const) {
    state.run(id, portal, `fp-${id}`, route, title, STOPPED, T);
    seen.run(STOPPED, id, T);
  }
  seen.run(RUNNING, 'st-home', T);
  const record = raw.prepare(
    `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev,
       withdrawn, created_at, updated_at)
     VALUES (?, ?, 'business_rule', ?, ?, ?, 1, ?, 0, ?, ?)`,
  );
  RULES.forEach((title, i) =>
    record.run(
      `rec-br-${String(i)}`,
      portal,
      `BR-0${String(21 + i)}`,
      21 + i,
      title,
      i < 2 ? 1 : null,
      T,
      T,
    ),
  );
  const conversationId = newId();
  raw
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, status, created_at, updated_at, kind)
       VALUES (?, ?, 'workbench', 'active', ?, ?, 'workbench')`,
    )
    .run(conversationId, portal, T, T);
  raw
    .prepare(`INSERT INTO workbench_conversations (conversation_id, updated_at) VALUES (?, ?)`)
    .run(conversationId, T);
  raw.close();
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify(mcpConfig(root, dir, conversationId)));
  return {
    dir,
    storePath,
    conversationId,
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Only the chat's own MCP server, in Workbench mode, on the workspace. */
function mcpConfig(root: string, dir: string, conversationId: string) {
  return {
    mcpServers: {
      'mudpuppy-chat': {
        command: 'pnpm',
        args: ['--dir', join(root, 'apps', 'chat'), 'run', 'mcp'],
        env: {
          MUDPUPPY_ENV: 'sandbox',
          MUDPUPPY_ROOT: dir,
          MUDPUPPY_CHAT_CONVERSATION: conversationId,
          MUDPUPPY_CHAT_KIND: 'workbench',
        },
      },
    },
  };
}
