/**
 * Robots Exclusion Protocol (RFC 9309) parser and matcher, pure (research §1, contracts/robots.md).
 * Fetching, caching and enforcement live in `crawler` (`robots-registry.ts`, the gates).
 */

export const DEFAULT_PRODUCT_TOKEN = 'PathfinderAI-Crawler';
export const ROBOTS_MAX_BYTES = 512_000;

export interface RobotsRule {
  allow: boolean;
  /** The pattern as written, used in `rule` texts. */
  pattern: string;
  /** Normalised pattern length in octets; the longest match wins. */
  length: number;
  regex: RegExp;
}

export interface RobotsGroup {
  /** User-agent values of the group, lower-cased product tokens. */
  agents: string[];
  rules: RobotsRule[];
  crawlDelay?: number;
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
  /** Lines that did not parse (no `key: value`, or a rule before any `User-agent`). */
  ignoredLines: number;
  /** True when the body was cut at `maxBytes`. */
  truncated: boolean;
}

export interface AppliedGroup {
  /** The matching `User-agent` value (`*` or the token); null when no group applies. */
  agent: string | null;
  rules: RobotsRule[];
  crawlDelay?: number;
}

export interface RobotsVerdict {
  allowed: boolean;
  /** The deciding line, e.g. `Disallow: *cHash*`; null when no rule matched. */
  rule: string | null;
}

/** The robots product token: the configured User-Agent up to the first `/` or whitespace. */
export function productToken(userAgent: string | undefined): string {
  const token = userAgent?.trim().split(/[/\s]/, 1)[0];
  return token ? token : DEFAULT_PRODUCT_TOKEN;
}

const UNRESERVED = /[A-Za-z0-9\-._~]/;

/**
 * Percent-encoding normalisation shared by URLs and patterns: unreserved octets are decoded, other
 * escapes upper-cased, and non-ASCII characters encoded as UTF-8 octets.
 */
function normalizeEncoding(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '%' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      const ch = String.fromCharCode(parseInt(s.slice(i + 1, i + 3), 16));
      out += UNRESERVED.test(ch) ? ch : `%${s.slice(i + 1, i + 3).toUpperCase()}`;
      i += 2;
    } else if (c.charCodeAt(0) > 0x7e) {
      const cp = s.codePointAt(i)!;
      const chr = String.fromCodePoint(cp);
      out += encodeURIComponent(chr);
      i += chr.length - 1;
    } else {
      out += c;
    }
  }
  return out;
}

/** The match target of a URL: path plus `?query`, no fragment, normalised. */
export function robotsTarget(url: string): string {
  let u: URL;
  try {
    u = new URL(url, 'https://placeholder.invalid');
  } catch {
    return normalizeEncoding(url);
  }
  return normalizeEncoding((u.pathname || '/') + u.search);
}

function compile(allow: boolean, raw: string): RobotsRule {
  const norm = normalizeEncoding(raw);
  const anchored = norm.endsWith('$');
  const body = anchored ? norm.slice(0, -1) : norm;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return {
    allow,
    pattern: raw,
    length: Buffer.byteLength(norm),
    regex: new RegExp(`^${source}${anchored ? '$' : ''}`),
  };
}

function cutBytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return { text, truncated: false };
  return { text: buf.subarray(0, maxBytes).toString('utf8'), truncated: true };
}

export function parseRobots(input: string, opts: { maxBytes?: number } = {}): ParsedRobots {
  const { text, truncated } = cutBytes(input, opts.maxBytes ?? ROBOTS_MAX_BYTES);
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let ignoredLines = 0;
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon <= 0) {
      ignoredLines++;
      continue;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      const agent = productToken(value).toLowerCase();
      if (current && lastWasAgent) current.agents.push(agent);
      else {
        current = { agents: [agent], rules: [] };
        groups.push(current);
      }
      lastWasAgent = true;
      continue;
    }
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key !== 'allow' && key !== 'disallow' && key !== 'crawl-delay') continue;
    lastWasAgent = false;
    if (!current) {
      ignoredLines++;
      continue;
    }
    if (key === 'crawl-delay') {
      const d = Number(value);
      if (Number.isFinite(d) && d >= 0) current.crawlDelay = d;
      else ignoredLines++;
      continue;
    }
    if (value === '') continue;
    current.rules.push(compile(key === 'allow', value));
  }
  return { groups, sitemaps, ignoredLines, truncated };
}

/** The crawler's own group(s), else the `*` group(s), merged (RFC 9309 §2.2.1). */
export function selectGroup(policy: ParsedRobots, token: string): AppliedGroup {
  const own = token.toLowerCase();
  for (const agent of [own, '*']) {
    const matching = policy.groups.filter((g) => g.agents.includes(agent));
    if (matching.length === 0) continue;
    const delays = matching.flatMap((g) => (g.crawlDelay === undefined ? [] : [g.crawlDelay]));
    return {
      agent,
      rules: matching.flatMap((g) => g.rules),
      ...(delays.length ? { crawlDelay: Math.max(...delays) } : {}),
    };
  }
  return { agent: null, rules: [] };
}

export function robotsVerdict(policy: ParsedRobots, token: string, url: string): RobotsVerdict {
  const target = robotsTarget(url);
  if (target === '/robots.txt') return { allowed: true, rule: null };
  let best: RobotsRule | null = null;
  for (const r of selectGroup(policy, token).rules) {
    if (!r.regex.test(target)) continue;
    if (!best || r.length > best.length || (r.length === best.length && r.allow && !best.allow))
      best = r;
  }
  if (!best) return { allowed: true, rule: null };
  return { allowed: best.allow, rule: `${best.allow ? 'Allow' : 'Disallow'}: ${best.pattern}` };
}
