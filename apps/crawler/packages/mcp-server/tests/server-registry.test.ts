import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  liveServers,
  registerServer,
  strayWarnings,
  type ServerEntry,
} from '../src/services/server-registry.js';

const entry = (over: Partial<ServerEntry>): ServerEntry => ({
  pid: process.pid,
  environment: 'sandbox',
  codeRoot: '/repo/a',
  server: 'pathfinder',
  startedAt: '2026-10-16T00:00:00Z',
  ...over,
});

describe('server registry (spec 030 R-61, field GC-22)', () => {
  it('warns about a live server on another environment or from another checkout, not about a twin', () => {
    const me = entry({ pid: 1 });
    expect(strayWarnings(me, [entry({ pid: 2 })])).toEqual([]);
    expect(strayWarnings(me, [entry({ pid: 3, environment: 'acceptance' })])).toEqual([
      'pathfinder pid 3 serves environment "acceptance", this one "sandbox"',
    ]);
    expect(strayWarnings(me, [entry({ pid: 4, codeRoot: '/repo/b' })])[0]).toContain(
      'another checkout (/repo/b)',
    );
  });

  it('registers, lists live entries, drops dead ones and unregisters', () => {
    const data = mkdtempSync(join(tmpdir(), 'pf-servers-'));
    mkdirSync(join(data, 'servers'));
    // A pid that cannot be alive (beyond the default pid_max).
    writeFileSync(join(data, 'servers', '99999999.json'), JSON.stringify(entry({ pid: 99999999 })));
    const r = registerServer(data, entry({}));
    expect(r.warnings).toEqual([]);
    expect(liveServers(data).map((e) => e.pid)).toEqual([process.pid]);
    r.unregister();
    expect(liveServers(data)).toEqual([]);
  });
});
