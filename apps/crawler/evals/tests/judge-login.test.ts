import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultTokenFile, resolveJudgeLogin } from '../graders/model/login.js';
import { JudgeSetupError } from '../graders/model/setup-error.js';

const FAKE = 'sk-ant-test-key-not-real';
let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'judge-login-'));
});

const writeToken = (value: string, path = defaultTokenFile(home)) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, value);
  return path;
};
const linkLogin = () => {
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', '.credentials.json'), '{}');
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof JudgeSetupError ? e.code : 'other';
  }
  return 'none';
};

describe('resolveJudgeLogin', () => {
  it('uses the default token file, trimmed', () => {
    const path = writeToken(`${FAKE}\n`);
    expect(resolveJudgeLogin({}, home)).toEqual({ source: 'token-file', path, token: FAKE });
  });

  it('prefers MUDPUPPY_JUDGE_TOKEN_FILE', () => {
    writeToken('sk-ant-other-not-real');
    const path = writeToken(FAKE, join(home, 'elsewhere', 'token'));
    expect(resolveJudgeLogin({ MUDPUPPY_JUDGE_TOKEN_FILE: path }, home)).toMatchObject({
      path,
      token: FAKE,
    });
  });

  it('falls back to the linked login when there is no token file', () => {
    linkLogin();
    expect(resolveJudgeLogin({}, home)).toEqual({
      source: 'linked-login',
      credentials: join(home, '.claude', '.credentials.json'),
    });
  });

  it('refuses a quoted or space-broken token without falling back (F-02)', () => {
    linkLogin();
    writeToken(`'${FAKE}'`);
    expect(code(() => resolveJudgeLogin({}, home))).toBe('TOKEN_MALFORMED');
    writeToken('sk-ant-test-key not-real');
    expect(code(() => resolveJudgeLogin({}, home))).toBe('TOKEN_MALFORMED');
  });

  it('never puts the token value in the message', () => {
    expect.assertions(1);
    writeToken(`"${FAKE}"`);
    try {
      resolveJudgeLogin({}, home);
    } catch (e) {
      expect((e as Error).message).not.toContain('test-key-not-real');
    }
  });

  it('fails when an explicit token file is missing, or there is no login at all', () => {
    linkLogin();
    expect(
      code(() => resolveJudgeLogin({ MUDPUPPY_JUDGE_TOKEN_FILE: join(home, 'nope') }, home)),
    ).toBe('NO_LOGIN');
    expect(code(() => resolveJudgeLogin({}, mkdtempSync(join(tmpdir(), 'empty-'))))).toBe(
      'NO_LOGIN',
    );
  });
});
