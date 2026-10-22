/**
 * Which login the judge uses (spec 017 research R3). The judge's config folder is empty, so it
 * needs its own: a `claude setup-token` token from a file, else a link to the owner's login.
 * The token goes to the judge's child process only, never to the owner's shell: a global
 * `CLAUDE_CODE_OAUTH_TOKEN` would outrank every Claude session's own login.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { JudgeSetupError } from './setup-error.js';

export type JudgeLogin =
  | { source: 'token-file'; path: string; token: string }
  | { source: 'linked-login'; credentials: string };

const TOKEN = /^sk-ant-[A-Za-z0-9_-]+$/;

export const defaultTokenFile = (home: string) => join(home, '.config', 'mudpuppy', 'judge-token');

/** `MUDPUPPY_JUDGE_TOKEN_FILE` → `~/.config/mudpuppy/judge-token` → `~/.claude/.credentials.json`. */
export function resolveJudgeLogin(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): JudgeLogin {
  const path = env.MUDPUPPY_JUDGE_TOKEN_FILE ?? defaultTokenFile(home);
  if (existsSync(path)) return { source: 'token-file', path, token: readToken(path) };
  if (env.MUDPUPPY_JUDGE_TOKEN_FILE)
    throw new JudgeSetupError(
      'NO_LOGIN',
      `MUDPUPPY_JUDGE_TOKEN_FILE points to ${path}, which does not exist`,
    );
  const credentials = join(home, '.claude', '.credentials.json');
  if (existsSync(credentials)) return { source: 'linked-login', credentials };
  throw new JudgeSetupError(
    'NO_LOGIN',
    `no judge login: put a "claude setup-token" token in ${path}, or log in with "claude"`,
  );
}

/** Never prints the value; findings F-02: quoted and clipped tokens only failed at the first call. */
function readToken(path: string): string {
  const token = readFileSync(path, 'utf8').trim();
  if (!TOKEN.test(token))
    throw new JudgeSetupError(
      'TOKEN_MALFORMED',
      `the judge token in ${path} is not one line of the form sk-ant-… (no quotes, no spaces); ` +
        'save the token from "claude setup-token" again',
    );
  return token;
}

export function describeLogin(login: JudgeLogin): string {
  return login.source === 'token-file'
    ? `token file ${login.path}`
    : `your Claude login (${login.credentials}), linked`;
}
