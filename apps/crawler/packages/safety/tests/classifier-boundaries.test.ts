import { describe, expect, it } from 'vitest';
import { classifyAction, classifyUrl } from '../src/classifier.js';
import { normalize } from '../src/rules.js';

/**
 * Boundary cases for the action classifier and its built-in rules (spec 012 F-12): every keyword
 * and path variant, every positive-read signal on its own, and the exact reasons recorded.
 */

describe('normalize', () => {
  it('lower-cases, strips diacritics, maps ł, collapses and trims whitespace', () => {
    expect(normalize('  Zażółć   GĘŚLĄ\tjaźń  ')).toBe('zazolc gesla jazn');
    expect(normalize('Log   Out')).toBe('log out');
  });
});

describe('built-in label rules: each spelling variant', () => {
  it.each([
    ['Logout', 'logout'],
    ['Log out', 'logout'],
    ['Signout', 'logout'],
    ['Sign out', 'logout'],
    ['Place bid', 'purchase'],
    ['Place a bid', 'purchase'],
    ['Make offer', 'purchase'],
    ['Buy policy', 'purchase'],
    ['Buy a ticket', 'purchase'],
    ['Message seller', 'contact_or_message'],
    ['Send message', 'contact_or_message'],
    ['Call seller', 'reveal_contact'],
    ['Add to favorites', 'mutating:favourite'],
    ['Add to favourites', 'mutating:favourite'],
    ['Add to basket', 'mutating:cart'],
    ['Dodaj do koszyka', 'mutating:cart'],
    ['Save', 'mutating:save'],
    ['Zgłoś', 'mutating:save'],
  ])('%j raises %s', (name, rule) => {
    expect(classifyAction({ role: 'button', name }).rules).toContain(rule);
  });

  it.each([
    ['favourite', 'mutating'],
    ['add to cart', 'mutating'],
    ['save', 'mutating'],
  ])('%j is classed %s', (name, cls) => {
    expect(classifyAction({ role: 'button', name }).safetyClass).toBe(cls);
  });
});

describe('built-in path rules: each path variant', () => {
  it.each([
    ['/signout', 'logout'],
    ['/sign-out', 'logout'],
    ['/wiadomosci/nowa', 'contact_or_message'],
    ['/messages/new', 'contact_or_message'],
    ['/napisz', 'contact_or_message'],
    ['/kontakt-ze-sprzedawca', 'contact_or_message'],
    ['/pokaz-numer/1', 'reveal_contact'],
    ['/show-phone', 'reveal_contact'],
    ['/reveal-contact', 'reveal_contact'],
    ['/zapytanie', 'submit_request'],
    ['/request-a-quote', 'submit_request'],
    ['/newsletter/subscribe', 'submit_request'],
  ])('%s matches %s', (path, rule) => {
    const c = classifyUrl(`https://example.test${path}`);
    expect(c.rules).toEqual([rule]);
    expect(c.reasons).toEqual([`path matches ${rule}`]);
    expect(c.safetyClass).not.toBe('read');
  });

  it('decodes the path before matching and keeps an undecodable one as is', () => {
    expect(classifyUrl('https://example.test/%77yloguj').rules).toEqual(['logout']);
    expect(classifyUrl('https://example.test/%E0%A4%A').rules).toEqual([]);
  });
});

describe('positive read evidence: each signal on its own', () => {
  it.each([
    'searchbox',
    'combobox',
    'radio',
    'switch',
    'slider',
    'listbox',
    'option',
    'tablist',
    'textbox',
  ])('role %s is read', (role) => {
    expect(classifyAction({ role }).safetyClass).toBe('read');
  });

  it.each([
    [{ role: 'menuitem', href: '/x' }, 'read'],
    [{ role: 'treeitem', href: '/x' }, 'read'],
    [{ role: 'link' }, 'mutating'], // a link without an href is not evidence
    [{ role: 'button', href: '/x' }, 'mutating'], // an href on a non-link role is not either
    [{ role: 'button', name: 'Prev' }, 'read'],
    [{ role: 'button', form: { purpose: 'search' as const } }, 'read'],
    [{ role: 'button', form: { purpose: 'other' as const } }, 'mutating'],
    [{ role: 'button', attributes: { 'aria-expanded': 'false' } }, 'read'],
    [{ role: 'button', attributes: { 'aria-haspopup': 'menu' } }, 'read'],
    [{ role: 'button', attributes: { 'data-x': '1' } }, 'mutating'],
  ])('%j → %s', (d, cls) => {
    expect(classifyAction(d).safetyClass).toBe(cls);
  });

  it('a GET form counts only with safeFormSubmitIsRead, and a form without a method never', () => {
    const get = { role: 'button', form: { method: 'get' } };
    expect(classifyAction(get).safetyClass).toBe('mutating');
    expect(classifyAction(get, undefined, { safeFormSubmitIsRead: true }).safetyClass).toBe('read');
    expect(
      classifyAction({ role: 'button', form: {} }, undefined, { safeFormSubmitIsRead: true })
        .safetyClass,
    ).toBe('mutating');
  });
});

describe('classifyAction reasons', () => {
  it('records each signal once per rule, with its reason, in order', () => {
    expect(
      classifyAction({
        role: 'button',
        name: 'Wyloguj',
        text: 'wyloguj się',
        href: '/wyloguj',
        method: 'DELETE',
        form: { hasPassword: true },
        claimedClass: 'external-side-effect',
      }),
    ).toEqual({
      safetyClass: 'external-side-effect',
      rules: ['logout'],
      reasons: [
        'label matches logout',
        'target url matches logout',
        'HTTP DELETE',
        'form carries a password field',
        'claimed class external-side-effect (can only raise)',
      ],
    });
  });

  it('names a POST and an unknown control', () => {
    expect(classifyAction({ role: 'button', name: 'OK', method: 'post' })).toEqual({
      safetyClass: 'mutating',
      rules: [],
      reasons: ['non-idempotent HTTP POST'],
    });
    expect(classifyAction({ role: 'button', name: 'OK' })).toEqual({
      safetyClass: 'mutating',
      rules: ['unknown_control'],
      reasons: ['no evidence that this control is read-only'],
    });
  });

  it('HEAD is as safe as GET', () => {
    expect(classifyAction({ role: 'link', href: '/x', method: 'HEAD' })).toEqual({
      safetyClass: 'read',
      rules: [],
      reasons: [],
    });
  });

  it('ignores an empty name and matches the visible text', () => {
    expect(classifyAction({ role: 'button', name: '', text: 'Wyloguj' }).rules).toEqual(['logout']);
  });

  it('a claimed read never lowers the derived class', () => {
    expect(classifyAction({ role: 'link', href: '/x', claimedClass: 'read' }).safetyClass).toBe(
      'read',
    );
    expect(classifyAction({ role: 'button', name: 'Usuń', claimedClass: 'read' }).safetyClass).toBe(
      'destructive',
    );
  });
});
