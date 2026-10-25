import { describe, expect, it } from 'vitest';
import { ACCOUNTS } from '../src/pages/account.js';
import { startReferencePortal, type ReferencePortal } from '../src/index.js';
import { HOST } from './helpers.js';

/** Spec 046 (R-88): the customer area, scenario persona-variant and scenario ab-test. */
async function withPortal(
  scenarios: Parameters<typeof startReferencePortal>[0]['scenarios'],
  fn: (p: ReferencePortal) => Promise<void>,
): Promise<void> {
  const p = await startReferencePortal({ host: HOST, port: 0, scenarios });
  try {
    await fn(p);
  } finally {
    await p.close();
  }
}

/** Log in and return the session cookie ("" when refused). */
async function login(p: ReferencePortal, user: string, pass: string): Promise<string> {
  const res = await fetch(`${p.url}/logowanie`, {
    method: 'POST',
    body: new URLSearchParams({ login: user, haslo: pass }),
    redirect: 'manual',
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

const page = async (p: ReferencePortal, path: string, cookie = '') =>
  (await fetch(`${p.url}${path}`, { headers: cookie ? { cookie } : {} })).text();

describe('customer area (spec 046 FR-001)', () => {
  it('a test customer logs in and sees the policies; a wrong password and a guest do not', async () => {
    await withPortal([], async (p) => {
      const [jan] = ACCOUNTS;
      expect(await login(p, jan!.login, 'wrong')).toBe('');
      const cookie = await login(p, jan!.login, jan!.password);
      expect(cookie).toBe(`sesja=${jan!.login}`);
      const policies = await page(p, '/moje-polisy', cookie);
      expect(policies).toContain('Zalogowano jako Jan Klient.');
      expect(policies).toContain('RP/2025/0101');
      expect(await page(p, '/moje-polisy/przedluz', cookie)).toContain('Przedłużenie polisy');
      expect(await page(p, '/moje-polisy')).toContain('Zaloguj się, aby zobaczyć tę stronę.');
    });
  });
});

describe('scenario persona-variant (spec 046 FR-002)', () => {
  it('only the premium customer sees the premium offer, and only with the scenario on', async () => {
    const offer = 'Oferta dla klientów premium';
    await withPortal(['persona-variant'], async (p) => {
      const [jan, anna] = ACCOUNTS;
      const standard = await page(p, '/moje-polisy', await login(p, jan!.login, jan!.password));
      const premium = await page(p, '/moje-polisy', await login(p, anna!.login, anna!.password));
      expect(standard).not.toContain(offer);
      expect(premium).toContain(offer);
    });
    await withPortal([], async (p) => {
      const [, anna] = ACCOUNTS;
      expect(
        await page(p, '/moje-polisy', await login(p, anna!.login, anna!.password)),
      ).not.toContain(offer);
    });
  });
});

describe('scenario ab-test (spec 046 FR-003)', () => {
  it('gives new sessions the arms in turn and keeps a session on its arm', async () => {
    await withPortal(['ab-test'], async (p) => {
      const first = await fetch(`${p.url}/`);
      const second = await fetch(`${p.url}/`);
      expect(first.headers.get('set-cookie')).toMatch(/^ab_baner=A/);
      expect(second.headers.get('set-cookie')).toMatch(/^ab_baner=B/);
      expect(await first.text()).toContain('Nowość:');
      expect(await second.text()).toContain('Promocja:');
      // robots.txt and assets get no arm, so they do not shift the turn
      await fetch(`${p.url}/robots.txt`);
      const kept = await fetch(`${p.url}/`, { headers: { cookie: 'ab_baner=B' } });
      expect(kept.headers.get('set-cookie')).toBeNull();
      expect(await kept.text()).toContain('Promocja:');
      expect((await fetch(`${p.url}/`)).headers.get('set-cookie')).toMatch(/^ab_baner=A/);
    });
  });

  it('shows no banner without the scenario', async () => {
    await withPortal([], async (p) => {
      const res = await fetch(`${p.url}/`);
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(await res.text()).not.toContain('role="note"');
    });
  });
});

describe('scenario overlapping-rule (spec 080 FR-005)', () => {
  const review = 'ręcznej weryfikacji';
  it("draws every third standard customer's Moje polisy for review, never the premium one's", async () => {
    await withPortal(['overlapping-rule'], async (p) => {
      const [jan, anna] = ACCOUNTS;
      const standard = await login(p, jan!.login, jan!.password);
      const premium = await login(p, anna!.login, anna!.password);
      const loads: boolean[] = [];
      for (let i = 0; i < 6; i++)
        loads.push((await page(p, '/moje-polisy', standard)).includes(review));
      expect(loads).toEqual([false, false, true, false, false, true]);
      const drawn = await page(p, '/moje-polisy', standard); // 7th: policies again
      expect(drawn).toContain('Zalogowano jako Jan Klient.');
      for (let i = 0; i < 3; i++)
        expect(await page(p, '/moje-polisy', premium)).not.toContain(review);
    });
  });

  it('keeps the login message on the review page and draws nothing without the scenario', async () => {
    await withPortal(['overlapping-rule'], async (p) => {
      const [jan] = ACCOUNTS;
      const cookie = await login(p, jan!.login, jan!.password);
      await page(p, '/moje-polisy', cookie);
      await page(p, '/moje-polisy', cookie);
      const third = await page(p, '/moje-polisy', cookie);
      expect(third).toContain(review);
      expect(third).toContain('Zalogowano jako Jan Klient.');
      expect(third).toContain('RP/2025/0101');
    });
    await withPortal([], async (p) => {
      const [jan] = ACCOUNTS;
      const cookie = await login(p, jan!.login, jan!.password);
      for (let i = 0; i < 3; i++)
        expect(await page(p, '/moje-polisy', cookie)).not.toContain(review);
    });
  });
});
