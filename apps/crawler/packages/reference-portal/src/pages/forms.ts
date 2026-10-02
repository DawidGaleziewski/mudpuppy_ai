import { alerts, input, layout, pln, select, textarea } from '../html.js';
import { MAX_TRAVEL_DAYS, TODAY, TRAVEL_DAILY_RATE, isIsoDate, travelDays } from '../rules.js';
import type { PageResult, Params } from './calculator.js';

/** Travel quote, product comparison, contact form and the login-only area. */

const REGIONS: [string, string][] = [
  ['europa', 'Europa'],
  ['swiat', 'Świat'],
];

export function travelErrors(p: Params): string[] {
  const e: string[] = [];
  if (!p.region || !(p.region in TRAVEL_DAILY_RATE)) e.push('Wybierz kraj docelowy.');
  const okFrom = Boolean(p.data_wyjazdu && isIsoDate(p.data_wyjazdu));
  const okTo = Boolean(p.data_powrotu && isIsoDate(p.data_powrotu));
  if (!okFrom) e.push('Podaj datę wyjazdu.');
  else if (p.data_wyjazdu! < TODAY) e.push('Data wyjazdu nie może być wcześniejsza niż dziś.');
  if (!okTo) e.push('Podaj datę powrotu.');
  if (okFrom && okTo) {
    const days = travelDays(p.data_wyjazdu!, p.data_powrotu!);
    if (days < 1) e.push('Data powrotu nie może być wcześniejsza niż data wyjazdu.');
    else if (days > MAX_TRAVEL_DAYS)
      e.push(`Maksymalny okres ubezpieczenia to ${MAX_TRAVEL_DAYS} dni.`);
  }
  const n = /^\d+$/.test(p.liczba_osob ?? '') ? Number(p.liczba_osob) : 0;
  if (n < 1 || n > 9) e.push('Liczba podróżnych musi wynosić od 1 do 9.');
  return e;
}

function travelForm(p: Params, errors: string[]): string {
  return `${alerts(errors)}
<form aria-label="Kalkulator podróży" method="get" action="/ubezpieczenia/podroze/wynik">
${select({ id: 'region', label: 'Kraj docelowy', options: REGIONS, value: p.region, required: true })}
${input({ id: 'data_wyjazdu', label: 'Data wyjazdu', type: 'date', value: p.data_wyjazdu, required: true, min: TODAY })}
${input({ id: 'data_powrotu', label: 'Data powrotu', type: 'date', value: p.data_powrotu, required: true, min: TODAY, hint: `Maksymalnie ${MAX_TRAVEL_DAYS} dni.` })}
${input({ id: 'liczba_osob', label: 'Liczba podróżnych', type: 'number', value: p.liczba_osob, required: true, min: 1, max: 9 })}
<p><button type="submit">Oblicz składkę podróżną</button></p>
</form>`;
}

export function travelPage(): string {
  return layout(
    'Ubezpieczenie turystyczne',
    `<p>Koszty leczenia, bagaż i Assistance w podróży. Stawka dzienna: Europa ${TRAVEL_DAILY_RATE.europa} zł, Świat ${TRAVEL_DAILY_RATE.swiat} zł za osobę.</p>
${travelForm({}, [])}`,
  );
}

export function travelResult(p: Params): PageResult {
  const errors = travelErrors(p);
  if (errors.length > 0)
    return { status: 200, html: layout('Ubezpieczenie turystyczne', travelForm(p, errors)) };
  const days = travelDays(p.data_wyjazdu!, p.data_powrotu!);
  const rate = TRAVEL_DAILY_RATE[p.region!]!;
  const persons = Number(p.liczba_osob);
  return {
    status: 200,
    html: layout(
      'Twoja składka podróżna',
      `<table><caption>Wyliczenie składki podróżnej</caption><tbody>
<tr><th scope="row">Liczba dni</th><td>${days}</td></tr>
<tr><th scope="row">Stawka dzienna</th><td>${pln(rate)}</td></tr>
<tr><th scope="row">Liczba podróżnych</th><td>${persons}</td></tr>
<tr><th scope="row">Składka łączna</th><td>${pln(days * rate * persons)}</td></tr>
</tbody></table>
<p><a href="/ubezpieczenia/podroze">Zmień dane podróży</a></p>`,
    ),
  };
}

const PRODUCTS: Record<string, { name: string; scope: string; price: string; optional: string }> = {
  oc: { name: 'OC', scope: 'Szkody wyrządzone innym', price: 'od 800 zł', optional: 'nie' },
  ac: {
    name: 'Autocasco (AC)',
    scope: 'Szkody własne i kradzież',
    price: 'od 1200 zł',
    optional: 'tak',
  },
  assistance: {
    name: 'Assistance',
    scope: 'Holowanie i auto zastępcze',
    price: '99 zł',
    optional: 'tak',
  },
  nnw: {
    name: 'NNW',
    scope: 'Następstwa nieszczęśliwych wypadków',
    price: 'od 60 zł',
    optional: 'tak',
  },
};

function compareForm(p: Params, errors: string[]): string {
  const opts = Object.entries(PRODUCTS).map(([k, v]) => [k, v.name] as [string, string]);
  return `${alerts(errors)}
<form aria-label="Porównanie produktów" method="get" action="/porownanie/wynik">
${select({ id: 'produkt_1', label: 'Pierwszy produkt', options: opts, value: p.produkt_1, required: true })}
${select({ id: 'produkt_2', label: 'Drugi produkt', options: opts, value: p.produkt_2, required: true })}
<p><button type="submit">Porównaj</button></p>
</form>`;
}

export function comparePage(): string {
  return layout(
    'Porównanie produktów',
    `<p>Wybierz dwa różne produkty, aby je porównać.</p>${compareForm({}, [])}`,
  );
}

export function compareResult(p: Params): PageResult {
  const a = PRODUCTS[p.produkt_1 ?? ''];
  const b = PRODUCTS[p.produkt_2 ?? ''];
  const errors: string[] = [];
  if (!a || !b) errors.push('Wybierz oba produkty.');
  else if (p.produkt_1 === p.produkt_2) errors.push('Wybierz dwa różne produkty.');
  if (errors.length > 0 || !a || !b)
    return { status: 200, html: layout('Porównanie produktów', compareForm(p, errors)) };
  const row = (label: string, f: (x: NonNullable<typeof a>) => string) =>
    `<tr><th scope="row">${label}</th><td>${f(a)}</td><td>${f(b)}</td></tr>`;
  return {
    status: 200,
    html: layout(
      'Wynik porównania',
      `<table><caption>Porównanie produktów</caption>
<thead><tr><th scope="col">Cecha</th><th scope="col">${a.name}</th><th scope="col">${b.name}</th></tr></thead>
<tbody>${row('Zakres ochrony', (x) => x.scope)}${row('Cena', (x) => x.price)}${row('Dobrowolne', (x) => x.optional)}</tbody></table>
<p><a href="/porownanie">Porównaj inne produkty</a></p>`,
    ),
  };
}

const TOPICS: [string, string][] = [
  ['oferta', 'Oferta'],
  ['szkoda', 'Szkoda'],
  ['polisa', 'Moja polisa'],
  ['inne', 'Inne'],
];

export function contactErrors(p: Params): string[] {
  const e: string[] = [];
  if (!p.imie) e.push('Podaj imię.');
  if (!p.temat || !TOPICS.some(([k]) => k === p.temat)) e.push('Wybierz temat.');
  if (!p.wiadomosc) e.push('Wpisz wiadomość.');
  else if (p.wiadomosc.length > 1000) e.push('Wiadomość może mieć najwyżej 1000 znaków.');
  if (!p.telefon && !p.email) e.push('Podaj telefon lub e-mail.');
  if (p.telefon && !/^\+?[0-9 ]{9,15}$/.test(p.telefon))
    e.push('Numer telefonu jest nieprawidłowy.');
  if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email))
    e.push('Adres e-mail jest nieprawidłowy.');
  return e;
}

export function contactPage(p: Params = {}, errors: string[] = []): string {
  return layout(
    'Kontakt',
    `<p>Napisz do nas. Podaj telefon lub e-mail, abyśmy mogli odpowiedzieć.</p>${alerts(errors)}
<form aria-label="Formularz kontaktowy" method="post" action="/kontakt">
${input({ id: 'imie', label: 'Imię', type: 'text', value: p.imie, required: true, maxlength: 60 })}
${select({ id: 'temat', label: 'Temat', options: TOPICS, value: p.temat, required: true })}
${textarea({ id: 'wiadomosc', label: 'Wiadomość', value: p.wiadomosc, required: true, maxlength: 1000 })}
${input({ id: 'telefon', label: 'Telefon', type: 'tel', value: p.telefon, pattern: '\\+?[0-9 ]{9,15}' })}
${input({ id: 'email', label: 'E-mail', type: 'email', value: p.email })}
<p><button type="submit">Wyślij zapytanie</button></p>
</form>`,
  );
}

export function contactThanks(): string {
  return layout(
    'Dziękujemy za wiadomość',
    '<p role="status">Odpowiemy w ciągu 2 dni roboczych.</p><p><a href="/">Wróć na stronę główną</a></p>',
  );
}

export function loginPage(error = false): string {
  return layout(
    'Logowanie',
    `${error ? '<div role="alert"><p>Nieprawidłowy login lub hasło.</p></div>' : ''}
<form aria-label="Logowanie" method="post" action="/logowanie">
${input({ id: 'login', label: 'Login', type: 'text', required: true })}
${input({ id: 'haslo', label: 'Hasło', type: 'password', required: true })}
<p><button type="submit">Zaloguj się</button></p>
</form>`,
  );
}

/** Every page under /moje-polisy shows the same wall to a guest. */
export function loginWall(title: string): string {
  return layout(
    title,
    `<div role="alert"><p>Zaloguj się, aby zobaczyć tę stronę.</p></div><p><a href="/logowanie">Przejdź do logowania</a></p>`,
  );
}
