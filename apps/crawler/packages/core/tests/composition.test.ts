import { describe, expect, it } from 'vitest';
import { FieldNameSource, FoundBy, PageComposition } from '../src/index.js';

const empty = {
  frames: [],
  frames_skipped: 0,
  mounts: [],
  loaders: [],
  clickables: { found: 0, issued: 0, capped: 0 },
};

describe('PageComposition', () => {
  it('parses a full composition', () => {
    const full = {
      frames: [
        {
          path: '',
          url: 'https://portal.test/',
          name: null,
          title: 'Home',
          origin: 'https://portal.test',
          observed: true,
          depth: 0,
        },
        {
          path: '0',
          url: 'https://portal.test/inner',
          name: 'main',
          title: null,
          origin: 'https://portal.test',
          observed: true,
          depth: 1,
        },
      ],
      frames_skipped: 2,
      mounts: [
        {
          selector: '#root',
          frame: '',
          filled: true,
          waited_ms: 1200,
          bundles: ['https://portal.test/static/app.js'],
        },
      ],
      loaders: ['importmap', 'systemjs', 'requirejs', 'dynamic_import'],
      clickables: { found: 12, issued: 10, capped: 2 },
    };
    expect(PageComposition.parse(full)).toEqual(full);
  });

  it('parses an empty composition', () => {
    expect(PageComposition.parse(empty)).toEqual(empty);
  });

  it('refuses an unknown loader name', () => {
    expect(PageComposition.safeParse({ ...empty, loaders: ['webpack'] }).success).toBe(false);
  });

  it('exports the found-by and field-name-source enums', () => {
    expect(FoundBy.options).toEqual(['listener', 'inline', 'framework', 'cursor', 'tabindex']);
    expect(FieldNameSource.options).toContain('position');
  });
});
