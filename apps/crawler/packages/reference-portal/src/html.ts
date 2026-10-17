/** HTML building blocks: one layout and labelled form controls, so every page is uniform and accessible. */

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const NAV: readonly [string, string][] = [
  ['/', 'Start'],
  ['/ubezpieczenia/samochod', 'Samochód'],
  ['/ubezpieczenia/dom', 'Dom'],
  ['/ubezpieczenia/podroze', 'Podróże'],
  ['/porownanie', 'Porównanie'],
  ['/kalkulator/pojazd', 'Oblicz składkę'],
  ['/kontakt', 'Kontakt'],
  ['/faq', 'FAQ'],
  ['/slowniczek', 'Słowniczek'],
  ['/moje-polisy', 'Moje polisy'],
  ['/logowanie', 'Zaloguj się'],
];

export const BRAND = 'Towarzystwo Ubezpieczeń Wzorcowych';

/**
 * Calls every page makes that belong to no process (owner review 2026-10-17, point d): an icon
 * sprite and an analytics ping, both by fetch so the crawler records them, both GET so the portal
 * still receives no POST from a read-only crawl. Both read their answer: an unread fetch body
 * keeps the crawler's settle waiting until its timeout (spec 034 F-13).
 */
const NOISE_SCRIPT = `<script>
fetch('/static/ikony.svg').then(function (r) { return r.text(); }).then(function (svg) {
  var sprite = document.createElement('div');
  sprite.hidden = true;
  sprite.innerHTML = svg;
  document.body.appendChild(sprite);
}).catch(function () {});
fetch('/analytics/collect?e=page_view&p=' + encodeURIComponent(location.pathname)).then(function (r) { return r.json(); }).catch(function () {});
</script>`;

export function layout(title: string, body: string): string {
  const nav = NAV.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('');
  return `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | ${BRAND}</title></head>
<body>
<header><p><a href="/">${BRAND}</a></p>
<nav aria-label="Menu główne"><ul>${nav}</ul></nav></header>
<main>
<h1>${esc(title)}</h1>
${body}
</main>
<footer><p>${BRAND} S.A. — portal demonstracyjny. Wszystkie dane są fikcyjne.</p>
<nav aria-label="Stopka"><a href="/faq">FAQ</a> <a href="/slowniczek">Słowniczek</a> <a href="/kontakt">Kontakt</a></nav></footer>
${NOISE_SCRIPT}
</body>
</html>`;
}

export function alerts(errors: readonly string[]): string {
  if (errors.length === 0) return '';
  return `<div role="alert"><p>Popraw błędy w formularzu:</p><ul>${errors
    .map((e) => `<li>${esc(e)}</li>`)
    .join('')}</ul></div>`;
}

export interface InputOpts {
  id: string;
  label: string;
  type: string;
  value?: string;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  pattern?: string;
  maxlength?: number;
  hint?: string;
}

export function input(o: InputOpts): string {
  const attrs = [
    `id="${o.id}"`,
    `name="${o.id}"`,
    `type="${o.type}"`,
    o.value !== undefined && o.value !== '' ? `value="${esc(o.value)}"` : '',
    o.required ? 'required' : '',
    o.min !== undefined ? `min="${o.min}"` : '',
    o.max !== undefined ? `max="${o.max}"` : '',
    o.pattern ? `pattern="${esc(o.pattern)}"` : '',
    o.maxlength !== undefined ? `maxlength="${o.maxlength}"` : '',
    o.hint ? `aria-describedby="${o.id}-hint"` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const hint = o.hint ? `<small id="${o.id}-hint">${esc(o.hint)}</small>` : '';
  return `<p><label for="${o.id}">${esc(o.label)}</label> <input ${attrs}>${hint}</p>`;
}

export function textarea(o: {
  id: string;
  label: string;
  value?: string;
  required?: boolean;
  maxlength?: number;
}): string {
  return `<p><label for="${o.id}">${esc(o.label)}</label> <textarea id="${o.id}" name="${o.id}"${
    o.required ? ' required' : ''
  }${o.maxlength ? ` maxlength="${o.maxlength}"` : ''}>${esc(o.value ?? '')}</textarea></p>`;
}

export function select(o: {
  id: string;
  label: string;
  options: readonly [string, string][];
  value?: string;
  required?: boolean;
}): string {
  const opts = [['', '— wybierz —'] as [string, string], ...o.options]
    .map(
      ([v, l]) =>
        `<option value="${esc(v)}"${o.value === v && v !== '' ? ' selected' : ''}>${esc(l)}</option>`,
    )
    .join('');
  return `<p><label for="${o.id}">${esc(o.label)}</label> <select id="${o.id}" name="${o.id}"${
    o.required ? ' required' : ''
  }>${opts}</select></p>`;
}

export function checkbox(o: {
  id: string;
  label: string;
  checked?: boolean;
  required?: boolean;
  value?: string;
}): string {
  return `<p><input id="${o.id}" name="${o.id}" type="checkbox" value="${esc(o.value ?? 'tak')}"${
    o.checked ? ' checked' : ''
  }${o.required ? ' required' : ''}> <label for="${o.id}">${esc(o.label)}</label></p>`;
}

/** Carries earlier calculator steps forward as hidden fields (read-only GET flow). */
export function hidden(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
}

export function pln(amount: number): string {
  const [int, frac] = amount.toFixed(2).split('.');
  return `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${frac} zł`;
}
