import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReferencePortal } from '../src/index.js';
import { ageOn, premium, travelDays } from '../src/rules.js';
import {
  DRIVER,
  OPTIONS,
  TRAVEL,
  VEHICLE,
  controlFor,
  fetchText,
  qs,
  start,
  text,
} from './helpers.js';

let portal: ReferencePortal;
beforeAll(async () => {
  portal = await start();
});
afterAll(() => portal.close());
beforeEach(() => portal.resetState());

const get = (path: string) => fetchText(portal, path);
const post = (path: string, body: Record<string, string>) =>
  fetchText(portal, path, { method: 'POST', body });

describe('rules (pure)', () => {
  it('age is counted in full years on the fixed day', () => {
    expect(ageOn('2008-01-15')).toBe(18);
    expect(ageOn('2008-01-16')).toBe(17);
    expect(ageOn('1950-01-16')).toBe(75);
    expect(ageOn('1950-01-15')).toBe(76);
  });

  it('premium: factors, no-claims, code and assistance', () => {
    const r = premium({
      scope: 'oc_ac',
      age: 40,
      engineCc: 1600,
      noClaimsYears: 6,
      assistance: true,
      discountCode: 'WIOSNA10',
    });
    expect(r).toMatchObject({
      base: 2000,
      ageFactor: 1,
      engineFactor: 1,
      noClaimsDiscount: 200,
      codeDiscount: 180,
      assistance: 99,
      total: 1719,
    });
    const young = premium({
      scope: 'oc',
      age: 20,
      engineCc: 2500,
      noClaimsYears: 0,
      assistance: false,
      discountCode: 'LATO20',
    });
    expect(young.total).toBe(1500); // 800 × 1.5 × 1.25, inactive code gives nothing
    expect(young.codeMessage).toBe('Kod rabatowy nie jest aktywny');
  });

  it('travel days include both ends', () => {
    expect(travelDays('2026-02-01', '2026-02-10')).toBe(10);
  });
});

describe('calculator flow (read-only GET steps)', () => {
  it('valid steps redirect forward carrying earlier answers', async () => {
    const s1 = await get(`/kalkulator/pojazd?krok=1&${qs(VEHICLE)}`);
    expect(s1.status).toBe(303);
    expect(s1.location).toBe(`/kalkulator/kierowca?${qs(VEHICLE)}`);
    const s2 = await get(`/kalkulator/kierowca?krok=2&${qs({ ...VEHICLE, ...DRIVER })}`);
    expect(s2.location).toBe(`/kalkulator/opcje?${qs({ ...VEHICLE, ...DRIVER })}`);
    const s3 = await get(`/kalkulator/opcje?krok=3&${qs({ ...VEHICLE, ...DRIVER, ...OPTIONS })}`);
    expect(s3.location).toBe(`/kalkulator/wynik?${qs({ ...VEHICLE, ...DRIVER, ...OPTIONS })}`);
  });

  it('shows validation messages with role="alert"', async () => {
    const r = await get(
      `/kalkulator/pojazd?krok=1&${qs({ ...VEHICLE, rok_produkcji: '1985', kod_pocztowy: '00950' })}`,
    );
    expect(r.status).toBe(200);
    expect(r.text).toContain('role="alert"');
    expect(text(r.text)).toContain('Rok produkcji musi być z przedziału 1990–2026.');
    expect(text(r.text)).toContain('Kod pocztowy musi mieć format NN-NNN.');
    const old = await get(
      `/kalkulator/kierowca?krok=2&${qs({ ...VEHICLE, ...DRIVER, data_urodzenia: '1950-01-15' })}`,
    );
    expect(text(old.text)).toContain('Wiek kierowcy musi wynosić od 18 do 75 lat.');
  });

  it('Dalej is disabled until both consents are given', async () => {
    const r = await get(`/kalkulator/kierowca?${qs(VEHICLE)}`);
    expect(r.text).toContain('<button type="submit" disabled>Dalej</button>');
    const noConsent = await get(
      `/kalkulator/kierowca?krok=2&${qs({ ...VEHICLE, ...DRIVER, zgoda_owu: '' })}`,
    );
    expect(text(noConsent.text)).toContain('Wymagane są obie zgody.');
  });

  it('AC is disabled for vehicles of 15 years or more', async () => {
    const young = await get(`/kalkulator/opcje?${qs({ ...VEHICLE, ...DRIVER })}`);
    expect('disabled' in controlFor(young.text, 'OC + Autocasco (AC)')!.attrs).toBe(false);
    const old = await get(
      `/kalkulator/opcje?${qs({ ...VEHICLE, rok_produkcji: '2011', ...DRIVER })}`,
    );
    expect('disabled' in controlFor(old.text, 'OC + Autocasco (AC)')!.attrs).toBe(true);
    const forced = await get(
      `/kalkulator/opcje?krok=3&${qs({ ...VEHICLE, rok_produkcji: '2011', ...DRIVER, zakres: 'oc_ac' })}`,
    );
    expect(text(forced.text)).toContain('AC dostępne tylko dla pojazdów młodszych niż 15 lat.');
  });

  it('discount code format is validated', async () => {
    const r = await get(
      `/kalkulator/opcje?krok=3&${qs({ ...VEHICLE, ...DRIVER, zakres: 'oc', kod_rabatowy: 'wiosna' })}`,
    );
    expect(text(r.text)).toContain('Kod rabatowy musi składać się z wielkich liter i dwóch cyfr');
  });

  it('result page shows the breakdown and a POST purchase form', async () => {
    const r = await get(`/kalkulator/wynik?${qs({ ...VEHICLE, ...DRIVER, ...OPTIONS })}`);
    const t = text(r.text);
    expect(t).toContain('Składka łączna 1 719,00 zł');
    expect(t).toContain('Kod rabatowy WIOSNA10 przyjęty.');
    expect(r.text).toContain(
      '<form aria-label="Zakup polisy" method="post" action="/kalkulator/zakup">',
    );
  });

  it('a step without earlier answers asks for them', async () => {
    const r = await get('/kalkulator/wynik');
    expect(text(r.text)).toContain('Najpierw uzupełnij dane pojazdu.');
  });
});

describe('state-changing POSTs', () => {
  it('Kup polisę records a purchase; resetState clears it', async () => {
    const r = await post('/kalkulator/zakup', { ...VEHICLE, ...DRIVER, ...OPTIONS });
    expect(text(r.text)).toContain('Numer wniosku: RP/2026/0001');
    expect(portal.state.purchases).toHaveLength(1);
    portal.resetState();
    expect(portal.state.purchases).toHaveLength(0);
    expect(portal.requests).toHaveLength(0);
  });

  it('contact needs a phone or an e-mail, then redirects', async () => {
    const base = { imie: 'Jan', temat: 'oferta', wiadomosc: 'Proszę o ofertę.' };
    const bad = await post('/kontakt', base);
    expect(text(bad.text)).toContain('Podaj telefon lub e-mail.');
    expect(portal.state.contactRequests).toHaveLength(0);
    const ok = await post('/kontakt', { ...base, telefon: '600 000 000' });
    expect(ok.status).toBe(303);
    expect(ok.location).toBe('/kontakt/dziekujemy');
    expect(portal.state.contactRequests).toHaveLength(1);
  });

  it('login never succeeds for a guest', async () => {
    const r = await post('/logowanie', { login: 'x', haslo: 'y' });
    expect(text(r.text)).toContain('Nieprawidłowy login lub hasło.');
  });

  it('logs every request with its method', async () => {
    await get('/');
    await post('/logowanie', { login: 'x', haslo: 'y' });
    expect(portal.requests.map((q) => q.method)).toEqual(['GET', 'POST']);
  });
});

describe('travel, comparison and other pages', () => {
  it('travel over 90 days is refused, a valid trip is priced', async () => {
    const long = await get(
      `/ubezpieczenia/podroze/wynik?${qs({ ...TRAVEL, data_powrotu: '2026-05-10' })}`,
    );
    expect(text(long.text)).toContain('Maksymalny okres ubezpieczenia to 90 dni.');
    const past = await get(
      `/ubezpieczenia/podroze/wynik?${qs({ ...TRAVEL, data_wyjazdu: '2026-01-10' })}`,
    );
    expect(text(past.text)).toContain('Data wyjazdu nie może być wcześniejsza niż dziś.');
    const ok = await get(`/ubezpieczenia/podroze/wynik?${qs(TRAVEL)}`);
    expect(text(ok.text)).toContain('Składka łączna 240,00 zł'); // 10 days × 12 zł × 2
  });

  it('comparison needs two different products', async () => {
    const same = await get('/porownanie/wynik?produkt_1=oc&produkt_2=oc');
    expect(text(same.text)).toContain('Wybierz dwa różne produkty.');
  });

  it('login-only pages show the wall, unknown pages 404', async () => {
    expect(text((await get('/moje-polisy/przedluz')).text)).toContain(
      'Zaloguj się, aby zobaczyć tę stronę.',
    );
    expect((await get('/nie-ma-takiej-strony')).status).toBe(404);
  });

  it('pages are deterministic', async () => {
    const a = await get(`/kalkulator/wynik?${qs({ ...VEHICLE, ...DRIVER, ...OPTIONS })}`);
    const b = await get(`/kalkulator/wynik?${qs({ ...VEHICLE, ...DRIVER, ...OPTIONS })}`);
    expect(a.text).toBe(b.text);
  });
});
