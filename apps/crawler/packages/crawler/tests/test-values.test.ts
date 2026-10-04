import { describe, expect, it } from 'vitest';
import { testValueFor, type AutofillField } from '../src/test-values.js';

const field = (over: Partial<AutofillField>): AutofillField => ({
  index: 0,
  tag: 'input',
  type: 'text',
  name: 'f',
  label: 'F',
  required: true,
  empty: true,
  ...over,
});

describe('testValueFor (spec 008 research R9)', () => {
  it('gives obviously synthetic values per type', () => {
    expect(testValueFor(field({ type: 'email' }))).toBe('test@example.test');
    expect(testValueFor(field({ type: 'tel' }))).toBe('500000000');
    expect(testValueFor(field({ type: 'url' }))).toBe('https://example.test/');
    expect(testValueFor(field({ type: 'password' }))).toBe('Test-Pass-1');
    expect(testValueFor(field({ type: 'text' }))).toBe('Test');
    expect(testValueFor(field({ tag: 'textarea', type: 'textarea' }))).toBe(
      'Test message, please ignore.',
    );
    expect(testValueFor(field({ type: 'date' }))).toBe('2000-01-01');
  });

  it('keeps numbers and dates inside their limits', () => {
    expect(testValueFor(field({ type: 'number', min: '1990', max: '2026' }))).toBe('1990');
    expect(testValueFor(field({ type: 'number', max: '0' }))).toBe('0');
    expect(testValueFor(field({ type: 'number' }))).toBe('1');
    expect(testValueFor(field({ type: 'date', min: '2026-03-01' }))).toBe('2026-03-01');
    expect(testValueFor(field({ type: 'date', max: '1999-12-31' }))).toBe('1999-12-31');
  });

  it('finds a candidate that matches the pattern and respects lengths', () => {
    expect(testValueFor(field({ pattern: '[0-9]{2}-[0-9]{3}' }))).toBe('00-950');
    expect(testValueFor(field({ type: 'tel', pattern: '\\+?[0-9 ]{9,15}' }))).toBe('500000000');
    expect(testValueFor(field({ maxlength: 2 }))).toBe('Te');
    expect(testValueFor(field({ minlength: 6 }))).toBe('Testxx');
  });

  it('picks the first real option of a select, or the persona’s option', () => {
    const options = [
      { value: '', text: '— wybierz —', disabled: false },
      { value: 'toyota', text: 'Toyota', disabled: false },
      { value: 'skoda', text: 'Skoda', disabled: false },
    ];
    expect(testValueFor(field({ tag: 'select', type: 'select', options }))).toBe('toyota');
    expect(testValueFor(field({ tag: 'select', type: 'select', options }), 'Skoda')).toBe('skoda');
    const noValues = [
      { value: 'x', text: 'Wybierz…', disabled: false },
      { value: 'y', text: 'Tak', disabled: false },
    ];
    expect(testValueFor(field({ tag: 'select', type: 'select', options: noValues }))).toBe('y');
  });

  it('checks required checkboxes and one radio per group, leaves the rest', () => {
    expect(testValueFor(field({ type: 'checkbox' }))).toBe(true);
    expect(testValueFor(field({ type: 'checkbox', required: false }))).toBeNull();
    expect(testValueFor(field({ type: 'radio', group: 'g' }))).toBe(true);
    expect(testValueFor(field({ type: 'radio', group: 'g', empty: false }))).toBeNull();
  });

  it('uses the persona value, leaves filled fields and file inputs alone', () => {
    expect(testValueFor(field({}), 'Testowy')).toBe('Testowy');
    expect(testValueFor(field({ empty: false }))).toBeNull();
    expect(testValueFor(field({ type: 'file' }))).toBeNull();
  });

  it('is deterministic', () => {
    const f = field({ type: 'number', min: '50', max: '8000' });
    expect(testValueFor(f)).toBe(testValueFor({ ...f }));
  });
});
