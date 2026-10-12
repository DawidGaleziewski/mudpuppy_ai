import { describe, expect, it } from 'vitest';
import { parseUrlParams } from '../src/url-params.js';

const q = (name: string, value: string | null, position: number) => ({
  name,
  value,
  in: 'query',
  position,
});

describe('parseUrlParams (spec 019, R-37)', () => {
  it('keeps every query parameter in order, repeats and tracking ones included', () => {
    expect(parseUrlParams('https://x.test/sklep?utm_source=n&b=2&a=1&a=3')).toEqual([
      q('utm_source', 'n', 0),
      q('b', '2', 1),
      q('a', '1', 2),
      q('a', '3', 3),
    ]);
  });

  it('tells a valueless parameter from an empty one and decodes values', () => {
    expect(parseUrlParams('https://x.test/?flag&empty=&q=caf%C3%A9+au+lait&bad=%E0%A4%A')).toEqual([
      q('flag', null, 0),
      q('empty', '', 1),
      q('q', 'café au lait', 2),
      q('bad', '%E0%A4%A', 3),
    ]);
  });

  it('reads path parameters such as a session id, per segment', () => {
    expect(
      parseUrlParams('https://bank.test/legacy;v=2/wyciag.do;jsessionid=AB12?konto=7'),
    ).toEqual([
      { name: 'v', value: '2', in: 'path', position: 0 },
      { name: 'jsessionid', value: 'AB12', in: 'path', position: 1 },
      q('konto', '7', 0),
    ]);
  });

  it('reads the query of a hash route', () => {
    expect(parseUrlParams('https://i.test/ubezpieczenia#/szkody/potwierdzenie?nr=SZ-1')).toEqual([
      { name: 'nr', value: 'SZ-1', in: 'fragment_query', position: 0 },
    ]);
  });

  it('returns nothing for a URL without parameters or one that does not parse', () => {
    expect(parseUrlParams('https://x.test/a/b')).toEqual([]);
    expect(parseUrlParams('not a url')).toEqual([]);
  });
});
