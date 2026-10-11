import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCallOutput } from '../graders/model/answer.js';
import { checkIsolation, forbiddenNames } from '../graders/model/isolation.js';

const fixture = (name: string) =>
  parseCallOutput(readFileSync(join(import.meta.dirname, 'fixtures', 'judge', name), 'utf8'));
const CONFIG = '/tmp/judge-cfg';
const forbidden = { skills: new Set(['create-eval', 'ba-practice']), agents: new Set(['crawler']) };

describe('checkIsolation', () => {
  it('passes a real isolated call (built-ins allowed)', () => {
    const out = fixture('pass.jsonl');
    const checks = checkIsolation(out.init, out.usage, CONFIG, forbidden);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(checks).toHaveLength(7);
  });

  it('fails every leak a non-isolated call would show', () => {
    const out = fixture('init-leaky.jsonl');
    const failed = checkIsolation(out.init, out.usage, CONFIG, forbidden)
      .filter((c) => !c.ok)
      .map((c) => c.check);
    expect(failed).toEqual([
      'tools',
      'MCP servers',
      'plugins (built-in only)',
      'your or project skills',
      'your or project agents',
      'memory in the judge config folder',
      'input tokens < 2000',
    ]);
  });

  it('fails when there is no init event', () => {
    const out = fixture('garbage.txt');
    expect(checkIsolation(out.init, out.usage, CONFIG, forbidden)).toEqual([
      { check: 'init event', ok: false, detail: 'the call reported no init event' },
    ]);
  });
});

it('forbiddenNames reads skill folders and agent files of home and repo', () => {
  const home = mkdtempSync(join(tmpdir(), 'iso-home-'));
  const repo = mkdtempSync(join(tmpdir(), 'iso-repo-'));
  mkdirSync(join(home, '.claude', 'skills', 'my-skill'), { recursive: true });
  mkdirSync(join(repo, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(repo, '.claude', 'agents', 'crawler.md'), '---\nname: crawler\n---\n');
  writeFileSync(join(repo, '.claude', 'agents', 'notes.txt'), '');
  const names = forbiddenNames(home, repo);
  expect([...names.skills]).toEqual(['my-skill']);
  expect([...names.agents]).toEqual(['crawler']);
});
