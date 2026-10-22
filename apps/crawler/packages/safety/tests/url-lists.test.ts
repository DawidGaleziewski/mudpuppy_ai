import { describe, expect, it } from 'vitest';
import { urlEntryKind as entryKind, urlEntryProblem as entryProblem } from '@mudpuppy/config';
import { checkUrlLists, matchUrlEntry } from '../src/url-lists.js';

describe('URL list entries (spec 023 US3)', () => {
  it('tells a regex, an absolute URL glob and a path glob apart', () => {
    expect(entryKind('/\\/polisa\\/\\d+/')).toBe('regex');
    expect(entryKind('/konto/')).toBe('path'); // no regex character: a path
    expect(entryKind('/konto/*')).toBe('path');
    expect(entryKind('https://www.liveinsurer.example/kontakt*')).toBe('url');
    expect(entryKind('konto/*')).toBeNull();
  });

  it('names an unusable entry', () => {
    expect(entryProblem('/(unclosed/')).toMatch(/not a valid regex/);
    expect(entryProblem('konto')).toMatch(/must be a path/);
    expect(entryProblem('/__admin/*')).toBeNull();
  });

  it('matches path globs on the path and on path + query, case-insensitively', () => {
    expect(matchUrlEntry('/konto/*', 'https://x.pl/KONTO/dane')).toBe(true);
    expect(matchUrlEntry('/szukaj?q=*', 'https://x.pl/szukaj?q=oc')).toBe(true);
    expect(matchUrlEntry('/szukaj', 'https://x.pl/szukaj?q=oc')).toBe(true);
    expect(matchUrlEntry('/konto/*', 'https://x.pl/kontakt')).toBe(false);
  });

  it('matches URL globs and regexes on the full URL without the fragment', () => {
    expect(
      matchUrlEntry('https://www.liveinsurer.example/kontakt*', 'https://www.liveinsurer.example/kontakt/form#top'),
    ).toBe(true);
    expect(matchUrlEntry('https://www.liveinsurer.example/kontakt*', 'https://shop.liveinsurer.example/kontakt')).toBe(
      false,
    );
    expect(matchUrlEntry('/\\/polisa\\/\\d+\\/druk/', 'https://x.pl/polisa/123/druk')).toBe(true);
    expect(matchUrlEntry('/\\/polisa\\/\\d+\\/druk/', 'https://x.pl/polisa/abc/druk')).toBe(false);
  });
});

describe('checkUrlLists', () => {
  const lists = { allowed: ['/konto/*', '/'], disallowed: ['/konto/usun*'] };

  it('lets everything through when no list is set', () => {
    expect(checkUrlLists('https://x.pl/anything', {})).toBeNull();
  });

  it('disallowed wins over allowed and names its entry', () => {
    expect(checkUrlLists('https://x.pl/konto/usun', lists)).toEqual({
      status: 'out_of_scope',
      rule: 'urls.disallowed /konto/usun*',
      reason: 'excluded by rule /konto/usun*',
    });
  });

  it('once allowed is set, only matching URLs pass', () => {
    expect(checkUrlLists('https://x.pl/konto/dane', lists)).toBeNull();
    expect(checkUrlLists('https://x.pl/', lists)).toBeNull();
    expect(checkUrlLists('https://x.pl/faq', lists, 'persona.urls')).toMatchObject({
      rule: 'persona.urls.allowed',
    });
  });
});
