/**
 * The path (and query) an href points to, for telling the agent where an unnamed link goes
 * (spec 038, bank S11); a `javascript:` or other non-http scheme gives null.
 */
export function linkPath(href: string): string | null {
  try {
    const u = new URL(href, 'http://relative.invalid');
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}
