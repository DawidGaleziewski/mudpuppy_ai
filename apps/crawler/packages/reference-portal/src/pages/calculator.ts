import { alerts, checkbox, esc, hidden, input, layout, pln, select } from '../html.js';
import {
  CURRENT_YEAR,
  DISCOUNT_CODE_PATTERN,
  MAX_DRIVER_AGE,
  MIN_DRIVER_AGE,
  MIN_PRODUCTION_YEAR,
  POSTCODE_PATTERN,
  acAllowed,
  ageOn,
  birthDateBounds,
  isIsoDate,
  matches,
  premium,
} from '../rules.js';

/**
 * The OC/AC premium calculator: three read-only GET steps that carry earlier answers in the query
 * string, a result page, and a POST "Kup polisę" that changes state. Each step submits to itself with
 * `krok=1`; valid input redirects (303) to the next step, invalid input re-renders with role="alert".
 */

export type Params = Record<string, string>;
export type PageResult = { status: number; html: string } | { redirect: string };

const MAKES: [string, string][] = [
  ['toyota', 'Toyota'],
  ['skoda', 'Skoda'],
  ['volkswagen', 'Volkswagen'],
  ['fiat', 'Fiat'],
  ['inna', 'Inna'],
];

const VEHICLE = ['marka', 'model', 'rok_produkcji', 'pojemnosc', 'kod_pocztowy'] as const;
const DRIVER = ['data_urodzenia', 'rok_prawa_jazdy', 'lata_bezszkodowe', 'zgoda_dane', 'zgoda_owu'] as const;
const OPTIONS = ['zakres', 'assistance', 'kod_rabatowy'] as const;

function pick(p: Params, keys: readonly string[]): Params {
  const out: Params = {};
  for (const k of keys) if (p[k] !== undefined && p[k] !== '') out[k] = p[k]!;
  return out;
}

function query(p: Params): string {
  return new URLSearchParams(p).toString();
}

function int(v: string | undefined): number | null {
  return v !== undefined && /^\d+$/.test(v) ? Number(v) : null;
}

export function vehicleErrors(p: Params): string[] {
  const e: string[] = [];
  if (!p.marka) e.push('Wybierz markę pojazdu.');
  if (!p.model) e.push('Podaj model pojazdu.');
  const year = int(p.rok_produkcji);
  if (year === null || year < MIN_PRODUCTION_YEAR || year > CURRENT_YEAR)
    e.push(`Rok produkcji musi być z przedziału ${MIN_PRODUCTION_YEAR}–${CURRENT_YEAR}.`);
  const cc = int(p.pojemnosc);
  if (cc === null || cc < 50 || cc > 8000) e.push('Pojemność silnika musi wynosić od 50 do 8000 cm³.');
  if (!p.kod_pocztowy || !matches(POSTCODE_PATTERN, p.kod_pocztowy))
    e.push('Kod pocztowy musi mieć format NN-NNN.');
  return e;
}

export function driverErrors(p: Params): string[] {
  const e: string[] = [];
  if (!p.data_urodzenia || !isIsoDate(p.data_urodzenia)) e.push('Podaj datę urodzenia.');
  else {
    const age = ageOn(p.data_urodzenia);
    if (age < MIN_DRIVER_AGE || age > MAX_DRIVER_AGE)
      e.push(`Wiek kierowcy musi wynosić od ${MIN_DRIVER_AGE} do ${MAX_DRIVER_AGE} lat.`);
  }
  const licence = int(p.rok_prawa_jazdy);
  if (licence === null || licence < 1968 || licence > CURRENT_YEAR)
    e.push(`Rok uzyskania prawa jazdy musi być z przedziału 1968–${CURRENT_YEAR}.`);
  const nc = int(p.lata_bezszkodowe);
  if (nc === null || nc > 60) e.push('Lata bezszkodowej jazdy muszą wynosić od 0 do 60.');
  if (!p.zgoda_dane || !p.zgoda_owu) e.push('Wymagane są obie zgody.');
  return e;
}

export function optionErrors(p: Params): string[] {
  const e: string[] = [];
  if (p.zakres !== 'oc' && p.zakres !== 'oc_ac') e.push('Wybierz zakres ubezpieczenia.');
  if (p.zakres === 'oc_ac' && !acAllowed(Number(p.rok_produkcji)))
    e.push('AC dostępne tylko dla pojazdów młodszych niż 15 lat.');
  if (p.kod_rabatowy && !matches(DISCOUNT_CODE_PATTERN, p.kod_rabatowy))
    e.push('Kod rabatowy musi składać się z wielkich liter i dwóch cyfr, np. WIOSNA10.');
  return e;
}

function missingEarlier(stepName: string): PageResult {
  return {
    status: 200,
    html: layout(
      stepName,
      `<div role="alert"><p>Najpierw uzupełnij dane pojazdu.</p></div><p><a href="/kalkulator/pojazd">Przejdź do kroku 1</a></p>`,
    ),
  };
}

const steps = (n: number) =>
  `<nav aria-label="Kroki kalkulatora"><ol>${['Pojazd', 'Kierowca', 'Opcje', 'Wynik']
    .map((s, i) => `<li${i + 1 === n ? ' aria-current="step"' : ''}>${s}</li>`)
    .join('')}</ol></nav>`;

export function vehicleStep(p: Params): PageResult {
  const errors = p.krok === '1' ? vehicleErrors(p) : [];
  if (p.krok === '1' && errors.length === 0)
    return { redirect: `/kalkulator/kierowca?${query(pick(p, VEHICLE))}` };
  return {
    status: 200,
    html: layout(
      'Kalkulator OC/AC — dane pojazdu',
      `${steps(1)}${alerts(errors)}
<form aria-label="Dane pojazdu" method="get" action="/kalkulator/pojazd">
<input type="hidden" name="krok" value="1">
${select({ id: 'marka', label: 'Marka', options: MAKES, value: p.marka, required: true })}
${input({ id: 'model', label: 'Model', type: 'text', value: p.model, required: true, maxlength: 40 })}
${input({ id: 'rok_produkcji', label: 'Rok produkcji', type: 'number', value: p.rok_produkcji, required: true, min: MIN_PRODUCTION_YEAR, max: CURRENT_YEAR })}
${input({ id: 'pojemnosc', label: 'Pojemność silnika (cm³)', type: 'number', value: p.pojemnosc, required: true, min: 50, max: 8000 })}
${input({ id: 'kod_pocztowy', label: 'Kod pocztowy', type: 'text', value: p.kod_pocztowy, required: true, pattern: POSTCODE_PATTERN, hint: 'Format NN-NNN, np. 00-950' })}
<p><button type="submit">Dalej</button></p>
</form>`,
    ),
  };
}

const CONSENT_SCRIPT = `<script>
document.querySelectorAll('form[data-consents]').forEach(function (f) {
  var boxes = f.querySelectorAll('input[type=checkbox][required]');
  var next = f.querySelector('button[type=submit]');
  function sync() { next.disabled = !Array.prototype.every.call(boxes, function (b) { return b.checked; }); }
  boxes.forEach(function (b) { b.addEventListener('change', sync); });
  sync();
});
</script>`;

export function driverStep(p: Params): PageResult {
  if (vehicleErrors(p).length > 0) return missingEarlier('Kalkulator OC/AC — dane kierowcy');
  const errors = p.krok === '2' ? driverErrors(p) : [];
  if (p.krok === '2' && errors.length === 0)
    return { redirect: `/kalkulator/opcje?${query(pick(p, [...VEHICLE, ...DRIVER]))}` };
  const b = birthDateBounds();
  const consentsGiven = Boolean(p.zgoda_dane && p.zgoda_owu);
  return {
    status: 200,
    html: layout(
      'Kalkulator OC/AC — dane kierowcy',
      `${steps(2)}${alerts(errors)}
<form aria-label="Dane kierowcy" method="get" action="/kalkulator/kierowca" data-consents>
<input type="hidden" name="krok" value="2">${hidden(pick(p, VEHICLE))}
${input({ id: 'data_urodzenia', label: 'Data urodzenia', type: 'date', value: p.data_urodzenia, required: true, min: b.min, max: b.max, hint: `Kierowca musi mieć od ${MIN_DRIVER_AGE} do ${MAX_DRIVER_AGE} lat.` })}
${input({ id: 'rok_prawa_jazdy', label: 'Rok uzyskania prawa jazdy', type: 'number', value: p.rok_prawa_jazdy, required: true, min: 1968, max: CURRENT_YEAR })}
${input({ id: 'lata_bezszkodowe', label: 'Lata bezszkodowej jazdy', type: 'number', value: p.lata_bezszkodowe, required: true, min: 0, max: 60, hint: 'Od 5 lat bezszkodowej jazdy przysługuje zniżka.' })}
${checkbox({ id: 'zgoda_dane', label: 'Zgoda na przetwarzanie danych osobowych', checked: Boolean(p.zgoda_dane), required: true })}
${checkbox({ id: 'zgoda_owu', label: 'Oświadczam, że zapoznałem się z OWU', checked: Boolean(p.zgoda_owu), required: true })}
<p><button type="submit"${consentsGiven ? '' : ' disabled'}>Dalej</button></p>
<p>Przycisk Dalej jest aktywny po zaznaczeniu obu zgód.</p>
</form>${CONSENT_SCRIPT}`,
    ),
  };
}

export function optionsStep(p: Params): PageResult {
  if (vehicleErrors(p).length > 0) return missingEarlier('Kalkulator OC/AC — opcje');
  if (driverErrors(p).length > 0)
    return { redirect: `/kalkulator/kierowca?${query(pick(p, [...VEHICLE, ...DRIVER]))}` };
  const errors = p.krok === '3' ? optionErrors(p) : [];
  if (p.krok === '3' && errors.length === 0)
    return { redirect: `/kalkulator/wynik?${query(pick(p, [...VEHICLE, ...DRIVER, ...OPTIONS]))}` };
  const ac = acAllowed(Number(p.rok_produkcji));
  return {
    status: 200,
    html: layout(
      'Kalkulator OC/AC — opcje',
      `${steps(3)}${alerts(errors)}
<form aria-label="Opcje" method="get" action="/kalkulator/opcje">
<input type="hidden" name="krok" value="3">${hidden(pick(p, [...VEHICLE, ...DRIVER]))}
<fieldset><legend>Zakres</legend>
<p><input id="zakres_oc" name="zakres" type="radio" value="oc" required${p.zakres !== 'oc_ac' ? ' checked' : ''}> <label for="zakres_oc">Tylko OC</label></p>
<p><input id="zakres_oc_ac" name="zakres" type="radio" value="oc_ac" aria-describedby="ac-hint"${ac ? '' : ' disabled'}${p.zakres === 'oc_ac' && ac ? ' checked' : ''}> <label for="zakres_oc_ac">OC + Autocasco (AC)</label></p>
<small id="ac-hint">AC dostępne tylko dla pojazdów młodszych niż 15 lat.</small>
</fieldset>
${checkbox({ id: 'assistance', label: 'Assistance', checked: Boolean(p.assistance) })}
${input({ id: 'kod_rabatowy', label: 'Kod rabatowy', type: 'text', value: p.kod_rabatowy, pattern: DISCOUNT_CODE_PATTERN, maxlength: 12, hint: 'Wielkie litery i dwie cyfry, np. WIOSNA10' })}
<p><button type="submit">Oblicz składkę</button></p>
</form>`,
    ),
  };
}

export function resultPage(p: Params): PageResult {
  if (vehicleErrors(p).length > 0) return missingEarlier('Twoja składka');
  if (driverErrors(p).length > 0 || optionErrors(p).length > 0)
    return { redirect: `/kalkulator/opcje?${query(pick(p, [...VEHICLE, ...DRIVER, ...OPTIONS]))}` };
  const r = premium({
    scope: p.zakres === 'oc_ac' ? 'oc_ac' : 'oc',
    age: ageOn(p.data_urodzenia!),
    engineCc: Number(p.pojemnosc),
    noClaimsYears: Number(p.lata_bezszkodowe),
    assistance: Boolean(p.assistance),
    discountCode: p.kod_rabatowy ?? '',
  });
  const rows: [string, string][] = [
    ['Składka bazowa', pln(r.base)],
    ['Współczynnik wieku', r.ageFactor.toFixed(2).replace('.', ',')],
    ['Współczynnik silnika', r.engineFactor.toFixed(2).replace('.', ',')],
    ['Zniżka za bezszkodową jazdę', r.noClaimsDiscount ? `−${pln(r.noClaimsDiscount)}` : 'brak'],
    ['Kod rabatowy', r.codeDiscount ? `−${pln(r.codeDiscount)}` : 'brak'],
    ['Assistance', r.assistance ? pln(r.assistance) : 'brak'],
    ['Składka łączna', pln(r.total)],
  ];
  const msg = r.codeMessage ? `<p role="status">${esc(r.codeMessage)}.</p>` : '';
  return {
    status: 200,
    html: layout(
      'Twoja składka',
      `${steps(4)}${msg}
<table><caption>Wyliczenie składki rocznej</caption>
<tbody>${rows.map(([l, v]) => `<tr><th scope="row">${l}</th><td>${v}</td></tr>`).join('')}</tbody></table>
<form aria-label="Zakup polisy" method="post" action="/kalkulator/zakup">
${hidden(pick(p, [...VEHICLE, ...DRIVER, ...OPTIONS]))}
<p><button type="submit">Kup polisę</button></p>
</form>
<p><a href="/kalkulator/opcje?${esc(query(pick(p, [...VEHICLE, ...DRIVER, ...OPTIONS])))}">Zmień opcje</a></p>`,
    ),
  };
}

export function purchasePage(policyNumber: string, total: string): string {
  return layout(
    'Wniosek przyjęty',
    `<p role="status">Dziękujemy. Numer wniosku: <strong>${esc(policyNumber)}</strong>.</p>
<p>Składka do zapłaty: ${esc(total)}. Konsultant skontaktuje się z Tobą w sprawie płatności.</p>
<p><a href="/">Wróć na stronę główną</a></p>`,
  );
}

export function purchaseTotal(p: Params): string | null {
  if (vehicleErrors(p).length || driverErrors(p).length || optionErrors(p).length) return null;
  return pln(
    premium({
      scope: p.zakres === 'oc_ac' ? 'oc_ac' : 'oc',
      age: ageOn(p.data_urodzenia!),
      engineCc: Number(p.pojemnosc),
      noClaimsYears: Number(p.lata_bezszkodowe),
      assistance: Boolean(p.assistance),
      discountCode: p.kod_rabatowy ?? '',
    }).total,
  );
}
