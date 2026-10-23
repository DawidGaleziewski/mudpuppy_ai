import { layout } from '../html.js';

/**
 * The customer area (spec 046 FR-001, R-88): two test customers who can log in, so personas and
 * their variants have a logged-in part of the portal to differ on. The passwords are obviously fake
 * (this is a local test server); a login is a `sesja` cookie with the customer's login.
 */
export interface Account {
  login: string;
  password: string;
  name: string;
  /** What scenario persona-variant decides on: only `premium` sees the premium offer. */
  segment: 'standard' | 'premium';
  policies: readonly { number: string; product: string; until: string }[];
}

export const ACCOUNTS: readonly Account[] = [
  {
    login: 'jan.klient',
    password: 'test-pass-not-real',
    name: 'Jan Klient',
    segment: 'standard',
    policies: [{ number: 'RP/2025/0101', product: 'OC', until: '2026-02-10' }],
  },
  {
    login: 'anna.premium',
    password: 'test-pass-not-real-2',
    name: 'Anna Premium',
    segment: 'premium',
    policies: [{ number: 'RP/2025/0102', product: 'OC + Autocasco (AC)', until: '2026-02-01' }],
  },
];

export const SESSION_COOKIE = 'sesja';

/** The account a login and password open, if any. */
export const accountFor = (login: string, password: string): Account | undefined =>
  ACCOUNTS.find((a) => a.login === login && a.password === password);

/** The cookies of a request header, by name. */
export function cookiesOf(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** The logged-in account of a request, from its session cookie. */
export const sessionAccount = (cookies: Readonly<Record<string, string>>): Account | undefined =>
  ACCOUNTS.find((a) => a.login === cookies[SESSION_COOKIE]);

/** "Moje polisy" for a logged-in customer: the policies and the way to renew them. */
export function policiesPage(a: Account): string {
  const rows = a.policies
    .map((p) => `<tr><th scope="row">${p.number}</th><td>${p.product}</td><td>${p.until}</td></tr>`)
    .join('\n');
  return layout(
    'Moje polisy',
    `<p>Zalogowano jako ${a.name}.</p>
<table><caption>Twoje polisy</caption>
<thead><tr><th scope="col">Numer polisy</th><th scope="col">Produkt</th><th scope="col">Ważna do</th></tr></thead>
<tbody>
${rows}
</tbody></table>
<p><a href="/moje-polisy/przedluz">Przedłuż polisę</a></p>`,
  );
}

/** The renewal form of a logged-in customer (renewing is not built: the form only shows). */
export function renewalPage(a: Account): string {
  const options = a.policies
    .map((p) => `<option value="${p.number}">${p.number} (${p.product})</option>`)
    .join('');
  return layout(
    'Przedłuż polisę',
    `<form aria-label="Przedłużenie polisy" method="get" action="/moje-polisy">
<p><label for="polisa">Polisa</label> <select id="polisa" name="polisa">${options}</select></p>
<p>Polisę można przedłużyć online w ciągu 30 dni przed końcem jej ważności.</p>
<p><button type="submit">Wróć do polis</button></p>
</form>`,
  );
}
