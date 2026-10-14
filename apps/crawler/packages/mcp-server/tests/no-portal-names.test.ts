import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadPortal } from '@pathfinder/config';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));

function files(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

/** Portal ids and hosts from every portal file in the repo, plus the names the spec lists. */
function portalNames(): string[] {
  const names = new Set(['liveinsurer', 'marketsite', 'lokalnie', 'classifieds', 'forum']);
  const portals = join(REPO, 'portals');
  for (const id of readdirSync(portals)) {
    names.add(id.toLowerCase());
    const cfg = loadPortal(join(portals, id, 'portal.yaml'));
    names.add(new URL(cfg.base_url).hostname.replace(/^www\./, ''));
    for (const d of cfg.scope.allowed_domains) names.add(d.toLowerCase());
  }
  return [...names];
}

describe('no portal-specific names in code (spec 002 FR-021, SC-007)', () => {
  it('crawler, safety, MCP server, config and agent files never name a portal', () => {
    const sources = [
      // `gates` is test tooling whose job is to drive named test portals (spec 009 R-27).
      ...readdirSync(join(REPO, 'apps/crawler/packages'))
        .filter((pkg) => pkg !== 'gates')
        .flatMap((pkg) => {
          const src = join(REPO, 'apps/crawler/packages', pkg, 'src');
          try {
            return files(src, '.ts');
          } catch {
            return [];
          }
        }),
      ...files(join(REPO, '.claude/agents'), '.md'),
    ];
    expect(sources.length).toBeGreaterThan(20);
    const names = portalNames();
    expect(names.length).toBeGreaterThan(5);
    const hits: string[] = [];
    for (const f of sources) {
      const text = readFileSync(f, 'utf8').toLowerCase();
      for (const n of names) if (text.includes(n)) hits.push(`${f.slice(REPO.length)}: ${n}`);
    }
    expect(hits).toEqual([]);
  });
});
