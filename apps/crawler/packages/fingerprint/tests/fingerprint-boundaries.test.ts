import { describe, expect, it } from 'vitest';
import { computeFingerprint, FingerprintIndex, similarity } from '../src/index.js';

/** MinHash signature length (`SIGNATURE_SIZE` in fingerprint.ts, not exported). */
const SIGNATURE_SIZE = 128;

/**
 * Direct tests of the level-1/level-2 fingerprint and the cluster decision at its edges (spec 012
 * F-12): until now these were only exercised through crawler and mcp-server tests, which
 * per-package mutation testing does not run.
 */

const fp = (aria: string, routeTemplate = '/x') =>
  computeFingerprint({ routeTemplate, ariaSnapshot: aria });

const LISTING =
  '- main:\n  - heading "H" [level=1]\n  - list:\n    - listitem: a\n    - listitem: b\n  - button "Go"\n  - link "More"';
const LISTING_PLUS = `${LISTING}\n  - paragraph: extra`;

describe('computeFingerprint', () => {
  it('is pinned for a fixed page (hash inputs and MinHash seeds unchanged)', () => {
    const f = fp('- main:\n  - heading "Oferty" [level=1]\n  - button "Kup"');
    expect(f.level1).toBe('0c6e7fc300834021ae7cafa69cf3093bbd0fdd2a568296834acfc3d8a8fb0c26');
    expect(f.level2).toHaveLength(SIGNATURE_SIZE);
    expect(f.level2.slice(0, 3)).toEqual([2047225249, 474144084, 517555265]);
  });

  it.each([
    'button',
    'textbox',
    'searchbox',
    'combobox',
    'checkbox',
    'radio',
    'switch',
    'slider',
    'spinbutton',
    'tab',
    'menuitem',
    'form',
    'search',
    'navigation',
    'region',
    'complementary',
    'group',
    'dialog',
    'alertdialog',
    'main',
    'banner',
    'contentinfo',
  ])('the name of a %s is part of the structure', (role) => {
    expect(similarity(fp(`- ${role} "Alpha"`).level2, fp(`- ${role} "Beta"`).level2)).toBe(0);
  });

  it.each(['link', 'heading'])('the name of a %s is content, not structure', (role) => {
    const a = fp(`- ${role} "Alpha"`);
    const b = fp(`- ${role} "Beta"`);
    expect(a.level1).not.toBe(b.level1);
    expect(a.level2).toEqual(b.level2);
  });

  it('roles and nesting are part of the structure', () => {
    expect(similarity(fp('- heading "a"').level2, fp('- table').level2)).toBe(0);
    expect(similarity(fp('- list').level2, fp('- table').level2)).toBe(0);
  });
});

describe('similarity', () => {
  it('compares the common prefix of two signatures', () => {
    expect(similarity([1], [1])).toBe(1);
    expect(similarity([1, 2], [1, 2, 3])).toBe(1);
    expect(similarity([1, 2], [1, 3])).toBe(0.5);
    expect(similarity([], [])).toBe(0);
  });

  it('two near-identical listings', () => {
    expect(similarity(fp(LISTING).level2, fp(LISTING_PLUS).level2)).toBe(0.8125);
  });
});

describe('FingerprintIndex.assign', () => {
  it('merges exactly at the threshold', () => {
    const index = new FingerprintIndex({ threshold: 0.8125 });
    index.assign(fp(LISTING));
    expect(index.assign(fp(LISTING_PLUS)).decision).toMatchObject({
      kind: 'merge',
      reason: 'similar-structure',
      similarity: 0.8125,
      threshold: 0.8125,
    });
  });

  it('picks the most similar cluster, not the latest one', () => {
    const index = new FingerprintIndex({ threshold: 0.8 });
    const listing = index.assign(fp(LISTING));
    index.assign(fp('- table'));
    expect(index.assign(fp(LISTING_PLUS)).clusterId).toBe(listing.clusterId);
  });

  it('on a split, reports the first of equally (dis)similar clusters as the near miss', () => {
    const index = new FingerprintIndex();
    const first = fp('- heading "a"');
    index.assign(first);
    index.assign(fp('- list'));
    expect(index.assign(fp('- table')).decision).toMatchObject({
      kind: 'split',
      reason: 'new-cluster',
      matchedFingerprint: first.level1,
      similarity: 0,
    });
  });

  it('remembers a similar merge, so the same page next time is identical', () => {
    const index = new FingerprintIndex({ threshold: 0.8 });
    index.assign(fp(LISTING));
    index.assign(fp(LISTING_PLUS));
    expect(index.assign(fp(LISTING_PLUS)).decision.reason).toBe('identical-fingerprint');
  });

  it('names a new cluster after the first 12 hex digits of its level-1 hash', () => {
    const f = fp(LISTING);
    expect(new FingerprintIndex().assign(f).clusterId).toBe(`cluster-${f.level1.slice(0, 12)}`);
  });
});
