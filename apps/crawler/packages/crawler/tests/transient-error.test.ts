import { describe, expect, it } from 'vitest';
import { transientError } from '../src/transient-error.js';

describe('transientError (spec 030 FR-043, SC-17)', () => {
  it('flags a 500, 502, 503 or 504 main document', () => {
    for (const status of [500, 502, 503, 504])
      expect(transientError({ status, text: 'anything' })).toBe('http_5xx');
    expect(transientError({ status: 501, text: '' })).toBeNull();
    expect(transientError({ status: 404, text: 'Not found' })).toBeNull();
  });

  it('flags a short 200 page that only reports a technical error, in EN, DE and PL', () => {
    expect(transientError({ status: 200, text: 'Error\nA technical error has occurred.' })).toBe(
      'soft_error',
    );
    expect(transientError({ text: 'Ein technischer Fehler ist aufgetreten.' })).toBe('soft_error');
    expect(transientError({ text: 'Błąd techniczny. Spróbuj ponownie później.' })).toBe(
      'soft_error',
    );
  });

  it('leaves a normal page alone, also a long one that mentions an outage', () => {
    expect(transientError({ status: 200, text: 'Policies overview with 3 entries' })).toBeNull();
    const faq = `What if the service is temporarily unavailable? ${'Long answer. '.repeat(80)}`;
    expect(transientError({ status: 200, text: faq })).toBeNull();
  });

  it('takes the portal’s own phrases', () => {
    expect(transientError({ text: 'Wartungsarbeiten bis 14 Uhr' }, ['Wartungsarbeiten'])).toBe(
      'soft_error',
    );
  });
});
