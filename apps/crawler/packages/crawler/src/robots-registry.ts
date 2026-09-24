import { createHash } from 'node:crypto';
import {
  ROBOTS_MAX_BYTES,
  domainAllowed,
  parseRobots,
  productToken,
  robotsVerdict,
  selectGroup,
  type AppliedGroup,
  type ParsedRobots,
} from '@pathfinder/safety';
import type { RateLimiter } from './rate-limiter.js';

export type RobotsOutcome = 'rules' | 'no_rules' | 'unreachable';

/** Everything one `robots.txt` fetch produced; persisted as evidence and a `robots_policies` row. */
export interface RobotsFetchRecord {
  host: string;
  source_url: string;
  /** After redirects; null when no response arrived. */
  final_url: string | null;
  redirects: string[];
  /** Null on a network error or timeout. */
  http_status: number | null;
  outcome: RobotsOutcome;
  /** Why the file counts as unreachable. */
  failure: string | null;
  fetched_at: string;
  product_token: string;
  /** The applied group's `User-agent` (`*` or the token); null unless `rules` matched a group. */
  group_used: string | null;
  crawl_delay_s: number | null;
  ignored_lines: number;
  truncated: boolean;
  sitemaps: string[];
  content_sha256: string | null;
  /** Raw text read (up to `maxBytes`); null when there was no body. */
  body: string | null;
}

export interface HostPolicy {
  host: string;
  outcome: RobotsOutcome;
  failure: string | null;
  policyId: string;
  evidenceRef: string;
  /** `now()` at fetch time, for the 24 h re-fetch. */
  fetchedAt: number;
  contentSha256: string | null;
  group: AppliedGroup;
  parsed: ParsedRobots | null;
}

export type RobotsCheck =
  | { state: 'allowed'; rule: string | null }
  | { state: 'refused'; rule: string; policyId: string }
  /** In scope, but the host's policy is not loaded yet: the request gate awaits `ensure` first. */
  | { state: 'unknown' }
  /** Not a crawl target (host outside `allowed_domains`, or not http/https): robots does not apply. */
  | { state: 'not_checked' };

export interface RobotsRegistryOptions {
  allowedDomains: readonly string[];
  /** The configured User-Agent (`rate_limit.user_agent`); the product token is derived from it. */
  userAgent: string | undefined;
  limiter: RateLimiter;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Store the fetch as evidence and a `robots_policies` row. */
  persist(record: RobotsFetchRecord): Promise<{ policyId: string; evidenceRef: string }>;
  /** A re-fetch found a different body; the new rules apply from now on (FR-006). */
  onRulesChanged?(host: string, previous: HostPolicy, next: HostPolicy): void | Promise<void>;
}

export interface RobotsRegistry {
  readonly productToken: string;
  /** True when `url` is a crawl target whose host robots governs. */
  inScope(url: string): boolean;
  /** Load (or re-load after 24 h) the policy of the URL's host; null for hosts robots does not govern. */
  ensure(url: string): Promise<HostPolicy | null>;
  /** Fetch a host's file again now (resume), reporting a change. */
  refresh(host: string): Promise<HostPolicy>;
  /** Synchronous verdict from the loaded policy. */
  check(url: string): RobotsCheck;
  policies(): HostPolicy[];
}

const DAY_MS = 24 * 3_600_000;

async function readLimited(
  res: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: '', truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - size;
    if (value.length > room) {
      chunks.push(value.subarray(0, room));
      size += room;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    size += value.length;
  }
  return { text: Buffer.concat(chunks, size).toString('utf8'), truncated };
}

function parseUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Per-run `robots.txt` policies, one per in-scope host (research §2-§3, contracts/robots.md).
 * Fetched server-side with Node `fetch` (never the browser), through the run's rate limiter and
 * User-Agent, and not through the block detector: a 4xx on robots.txt means "no rules".
 */
export function createRobotsRegistry(opts: RobotsRegistryOptions): RobotsRegistry {
  const fetchImpl = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? ROBOTS_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? 5;
  const token = productToken(opts.userAgent);
  const byHost = new Map<string, HostPolicy>();
  const pending = new Map<string, Promise<HostPolicy>>();
  const origins = new Map<string, string>();

  const governed = (u: URL | null): u is URL =>
    u !== null && domainAllowed(u.hostname, opts.allowedDomains);

  async function download(
    origin: string,
  ): Promise<
    Omit<
      RobotsFetchRecord,
      | 'host'
      | 'fetched_at'
      | 'product_token'
      | 'group_used'
      | 'crawl_delay_s'
      | 'ignored_lines'
      | 'sitemaps'
      | 'content_sha256'
    > & { parsed: ParsedRobots | null }
  > {
    const source = `${origin}/robots.txt`;
    const redirects: string[] = [];
    let url = source;
    const fail = (failure: string, status: number | null, finalUrl: string | null) => ({
      source_url: source,
      final_url: finalUrl,
      redirects,
      http_status: status,
      outcome: 'unreachable' as const,
      failure,
      truncated: false,
      body: null,
      parsed: null,
    });
    for (;;) {
      const release = await opts.limiter.acquire();
      let res: Response;
      try {
        res = await fetchImpl(url, {
          redirect: 'manual',
          headers: { 'user-agent': opts.userAgent ?? token },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        release();
        const err = e as Error;
        const kind =
          err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timeout' : 'network error';
        return fail(`${kind}: ${err.message}`, null, null);
      }
      try {
        const location = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && location) {
          if (redirects.length >= maxRedirects)
            return fail(`more than ${maxRedirects} redirects`, res.status, url);
          url = new URL(location, url).toString();
          redirects.push(url);
          continue;
        }
        if (res.status >= 200 && res.status < 300) {
          const { text, truncated } = await readLimited(res, maxBytes);
          return {
            source_url: source,
            final_url: url,
            redirects,
            http_status: res.status,
            outcome: 'rules',
            failure: null,
            truncated,
            body: text,
            parsed: parseRobots(text, { maxBytes }),
          };
        }
        if (res.status >= 400 && res.status < 500) {
          await res.body?.cancel();
          return {
            source_url: source,
            final_url: url,
            redirects,
            http_status: res.status,
            outcome: 'no_rules',
            failure: null,
            truncated: false,
            body: null,
            parsed: null,
          };
        }
        await res.body?.cancel();
        return fail(`HTTP ${res.status}`, res.status, url);
      } catch (e) {
        return fail(`read error: ${(e as Error).message}`, res.status, url);
      } finally {
        release();
      }
    }
  }

  async function load(host: string, origin: string): Promise<HostPolicy> {
    const d = await download(origin);
    const group: AppliedGroup = d.parsed
      ? selectGroup(d.parsed, token)
      : { agent: null, rules: [] };
    const record: RobotsFetchRecord = {
      host,
      source_url: d.source_url,
      final_url: d.final_url,
      redirects: d.redirects,
      http_status: d.http_status,
      outcome: d.outcome,
      failure: d.failure,
      fetched_at: new Date(now()).toISOString(),
      product_token: token,
      group_used: group.agent,
      crawl_delay_s: group.crawlDelay ?? null,
      ignored_lines: d.parsed?.ignoredLines ?? 0,
      truncated: d.truncated,
      sitemaps: d.parsed?.sitemaps ?? [],
      content_sha256: d.body === null ? null : createHash('sha256').update(d.body).digest('hex'),
      body: d.body,
    };
    const { policyId, evidenceRef } = await opts.persist(record);
    const policy: HostPolicy = {
      host,
      outcome: d.outcome,
      failure: d.failure,
      policyId,
      evidenceRef,
      fetchedAt: now(),
      contentSha256: record.content_sha256,
      group,
      parsed: d.parsed,
    };
    if (group.crawlDelay !== undefined && group.crawlDelay > 0)
      opts.limiter.slowTo(1 / group.crawlDelay);
    const previous = byHost.get(host);
    byHost.set(host, policy);
    if (
      previous &&
      (previous.contentSha256 !== policy.contentSha256 || previous.outcome !== policy.outcome)
    )
      await opts.onRulesChanged?.(host, previous, policy);
    return policy;
  }

  function loadOnce(host: string, origin: string): Promise<HostPolicy> {
    const inflight = pending.get(host);
    if (inflight) return inflight;
    const p = load(host, origin).finally(() => pending.delete(host));
    pending.set(host, p);
    return p;
  }

  return {
    productToken: token,
    inScope: (url) => governed(parseUrl(url)),
    async ensure(url) {
      const u = parseUrl(url);
      if (!governed(u)) return null;
      const host = u.host.toLowerCase();
      origins.set(host, u.origin);
      const known = byHost.get(host);
      if (known && now() - known.fetchedAt < DAY_MS) return known;
      return loadOnce(host, u.origin);
    },
    refresh(host) {
      return loadOnce(host, origins.get(host) ?? `https://${host}`);
    },
    check(url) {
      const u = parseUrl(url);
      if (!governed(u)) return { state: 'not_checked' };
      const p = byHost.get(u.host.toLowerCase());
      if (!p) return { state: 'unknown' };
      if (p.outcome === 'unreachable')
        return { state: 'refused', rule: 'robots:unreachable', policyId: p.policyId };
      if (p.outcome === 'no_rules' || !p.parsed) return { state: 'allowed', rule: null };
      const v = robotsVerdict(p.parsed, token, url);
      return v.allowed
        ? { state: 'allowed', rule: v.rule === null ? null : `robots:${v.rule}` }
        : { state: 'refused', rule: `robots:${v.rule}`, policyId: p.policyId };
    },
    policies: () => [...byHost.values()],
  };
}
