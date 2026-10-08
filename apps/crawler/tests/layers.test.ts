import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Package layering (guideline G-07/G-08, spec 012 contracts/layers.md): every workspace package
 * belongs to one layer of `layers.json` and depends only on its own or lower layers.
 */
interface Layers {
  layers: { name: string; packages: string[] }[];
  exceptions: { from: string; to: string; reason: string; kind?: 'dev' }[];
}

const app = resolve(import.meta.dirname, '..');
const repo = resolve(app, '../..');
const config = JSON.parse(readFileSync(join(app, 'layers.json'), 'utf8')) as Layers;

interface Pkg {
  name: string;
  deps: { name: string; dev: boolean }[];
}

/** The crawler packages, apps/chat and packages/workflow: every TS workspace package. */
function workspacePackages(): Pkg[] {
  const dirs = [
    ...readdirSync(join(app, 'packages')).map((d) => join(app, 'packages', d)),
    join(repo, 'apps/chat'),
    ...readdirSync(join(repo, 'packages')).map((d) => join(repo, 'packages', d)),
  ].filter((d) => existsSync(join(d, 'package.json')));
  return dirs.map((d) => {
    const j = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')) as {
      name: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const short = (n: string) => n.replace(/^@pathfinder\//, '');
    const ws = (deps: Record<string, string> | undefined, dev: boolean) =>
      Object.keys(deps ?? {})
        .filter((n) => n.startsWith('@pathfinder/'))
        .map((n) => ({ name: short(n), dev }));
    return {
      name: short(j.name),
      deps: [...ws(j.dependencies, false), ...ws(j.devDependencies, true)],
    };
  });
}

const layerOf = new Map<string, { name: string; rank: number }>();
config.layers.forEach((l, rank) => {
  for (const p of l.packages) layerOf.set(p, { name: l.name, rank });
});

/** One message per broken rule, in the contract's wording. */
export function violations(pkgs: Pkg[], layers: Layers = config): string[] {
  const out: string[] = [];
  const excepted = (from: string, to: string, dev: boolean) =>
    layers.exceptions.some(
      (e) => e.from === from && e.to === to && (e.kind === 'dev' ? dev : true),
    );
  for (const p of pkgs) {
    const own = layerOf.get(p.name);
    if (!own) {
      out.push(`layer rule: ${p.name} is in no layer of layers.json — add it to exactly one`);
      continue;
    }
    for (const d of p.deps) {
      const dep = layerOf.get(d.name);
      if (!dep) continue; // reported for the dependency's own package
      const upward = dep.rank > own.rank;
      const kernelDep = own.name === 'kernel';
      if ((upward || kernelDep) && !excepted(p.name, d.name, d.dev))
        out.push(
          `layer rule: ${p.name} (${own.name}) may not depend on ${d.name} (${dep.name}) — move the shared part down or add an exception with a reason`,
        );
    }
  }
  return out;
}

describe('package layers (G-07, G-08)', () => {
  const pkgs = workspacePackages();

  it('every package is listed in exactly one layer', () => {
    const listed = config.layers.flatMap((l) => l.packages);
    expect(listed.filter((p, i) => listed.indexOf(p) !== i)).toEqual([]);
    expect(pkgs.map((p) => p.name).filter((n) => !layerOf.has(n))).toEqual([]);
  });

  it('no package depends on a higher layer; the kernel depends on no workspace package', () => {
    expect(violations(pkgs)).toEqual([]);
  });

  it('every exception names a reason', () => {
    for (const e of config.exceptions) expect(e.reason.trim()).not.toBe('');
  });

  it('reports an upward dependency in the contract wording', () => {
    expect(violations([{ name: 'core', deps: [{ name: 'store', dev: false }] }])).toEqual([
      'layer rule: core (kernel) may not depend on store (store) — move the shared part down or add an exception with a reason',
    ]);
    expect(violations([{ name: 'safety', deps: [{ name: 'crawler', dev: false }] }])).toHaveLength(
      1,
    );
    expect(violations([{ name: 'crawler', deps: [{ name: 'safety', dev: false }] }])).toEqual([]);
  });
});
