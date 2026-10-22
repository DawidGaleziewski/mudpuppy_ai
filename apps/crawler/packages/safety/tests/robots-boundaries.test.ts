import { describe, expect, it } from 'vitest';
import { parseRobots, robotsTarget, robotsVerdict, selectGroup } from '../src/robots.js';

/**
 * Boundary cases for robots.txt handling (RFC 9309; spec 012 F-12): longest-match and tie rules,
 * crawl-delay edges, tolerant parsing and the encoding of match targets.
 */

const verdict = (robots: string, path: string) =>
  robotsVerdict(parseRobots(robots), 'MudPuppy-Crawler', `https://example.test${path}`);

describe('robotsVerdict: which rule wins', () => {
  it('on a tie in length, allow wins whatever the order', () => {
    expect(verdict('User-agent: *\nAllow: /a\nDisallow: /a', '/a').allowed).toBe(true);
    expect(verdict('User-agent: *\nDisallow: /a\nAllow: /a', '/a').allowed).toBe(true);
  });

  it('a longer disallow beats a shorter allow listed after it', () => {
    expect(verdict('User-agent: *\nDisallow: /abc\nAllow: /a', '/abc')).toEqual({
      allowed: false,
      rule: 'Disallow: /abc',
    });
  });

  it('a longer allow beats a shorter disallow', () => {
    expect(verdict('User-agent: *\nDisallow: /a\nAllow: /abc', '/abc')).toEqual({
      allowed: true,
      rule: 'Allow: /abc',
    });
  });
});

describe('parseRobots: tolerant parsing', () => {
  it('reads keys case-insensitively and skips blank lines without counting them', () => {
    const p = parseRobots('USER-AGENT: *\n   \nDISALLOW: /x');
    expect(p.ignoredLines).toBe(0);
    expect(verdict('USER-AGENT: *\n   \nDISALLOW: /x', '/x').allowed).toBe(false);
  });

  it('counts a line that starts with a colon as ignored', () => {
    expect(parseRobots(':x\nUser-agent: *').ignoredLines).toBe(1);
  });

  it('ignores unknown keys without breaking an agent run or adding a rule', () => {
    const p = parseRobots('User-agent: a\nHost: example.test\nUser-agent: b\nDisallow: /a');
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0]!.agents).toEqual(['a', 'b']);
    expect(p.groups[0]!.rules.map((r) => r.pattern)).toEqual(['/a']);
    expect(p.ignoredLines).toBe(0);
  });

  it('keeps no empty sitemap', () => {
    expect(parseRobots('Sitemap:\nSitemap: https://example.test/s.xml').sitemaps).toEqual([
      'https://example.test/s.xml',
    ]);
  });

  it.each([
    ['0', 0, 0],
    ['2.5', 2.5, 0],
    ['-1', undefined, 1],
    ['soon', undefined, 1],
  ])('Crawl-delay: %s → %s (%i ignored)', (value, delay, ignored) => {
    const p = parseRobots(`User-agent: *\nCrawl-delay: ${value}`);
    expect(p.groups[0]!.crawlDelay).toBe(delay);
    expect(p.ignoredLines).toBe(ignored);
  });

  it('truncates only beyond maxBytes', () => {
    const text = 'User-agent: *'; // 13 bytes
    expect(parseRobots(text, { maxBytes: 13 }).truncated).toBe(false);
    expect(parseRobots(text, { maxBytes: 12 }).truncated).toBe(true);
  });
});

describe('selectGroup: crawl-delay across merged groups', () => {
  it('takes the largest delay and skips groups without one', () => {
    const p = parseRobots(
      'User-agent: *\nCrawl-delay: 2\n\nUser-agent: *\nDisallow: /x\n\nUser-agent: *\nCrawl-delay: 5',
    );
    expect(selectGroup(p, 'bot').crawlDelay).toBe(5);
  });

  it('sets no delay when no group has one', () => {
    const g = selectGroup(parseRobots('User-agent: *\nDisallow: /x'), 'bot');
    expect(g).not.toHaveProperty('crawlDelay');
  });
});

describe('robotsTarget encoding', () => {
  it('keeps "~" and encodes non-ASCII, astral characters included', () => {
    expect(robotsTarget('https://example.test/a~b')).toBe('/a~b');
    expect(robotsTarget('/zażółć')).toBe('/za%C5%BC%C3%B3%C5%82%C4%87');
    expect(robotsTarget('/a\u{1F600}b')).toBe('/a%F0%9F%98%80b');
  });

  it('returns an unparseable URL normalised as it is', () => {
    expect(robotsTarget('http://[')).toBe('http://[');
  });
});
