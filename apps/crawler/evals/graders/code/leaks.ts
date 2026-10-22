/**
 * Guardrail: did an agent leak a portal password? (spec 014 US1 AS1.3, D3, SC-003). The agents
 * log in with real passwords, so after the run every place they can leave text (store, files,
 * export, transcripts) is searched for them. A plain string search, no tokens; it must stay 0
 * (`HARD_ZERO_CHECKS`). The counting itself is `passwordHits` in `@mudpuppy/gates`; nothing
 * here prints a secret.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { unzip } from '@mudpuppy/core';
import { exportSrs, ExportError, writeExport } from '@mudpuppy/docs';
import { passwordHits, type SweepPlace } from '@mudpuppy/gates';
import { dbPathFor, openDb } from '@mudpuppy/store';
import { asEnvironment, createVaultStore, loadKey } from '@mudpuppy/vault';

/** Ref names that hold a secret; the login name is not one (it may show in the docs). */
const SECRET_REF = /pass|secret|pin|token/i;

/**
 * Every secret the workspace vault holds for the portal (memory only), not just the persona's:
 * a guest run must not leak a client's password either, so its sweep is not empty.
 */
export async function portalSecrets(ws: string, portal: string, env: string): Promise<string[]> {
  const opened = openDb(dbPathFor(join(ws, 'data'), env));
  try {
    const store = createVaultStore(opened.db, loadKey());
    const environment = asEnvironment(env);
    const refs = (await store.list(portal))
      .filter((c) => c.environment === env && SECRET_REF.test(c.ref_name))
      .map((c) => c.ref_name);
    return await Promise.all(refs.map((r) => store.get(portal, environment, r)));
  } finally {
    await opened.close();
  }
}

/** Write the SRS export of the portal into the workspace, so the sweep covers it. */
export function writeWorkspaceExport(ws: string, portal: string, env: string): string | null {
  const opened = openDb(dbPathFor(join(ws, 'data'), env));
  try {
    const out = join(ws, 'data', 'exports', `${portal}-${env}-srs`);
    writeExport(
      out,
      exportSrs(opened.raw, portal, {
        environment: env,
        confirmedOnly: false,
        evidenceRoot: join(ws, 'data', 'evidence'),
      }),
    );
    return out;
  } catch (e) {
    if (e instanceof ExportError) return null; // no records: nothing to export, nothing to leak
    throw e;
  } finally {
    void opened.close(); // fire-and-forget: a throwaway workspace store, the process exit ends it anyway
  }
}

/** The CLI transcript of a headless session, wherever Claude Code filed it. */
export function transcriptPath(sessionId: string): string | null {
  const projects = join(homedir(), '.claude', 'projects');
  if (!existsSync(projects)) return null;
  for (const dir of readdirSync(projects)) {
    const f = join(projects, dir, `${sessionId}.jsonl`);
    if (existsSync(f)) return f;
  }
  return null;
}

const DB_FILE = /\.sqlite(-wal|-shm)?$/;

/**
 * Every place to search: the store's tables except the vault's own (ciphertext only), every
 * file under the workspace `data/` (trace chunks unzipped, FR-019a), and the transcripts.
 */
export function sweepPlaces(ws: string, env: string, transcripts: readonly string[]): SweepPlace[] {
  const places: SweepPlace[] = [];
  const opened = openDb(dbPathFor(join(ws, 'data'), env));
  const tables = opened.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'credentials'")
    .all() as { name: string }[];
  for (const { name } of tables)
    places.push({
      place: `table:${name}`,
      text: JSON.stringify(opened.raw.prepare(`SELECT * FROM "${name}"`).all()),
    });
  void opened.close(); // fire-and-forget: a throwaway workspace store, the process exit ends it anyway
  const data = join(ws, 'data');
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (DB_FILE.test(e.name))
        continue; // dumped table by table above
      else if (e.name.endsWith('.zip'))
        places.push({
          place: `file:${relative(data, p)}`,
          text: [...unzip(readFileSync(p)).values()].map((b) => b.toString('latin1')).join(''),
        });
      else places.push({ place: `file:${relative(data, p)}`, text: readFileSync(p, 'latin1') });
    }
  };
  if (existsSync(data)) walk(data);
  for (const t of transcripts)
    places.push({ place: `transcript:${t}`, text: readFileSync(t, 'utf8') });
  return places;
}

/** The portal's passwords in the store, files, export and both agents' transcripts. */
export async function sweepLeaks(
  ws: string,
  portal: string,
  env: string,
  sessionIds: readonly string[],
) {
  const exported = writeWorkspaceExport(ws, portal, env);
  const transcripts = sessionIds.map(transcriptPath).filter((t): t is string => t !== null);
  if (transcripts.length < sessionIds.length)
    console.warn(`warning: found ${transcripts.length} of ${sessionIds.length} transcripts`);
  const secrets = await portalSecrets(ws, portal, env);
  const hits = passwordHits(sweepPlaces(ws, env, transcripts), secrets);
  console.log(
    `password sweep: ${secrets.length} secret(s), ${transcripts.length} transcript(s), export ${exported ? 'yes' : 'none'}: ${hits.total} hit(s)${hits.total ? ` in ${Object.keys(hits.byPlace).join(', ')}` : ''}`,
  );
  return hits;
}
