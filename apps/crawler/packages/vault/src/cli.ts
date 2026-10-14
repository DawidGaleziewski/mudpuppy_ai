import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadPersona } from '@pathfinder/config';
import { djangoPbkdf2, generatePassword, loadKey } from './crypto.js';
import { VaultError } from './errors.js';
import { importPersonas } from './import-personas.js';
import { asEnvironment, createVaultStore, personaRefs, type VaultStore } from './store.js';
import type { PathfinderDb } from '@pathfinder/store';

/** Everything the CLI touches, injected so tests run it without a TTY or the real key. */
export interface CliIo {
  db: PathfinderDb;
  keyPath?: string;
  /** Repo root, for `check` (personas/<portal>/<persona>.yaml). */
  root: string;
  defaultEnv: string;
  out: (line: string) => void;
  err: (line: string) => void;
  /** A value from a hidden prompt (TTY) or the whole of stdin (`--stdin`). Never argv. */
  readSecret: (prompt: string, fromStdin: boolean) => Promise<string>;
}

const USAGE = `usage:
  pnpm vault set <portal> <REF> [--env e] [--stdin]
  pnpm vault list [<portal>] [--env e]
  pnpm vault delete <portal> <REF> [--env e]
  pnpm vault generate <portal> --login <REF>=<name> --password <REF> [--env e]
                      [--seed <file> --seed-user <id> [--seed-brand <brand>] [--iterations n]]
  pnpm vault check <portal> <persona> [--env e]
  pnpm vault import <portal> <file.csv> [--extends <mixin>] [--env e]   (= pnpm personas:import)
                    header: persona_id,login,password,<attribute columns…>; a list cell is a|b
  pnpm vault reveal <portal> <REF> [--env e] --yes-print-secret`;

function parse(argv: string[]): { pos: string[]; opt: Map<string, string | true> } {
  const pos: string[] = [];
  const opt = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      pos.push(a);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      opt.set(a.slice(2), next);
      i++;
    } else opt.set(a.slice(2), true);
  }
  return { pos, opt };
}

const str = (o: Map<string, string | true>, k: string): string | undefined => {
  const v = o.get(k);
  return typeof v === 'string' ? v : undefined;
};

interface SeedUser {
  id: string;
  brand: string;
  login: string;
  hash: string;
}

/** Upsert one user (hash only) into the proving ground's seed file; atomic write. */
export function upsertSeedUser(file: string, user: SeedUser): void {
  const doc: { users: SeedUser[] } & Record<string, unknown> = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : { users: [] };
  doc.users = [...(doc.users ?? []).filter((u) => u.id !== user.id), user].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/** Run one vault command. Returns the exit code (0 ok, 1 failure, 2 usage). */
export async function runVaultCli(argv: string[], io: CliIo): Promise<number> {
  const { pos, opt } = parse(argv);
  const [cmd, ...rest] = pos;
  const env = asEnvironmentSafe(str(opt, 'env') ?? io.defaultEnv, io);
  if (env === null) return 2;
  const store = (create: boolean): VaultStore =>
    createVaultStore(io.db, loadKey({ path: io.keyPath, create }));

  try {
    switch (cmd) {
      case 'set': {
        const [portal, ref] = rest;
        if (!portal || !ref) break;
        const s = store(true);
        const value = await io.readSecret(`value for ${ref}: `, opt.has('stdin'));
        await s.set(portal, env, ref, value);
        io.out(`stored ${ref} for ${portal} on ${env}`);
        return 0;
      }
      case 'list': {
        const rows = await store(false).list(rest[0]);
        const shown = rows.filter((r) => str(opt, 'env') === undefined || r.environment === env);
        if (shown.length === 0) io.out('no credentials');
        for (const r of shown)
          io.out(
            `${r.portal_id}\t${r.environment}\t${r.ref_name}\tkey ${r.key_id}\tcreated ${r.created_at}\tupdated ${r.updated_at}`,
          );
        return 0;
      }
      case 'delete': {
        const [portal, ref] = rest;
        if (!portal || !ref) break;
        const gone = await store(false).delete(portal, env, ref);
        if (!gone) {
          io.err(`no credential ${ref} for ${portal} on ${env}`);
          return 1;
        }
        io.out(`deleted ${ref} for ${portal} on ${env}`);
        return 0;
      }
      case 'generate': {
        const [portal] = rest;
        const loginOpt = str(opt, 'login');
        const passwordRef = str(opt, 'password');
        const eq = loginOpt?.indexOf('=') ?? -1;
        if (!portal || !loginOpt || eq < 1 || !passwordRef) break;
        const loginRef = loginOpt.slice(0, eq);
        const loginName = loginOpt.slice(eq + 1);
        const s = store(true);
        const password = generatePassword();
        await s.set(portal, env, loginRef, loginName);
        await s.set(portal, env, passwordRef, password);
        io.out(`generated ${passwordRef} and stored ${loginRef} for ${portal} on ${env}`);
        const seed = str(opt, 'seed');
        if (seed) {
          const id = str(opt, 'seed-user');
          const brand = str(opt, 'seed-brand') ?? /^proving-ground-(.+)$/.exec(portal)?.[1];
          if (!id || !brand) {
            io.err(
              '--seed needs --seed-user <id> (and --seed-brand for non proving-ground portals)',
            );
            return 2;
          }
          const iterations = Number(str(opt, 'iterations') ?? 600_000);
          upsertSeedUser(seed, {
            id,
            brand,
            login: loginName,
            hash: djangoPbkdf2(password, { iterations }),
          });
          io.out(`seeded ${id} (${brand}) into ${seed} (hash only)`);
        }
        return 0;
      }
      case 'check': {
        const [portal, persona] = rest;
        if (!portal || !persona) break;
        const p = loadPersona(`${io.root}/personas/${portal}/${persona}.yaml`, {
          fence: [`${io.root}/personas/_mixins`, `${io.root}/personas/${portal}`],
        });
        const s = store(false);
        const missing: string[] = [];
        for (const ref of Object.values(personaRefs(p.auth)))
          if (!(await s.has(portal, env, ref))) missing.push(ref);
        if (missing.length > 0) {
          io.err(`missing credential refs for ${portal} on ${env}: ${missing.join(', ')}`);
          return 1;
        }
        io.out('ok');
        return 0;
      }
      case 'import': {
        const [portal, file] = rest;
        if (!portal || !file) break;
        const imported = await importPersonas({
          root: io.root,
          portal,
          csv: readFileSync(file, 'utf8'),
          environment: env,
          extends: str(opt, 'extends'),
          store: store(true),
        });
        for (const p of imported)
          io.out(
            `${p.status} personas/${portal}/${p.id}.yaml (${p.refs.login}, ${p.refs.password})`,
          );
        const created = imported.filter((p) => p.status === 'created').length;
        io.out(`${created} created, ${imported.length - created} updated; credentials on ${env}`);
        return 0;
      }
      case 'reveal': {
        const [portal, ref] = rest;
        if (!portal || !ref) break;
        if (!opt.has('yes-print-secret')) {
          io.err('reveal prints a secret; add --yes-print-secret');
          return 2;
        }
        io.out(await store(false).get(portal, env, ref));
        return 0;
      }
    }
  } catch (e) {
    if (e instanceof VaultError) {
      io.err(e.message);
      return 1;
    }
    throw e;
  }
  io.err(USAGE);
  return 2;
}

function asEnvironmentSafe(value: string, io: CliIo) {
  try {
    return asEnvironment(value);
  } catch (e) {
    io.err((e as Error).message);
    return null;
  }
}
