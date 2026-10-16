// Small response helpers shared by the scars: HTML pages, JSON, redirects, plain statuses.

import type { ServerResponse } from 'node:http';

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export { esc };

/** A complete HTML document; `head` goes into `<head>` (styles, scripts). */
export function page(title: string, body: string, head = '', lang = 'en'): string {
  return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><title>${esc(title)}</title>${head}</head>
<body>
<header><a href="/">Scar maker</a></header>
<main>
<h1>${esc(title)}</h1>
${body}
</main>
</body>
</html>`;
}

export function html(res: ServerResponse, body: string, status = 200, headers = {}): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    ...headers,
  });
  res.end(body);
}

export function json(res: ServerResponse, value: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
}

export function redirect(res: ServerResponse, location: string, status = 302, headers = {}): void {
  res.writeHead(status, { location, ...headers });
  res.end();
}

export function text(res: ServerResponse, body: string, status = 200, type = 'text/plain'): void {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8` });
  res.end(body);
}
