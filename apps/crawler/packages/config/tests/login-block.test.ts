import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadEffectiveConfig, loadPortal } from '../src/index.js';
import { PORTAL_YAML, tmpTree } from './helpers.js';

const LOGIN = `login:
  url: /logowanie?next=/pulpit
  username: { label: "Login", css: "input[name=login]" }
  password: { placeholder: "Haslo" }
  submit: { role: button, name: "Zaloguj" }
  success: { url_not_matching: "/logowanie" }
  failure: { text: ["Nieprawidlowy login"] }
  expiry: { url_matching: "/logowanie", text: "Sesja wygasla" }
`;
const withLogin = (block = LOGIN) => `${PORTAL_YAML}${block}`;

const loadP = (yaml: string) => {
  const root = tmpTree({ 'portal.yaml': yaml });
  return loadPortal(join(root, 'portal.yaml'));
};
const errorOf = (fn: () => unknown): ConfigError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return e as ConfigError;
  }
  throw new Error('expected ConfigError');
};

describe('portal login block', () => {
  it('loads a valid block and defaults fields', () => {
    const p = loadP(withLogin());
    expect(p.login?.fields).toEqual({ username: 'login', password: 'password' });
    expect(p.login?.success.url_not_matching).toBe('/logowanie');
  });
  it('is optional', () => {
    expect(loadP(PORTAL_YAML).login).toBeUndefined();
  });
  it('accepts an absolute url and success by text', () => {
    const yaml = withLogin(LOGIN.replace('/logowanie?next=/pulpit', 'https://x.test/in')).replace(
      'success: { url_not_matching: "/logowanie" }',
      'success: { text: "Wyloguj" }',
    );
    expect(loadP(yaml).login?.url).toBe('https://x.test/in');
  });
  it.each([
    ['relative url without slash', LOGIN.replace('/logowanie?next=/pulpit', 'logowanie'), 'url'],
    [
      'username without locator',
      LOGIN.replace('username: { label: "Login", css: "input[name=login]" }', 'username: {}'),
      'login.username',
    ],
    [
      'password without locator',
      LOGIN.replace('password: { placeholder: "Haslo" }', 'password: {}'),
      'login.password',
    ],
    [
      'submit with role but no name',
      LOGIN.replace('submit: { role: button, name: "Zaloguj" }', 'submit: { role: button }'),
      'login.submit',
    ],
    [
      'success without url_not_matching or text',
      LOGIN.replace('success: { url_not_matching: "/logowanie" }', 'success: {}'),
      'login.success',
    ],
    [
      'empty expiry',
      LOGIN.replace('expiry: { url_matching: "/logowanie", text: "Sesja wygasla" }', 'expiry: {}'),
      'login.expiry',
    ],
    ['unknown key', `${LOGIN}  extra: 1\n`, 'extra'],
  ])('rejects %s', (_n, block, field) => {
    expect(errorOf(() => loadP(withLogin(block))).problems.join()).toContain(field);
  });
});

describe('persona and login cross-check', () => {
  const persona = (auth: string) =>
    `id: p\nauth: ${auth}\nmax_action_class: read\nviewport: { width: 1, height: 1 }\nlocale: pl-PL\n`;
  const effective = (portalYaml: string, personaYaml: string) => {
    const root = tmpTree({ 'portal.yaml': portalYaml, 'persona.yaml': personaYaml });
    return loadEffectiveConfig(join(root, 'portal.yaml'), join(root, 'persona.yaml'));
  };
  const creds = '{ login: "ref:PG_LOGIN", password: "ref:PG_PASSWORD" }';

  it('carries the login block into the effective config', () => {
    expect(effective(withLogin(), persona(creds)).portal.login?.url).toContain('/logowanie');
  });
  it('refuses refs on a portal without a login block', () => {
    expect(errorOf(() => effective(PORTAL_YAML, persona(creds))).problems).toEqual([
      'persona has credentials but portal has no login block',
    ]);
  });
  it('refuses a persona missing an auth key named by fields', () => {
    const e = errorOf(() =>
      effective(withLogin(), persona('{ login: "ref:PG_LOGIN", haslo: "ref:PG_PASSWORD" }')),
    );
    expect(e.problems.join()).toContain('"password"');
  });
  it('honours custom fields keys', () => {
    const yaml = withLogin(`${LOGIN}  fields: { username: user, password: pass }\n`);
    expect(effective(yaml, persona('{ user: "ref:A", pass: "ref:B" }')).persona.id).toBe('p');
  });
  it('allows a guest on a portal with a login block', () => {
    expect(effective(withLogin(), persona('none')).persona.auth).toBe('none');
  });
  it('allows a guest on a portal without a login block', () => {
    expect(effective(PORTAL_YAML, persona('none')).persona.auth).toBe('none');
  });
});
