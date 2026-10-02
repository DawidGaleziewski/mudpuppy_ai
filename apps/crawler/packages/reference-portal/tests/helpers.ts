import { startReferencePortal, type ReferencePortal } from '../src/index.js';

export const HOST = '127.0.0.1';

export function start(): Promise<ReferencePortal> {
  return startReferencePortal({ host: HOST, port: 0 });
}

export const VEHICLE = {
  marka: 'skoda',
  model: 'Octavia',
  rok_produkcji: '2018',
  pojemnosc: '1600',
  kod_pocztowy: '00-950',
};
export const DRIVER = {
  data_urodzenia: '1986-01-01',
  rok_prawa_jazdy: '2005',
  lata_bezszkodowe: '6',
  zgoda_dane: 'tak',
  zgoda_owu: 'tak',
};
export const OPTIONS = { zakres: 'oc_ac', assistance: 'tak', kod_rabatowy: 'WIOSNA10' };
export const TRAVEL = {
  region: 'europa',
  data_wyjazdu: '2026-02-01',
  data_powrotu: '2026-02-10',
  liczba_osob: '2',
};

export const qs = (p: Record<string, string>) => new URLSearchParams(p).toString();

/** A request that shows each route's own content (result pages need valid earlier answers). */
export const SAMPLE_REQUEST: Record<
  string,
  { method?: 'POST'; path: string; body?: Record<string, string> }
> = {
  '/kalkulator/kierowca': { path: `/kalkulator/kierowca?${qs(VEHICLE)}` },
  '/kalkulator/opcje': { path: `/kalkulator/opcje?${qs({ ...VEHICLE, ...DRIVER })}` },
  '/kalkulator/wynik': { path: `/kalkulator/wynik?${qs({ ...VEHICLE, ...DRIVER, ...OPTIONS })}` },
  '/kalkulator/zakup': {
    method: 'POST',
    path: '/kalkulator/zakup',
    body: { ...VEHICLE, ...DRIVER, ...OPTIONS },
  },
  '/ubezpieczenia/podroze/wynik': { path: `/ubezpieczenia/podroze/wynik?${qs(TRAVEL)}` },
  '/porownanie/wynik': { path: '/porownanie/wynik?produkt_1=oc&produkt_2=ac' },
};

export async function fetchText(
  portal: ReferencePortal,
  path: string,
  init: { method?: string; body?: Record<string, string> } = {},
): Promise<{ status: number; text: string; location: string | null }> {
  const res = await fetch(portal.url + path, {
    method: init.method ?? 'GET',
    redirect: 'manual',
    ...(init.body
      ? {
          body: new URLSearchParams(init.body).toString(),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        }
      : {}),
  });
  return { status: res.status, text: await res.text(), location: res.headers.get('location') };
}

export async function screenHtml(portal: ReferencePortal, route: string): Promise<string> {
  const sample = SAMPLE_REQUEST[route];
  const r = sample
    ? await fetchText(portal, sample.path, { method: sample.method, body: sample.body })
    : await fetchText(portal, route);
  if (r.status !== 200) throw new Error(`${route} answered ${r.status}`);
  return r.text;
}

/** The HTML text content of the first `<h1>`. */
export function h1(html: string): string {
  return decode(/<h1>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '');
}

export function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

/** Visible text of the page, tags stripped. */
export function text(html: string): string {
  return decode(html.replace(/<script[\s\S]*?<\/script>/g, ''));
}

export interface Control {
  tag: 'input' | 'select' | 'textarea';
  attrs: Record<string, string>;
  options: string[];
}

/** The control a `<label for>` with exactly this text points at. */
export function controlFor(html: string, label: string): Control | null {
  const labels = [...html.matchAll(/<label for="([^"]+)">([\s\S]*?)<\/label>/g)];
  const hit = labels.find((m) => decode(m[2]!) === label);
  if (!hit) return null;
  const id = hit[1]!;
  const m = new RegExp(`<(input|select|textarea)\\s([^>]*\\bid="${id}"[^>]*)>`).exec(html);
  if (!m) return null;
  const attrs: Record<string, string> = {};
  for (const a of m[2]!.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) attrs[a[1]!] = decode(a[2] ?? '');
  let options: string[] = [];
  if (m[1] === 'select') {
    const body = html.slice(m.index).split('</select>')[0]!;
    options = [...body.matchAll(/<option value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)]
      .filter((o) => o[1] !== '')
      .map((o) => decode(o[2]!));
  }
  return { tag: m[1] as Control['tag'], attrs, options };
}
