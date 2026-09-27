import { maskText } from '../pii.js';

/** A URL as the trace stores it: never the raw string, never query values (research §7). */
export interface ShapedUrl {
  origin: string | null;
  route: string;
  query_keys: string[];
}

export function shapeUrl(url: string, templateFor?: (url: string) => string): ShapedUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { origin: null, route: '<unparseable>', query_keys: [] };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { origin: null, route: `<${parsed.protocol.slice(0, -1)}>`, query_keys: [] };
  }
  let route = parsed.pathname;
  if (templateFor) {
    try {
      route = templateFor(url);
    } catch {
      // keep the pathname
    }
  }
  const keys = [...new Set(parsed.searchParams.keys())].map(maskText).sort();
  return { origin: parsed.origin, route: maskText(route), query_keys: keys };
}
