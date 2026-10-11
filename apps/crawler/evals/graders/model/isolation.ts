/**
 * The isolation check (spec 017 FR-005a, data-model "Isolation check result"): what one real judge
 * call loaded, read from its `system/init` event. Claude Code's own built-in plugins, skills and
 * agents load even with an empty config (research R2) and are allowed; anything of the owner's
 * or the project's is a leak. The input-token bound catches leaked instructions (CLAUDE.md,
 * rules), which the init event does not list: the judge prompt alone is about 900 tokens.
 */
import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { CallInit, CallUsage } from './answer.js';

export const MAX_INPUT_TOKENS = 2000;

export interface IsolationCheck {
  check: string;
  ok: boolean;
  detail: string;
}

export interface Forbidden {
  skills: ReadonlySet<string>;
  agents: ReadonlySet<string>;
}

const list = (xs: readonly string[]) => (xs.length === 0 ? 'none' : xs.join(', '));

export function checkIsolation(
  init: CallInit | null,
  usage: CallUsage,
  configDir: string,
  forbidden: Forbidden,
): IsolationCheck[] {
  if (!init) return [{ check: 'init event', ok: false, detail: 'the call reported no init event' }];
  const userPlugins = init.plugins.filter((p) => !p.endsWith('@builtin'));
  const skills = init.skills.filter((s) => forbidden.skills.has(s));
  const agents = init.agents.filter((a) => forbidden.agents.has(a));
  const memory = init.memoryAuto ?? '';
  return [
    {
      check: 'tools',
      ok: init.tools.length === 1 && init.tools[0] === 'StructuredOutput',
      detail: list(init.tools),
    },
    { check: 'MCP servers', ok: init.mcpServers.length === 0, detail: list(init.mcpServers) },
    { check: 'plugins (built-in only)', ok: userPlugins.length === 0, detail: list(userPlugins) },
    { check: 'your or project skills', ok: skills.length === 0, detail: list(skills) },
    { check: 'your or project agents', ok: agents.length === 0, detail: list(agents) },
    {
      check: 'memory in the judge config folder',
      ok: memory.startsWith(configDir),
      detail: memory || 'none reported',
    },
    {
      check: `input tokens < ${MAX_INPUT_TOKENS}`,
      ok: usage.input_tokens < MAX_INPUT_TOKENS,
      detail: String(usage.input_tokens),
    },
  ];
}

/** Skill folders and agent files under `<dir>/.claude/`. */
function namesIn(dir: string, kind: 'skills' | 'agents'): string[] {
  const path = join(dir, '.claude', kind);
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((e) => {
    if (kind === 'skills') return e.isDirectory() ? [e.name] : [];
    return e.isFile() && e.name.endsWith('.md') ? [basename(e.name, '.md')] : [];
  });
}

/** The owner's (`~/.claude`) and the project's (`<repo>/.claude`) skills and agents. */
export function forbiddenNames(home: string, repoRoot: string): Forbidden {
  return {
    skills: new Set([...namesIn(home, 'skills'), ...namesIn(repoRoot, 'skills')]),
    agents: new Set([...namesIn(home, 'agents'), ...namesIn(repoRoot, 'agents')]),
  };
}
