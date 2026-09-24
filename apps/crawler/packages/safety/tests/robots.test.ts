import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCT_TOKEN,
  parseRobots,
  productToken,
  robotsTarget,
  robotsVerdict,
  selectGroup,
} from '../src/index.js';

const FIXTURES = new URL('../../../tests/fixtures/', import.meta.url);
const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), 'utf8');
const TOKEN = 'PathfinderAI-Crawler';

const verdict = (text: string, url: string, token = TOKEN) =>
  robotsVerdict(parseRobots(text), token, url);

describe('productToken (research §4)', () => {
  it('is the User-Agent text before the first "/" or space', () => {
    expect(productToken('PathfinderAI-Crawler/0.1 (+mailto:ops@example.com)')).toBe(TOKEN);
    expect(productToken('MyBot (+https://x.y)')).toBe('MyBot');
  });

  it('defaults without a User-Agent', () => {
    expect(productToken(undefined)).toBe(DEFAULT_PRODUCT_TOKEN);
    expect(DEFAULT_PRODUCT_TOKEN).toBe(TOKEN);
  });
});

describe('robotsTarget: path plus query, normalised', () => {
  it('keeps the query, drops the fragment, uses "/" for an empty path', () => {
    expect(robotsTarget('https://x.pl/a/b?c=1&d=2#frag')).toBe('/a/b?c=1&d=2');
    expect(robotsTarget('https://x.pl')).toBe('/');
  });

  it('decodes unreserved octets and upper-cases the rest', () => {
    expect(robotsTarget('https://x.pl/%7euser/%2fx')).toBe('/~user/%2Fx');
    expect(robotsTarget('https://x.pl/foo/bar/%62%61%7A')).toBe('/foo/bar/baz');
  });
});

describe('RFC 9309 examples', () => {
  const rfc = fixture('robots/rfc9309-examples.txt');
  const cases: [string, string, boolean][] = [
    ['unknownbot', '/example/x', false],
    ['unknownbot', '/publications/x', true],
    ['unknownbot', '/img/a.gif', false],
    ['unknownbot', '/img/a.gif?size=2', true],
    ['unknownbot', '/other', true],
    ['foobot', '/example/page.html', true],
    ['foobot', '/example/allowed.gif', true],
    ['foobot', '/example/other', false],
    ['foobot', '/', false],
    ['FooBot', '/example/page.html', true],
    ['barbot', '/example/page.html', false],
    ['bazbot', '/example/page.html', false],
    ['barbot', '/example/other', true],
    ['quxbot', '/example/x', true],
    ['longbot', '/example/page/', true],
    ['longbot', '/example/page/disallowed.gif', false],
  ];
  it.each(cases)('%s %s → allowed=%s', (token, path, allowed) => {
    expect(verdict(rfc, `https://example.com${path}`, token).allowed).toBe(allowed);
  });

  it('merges several groups naming the same agent', () => {
    const text =
      'User-agent: a\nDisallow: /x\n\nUser-agent: b\nDisallow: /y\n\nUser-agent: a\nDisallow: /z\n';
    expect(verdict(text, 'https://h/x', 'a').allowed).toBe(false);
    expect(verdict(text, 'https://h/z', 'a').allowed).toBe(false);
    expect(verdict(text, 'https://h/y', 'a').allowed).toBe(true);
  });
});

describe('group selection', () => {
  const text = [
    'User-agent: *',
    'Disallow: /all-bots/',
    '',
    'User-agent: pathfinderai-crawler',
    'Disallow: /only-us/',
    'Crawl-delay: 5',
  ].join('\n');

  it('uses only the crawler own group, matched case-insensitively (US1 scenario 3)', () => {
    expect(verdict(text, 'https://h/only-us/x').allowed).toBe(false);
    expect(verdict(text, 'https://h/all-bots/x').allowed).toBe(true);
    const g = selectGroup(parseRobots(text), TOKEN);
    expect(g.agent).toBe('pathfinderai-crawler');
    expect(g.crawlDelay).toBe(5);
  });

  it('falls back to the * group, then to no rules', () => {
    expect(selectGroup(parseRobots(text), 'OtherBot').agent).toBe('*');
    const none = selectGroup(parseRobots('User-agent: x\nDisallow: /\n'), TOKEN);
    expect(none.agent).toBeNull();
    expect(none.rules).toEqual([]);
  });
});

describe('matching', () => {
  it('longest match wins and Allow wins a tie (US1 scenario 2)', () => {
    const text =
      'User-agent: *\nDisallow: /quote/\nAllow: /quote/start*\nDisallow: /tie\nAllow: /tie\n';
    expect(verdict(text, 'https://h/quote/start')).toEqual({
      allowed: true,
      rule: 'Allow: /quote/start*',
    });
    expect(verdict(text, 'https://h/quote/summary')).toEqual({
      allowed: false,
      rule: 'Disallow: /quote/',
    });
    expect(verdict(text, 'https://h/tie').allowed).toBe(true);
  });

  it('matches rules on the query string (US1 scenario 1)', () => {
    const text = 'User-agent: *\nDisallow: *cHash*\nDisallow: /*?id=*\n';
    expect(verdict(text, 'https://h/formularze-online/?itm_campaign=x&cHash=02e3')).toEqual({
      allowed: false,
      rule: 'Disallow: *cHash*',
    });
    expect(verdict(text, 'https://h/page?id=4').allowed).toBe(false);
    expect(verdict(text, 'https://h/page?pid=4').allowed).toBe(true);
  });

  it('supports * and the $ end anchor', () => {
    const text = 'User-agent: *\nDisallow: /*.pdf$\n';
    expect(verdict(text, 'https://h/a/b.pdf').allowed).toBe(false);
    expect(verdict(text, 'https://h/a/b.pdf?x=1').allowed).toBe(true);
    expect(verdict(text, 'https://h/a/b.pdfx').allowed).toBe(true);
  });

  it('treats regex characters in patterns literally', () => {
    const text = 'User-agent: *\nDisallow: /a+b(c)?\n';
    expect(verdict(text, 'https://h/a+b(c)?x=1').allowed).toBe(false);
    expect(verdict(text, 'https://h/aab').allowed).toBe(true);
  });

  it('ignores an empty Disallow and allows when nothing matches', () => {
    expect(verdict('User-agent: *\nDisallow:\n', 'https://h/anything')).toEqual({
      allowed: true,
      rule: null,
    });
  });

  it('always allows /robots.txt', () => {
    expect(verdict('User-agent: *\nDisallow: /\n', 'https://h/robots.txt').allowed).toBe(true);
    expect(verdict('User-agent: *\nDisallow: /\n', 'https://h/x').allowed).toBe(false);
  });

  it('compares after percent-encoding normalisation', () => {
    expect(verdict('User-agent: *\nDisallow: /%7euser\n', 'https://h/~user/x').allowed).toBe(false);
    expect(verdict('User-agent: *\nDisallow: /~user\n', 'https://h/%7Euser/x').allowed).toBe(false);
    expect(
      verdict('User-agent: *\nDisallow: /foo/bar/%62%61%7A\n', 'https://h/foo/bar/baz').allowed,
    ).toBe(false);
    expect(verdict('User-agent: *\nDisallow: /foo/bar/ツ\n', 'https://h/foo/bar/ツ').allowed).toBe(
      false,
    );
    expect(verdict('User-agent: *\nDisallow: /a%2fb\n', 'https://h/a/b').allowed).toBe(true);
  });
});

describe('parsing extras', () => {
  it('ignores and counts malformed lines, keeps the rest', () => {
    const p = parseRobots(
      'Disallow: /before-any-agent\nUser-agent: *\nthis is not a rule\nDisallow: /x\n# comment only\nDisallow: /y # trailing\n',
    );
    expect(p.ignoredLines).toBe(2);
    expect(robotsVerdict(p, TOKEN, 'https://h/x').allowed).toBe(false);
    expect(robotsVerdict(p, TOKEN, 'https://h/y').allowed).toBe(false);
    expect(robotsVerdict(p, TOKEN, 'https://h/before-any-agent').allowed).toBe(true);
  });

  it('records Sitemap lines and Crawl-delay', () => {
    const p = parseRobots(
      'User-agent: *\nCrawl-delay: 2.5\nDisallow: /x\nSitemap: https://h/sitemap.xml\n',
    );
    expect(p.sitemaps).toEqual(['https://h/sitemap.xml']);
    expect(selectGroup(p, TOKEN).crawlDelay).toBe(2.5);
  });

  it('parses only the first maxBytes and flags the truncation', () => {
    const big =
      'User-agent: *\nDisallow: /early\n' + '# pad\n'.repeat(200_000) + 'Disallow: /late\n';
    const p = parseRobots(big, { maxBytes: 512_000 });
    expect(p.truncated).toBe(true);
    expect(robotsVerdict(p, TOKEN, 'https://h/early').allowed).toBe(false);
    expect(robotsVerdict(p, TOKEN, 'https://h/late').allowed).toBe(true);
    expect(parseRobots('User-agent: *\n').truncated).toBe(false);
  });

  it('accepts CRLF line endings and a BOM', () => {
    const p = parseRobots('\uFEFFUser-agent: *\r\nDisallow: /x\r\n');
    expect(robotsVerdict(p, TOKEN, 'https://h/x').allowed).toBe(false);
    expect(p.ignoredLines).toBe(0);
  });
});

describe('real robots.txt fixtures', () => {
  it.each(['liveinsurer.example.txt', 'marketsite.example.txt', 'forum.example.txt', 'pl.wikipedia.org.txt'])(
    '%s parses into at least one group',
    (name) => {
      const p = parseRobots(fixture(`robots/${name}`));
      expect(p.groups.length).toBeGreaterThan(0);
    },
  );

  it('forum.example disallows /api/ for us and allows its pages', () => {
    const text = fixture('robots/forum.example.txt');
    expect(verdict(text, 'https://forum.example/api/v3/links').allowed).toBe(false);
    expect(verdict(text, 'https://forum.example/link/123/x').allowed).toBe(true);
  });

  it('marketsite.example applies the * group, not the Googlebot one', () => {
    const text = fixture('robots/marketsite.example.txt');
    expect(verdict(text, 'https://marketsite.example/oferty/wystaw/x').allowed).toBe(false);
    expect(verdict(text, 'https://marketsite.example/mobile_api/x').allowed).toBe(true);
  });

  it('an HTML error page (classifieds.example 403 body) yields no rules', () => {
    const p = parseRobots(fixture('robots/classifieds.example.403.html'));
    expect(robotsVerdict(p, TOKEN, 'https://www.classifieds.example/anything').allowed).toBe(true);
  });

  interface Sample {
    urls: { url: string; expected: 'allow' | 'refuse'; rule: string | null }[];
  }
  const sample: Sample = JSON.parse(fixture('urls/liveinsurer-robots-sample.json'));
  const liveinsurer = parseRobots(fixture('robots/liveinsurer.example.txt'));

  it('the liveinsurer sample has 50 URLs including every cHash link (SC-002)', () => {
    expect(sample.urls).toHaveLength(50);
    expect(sample.urls.filter((u) => u.url.includes('cHash')).length).toBeGreaterThan(0);
  });

  it.each(sample.urls.map((u) => [u.url, u] as const))('liveinsurer %s', (_url, u) => {
    expect(robotsVerdict(liveinsurer, TOKEN, u.url)).toEqual({
      allowed: u.expected === 'allow',
      rule: u.rule,
    });
  });
});
