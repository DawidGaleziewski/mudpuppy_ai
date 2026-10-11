/**
 * One isolated judge call (spec 017 FR-005, research R1–R3): headless `claude -p` with no tools,
 * no MCP servers and the judge's own system prompt, from a fresh config folder and a fresh empty
 * working folder, so nothing of the owner's or the project's Claude setup (instructions, rules,
 * memory, skills, agents, hooks, plugins, sessions) reaches the judge. Both folders are removed
 * afterwards. Not unit-tested (it spawns the CLI); `pnpm eval:judge-check` exercises it for real.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCallOutput, VERDICT_SCHEMA, type CallOutput } from './answer.js';
import type { JudgeLogin } from './login.js';
import { JudgeSetupError } from './setup-error.js';

export interface CallRequest {
  model: string;
  system: string;
  user: string;
  login: JudgeLogin;
  timeoutMs?: number;
}

export interface CallResult extends CallOutput {
  durationMs: number;
  timedOut: boolean;
  /** The config folder the call ran with (already removed), for the isolation check. */
  configDir: string;
}

/** Credentials that would outrank the judge's own login, or point it at the owner's config. */
const STRIPPED = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CONFIG_DIR',
] as const;

function childEnv(login: JudgeLogin, configDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  for (const k of STRIPPED) if (k !== 'CLAUDE_CONFIG_DIR') delete env[k];
  if (login.source === 'token-file') env.CLAUDE_CODE_OAUTH_TOKEN = login.token;
  return env;
}

function cliArgs(r: CallRequest): string[] {
  return [
    ...['-p', r.user, '--model', r.model, '--system-prompt', r.system],
    ...['--tools', '', '--strict-mcp-config', '--no-session-persistence'],
    ...['--output-format', 'stream-json', '--verbose'],
    ...['--json-schema', JSON.stringify(VERDICT_SCHEMA)],
  ];
}

function run(args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number) {
  return new Promise<{ stdout: string; timedOut: boolean }>((resolve, reject) => {
    const child = spawn('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.resume();
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        e.code === 'ENOENT'
          ? new JudgeSetupError('CLI_MISSING', 'the "claude" command is not on PATH')
          : e,
      );
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve({ stdout, timedOut });
    });
  });
}

export async function callJudge(r: CallRequest): Promise<CallResult> {
  const configDir = mkdtempSync(join(tmpdir(), 'pf-judge-cfg-'));
  const cwd = mkdtempSync(join(tmpdir(), 'pf-judge-cwd-'));
  if (r.login.source === 'linked-login')
    symlinkSync(r.login.credentials, join(configDir, '.credentials.json'));
  const started = Date.now();
  try {
    const { stdout, timedOut } = await run(
      cliArgs(r),
      cwd,
      childEnv(r.login, configDir),
      r.timeoutMs ?? 120_000,
    );
    const out = parseCallOutput(stdout);
    // A rejected token must stop the run, never fall back silently (research R3).
    if (out.authError)
      throw new JudgeSetupError(
        'TOKEN_REJECTED',
        r.login.source === 'token-file'
          ? `the judge token in ${r.login.path} was rejected (${out.rawResult.slice(0, 120)}); ` +
              'save a new one from "claude setup-token", or delete the file to use your login'
          : `your Claude login was rejected (${out.rawResult.slice(0, 120)}); log in again with "claude"`,
      );
    return { ...out, durationMs: Date.now() - started, timedOut, configDir };
  } finally {
    rmSync(configDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
}
