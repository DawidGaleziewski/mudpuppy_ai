import { describe, expect, it } from 'vitest';
import { detectBlock } from '../src/index.js';
import { responseFromHar } from './fixtures.js';

describe('detectBlock', () => {
  it('detects HTTP 403 and 429', () => {
    expect(detectBlock(responseFromHar('forbidden-403.har'))).toMatchObject({
      blocked: true,
      kind: 'http_403',
    });
    const r = detectBlock(responseFromHar('too-many-429.har'));
    expect(r).toMatchObject({ blocked: true, kind: 'http_429' });
    expect(r.warning).toContain('Retry-After 120');
  });

  it('detects CAPTCHA vendor iframe/form markers on a 200', () => {
    expect(detectBlock(responseFromHar('captcha-recaptcha.har'))).toMatchObject({
      blocked: true,
      kind: 'captcha',
    });
    expect(detectBlock(responseFromHar('captcha-hcaptcha.har'))).toMatchObject({
      blocked: true,
      kind: 'captcha',
    });
  });

  it('does not flag vendor loader scripts on a normal 200 page', () => {
    // Invisible reCAPTCHA v3 loaded site-wide to score forms: never a challenge by itself.
    const page = (extra: string) => ({
      url: 'https://shop.pl/',
      status: 200,
      body: `<html><head>${extra}</head><body><h1>Oferta</h1></body></html>`,
    });
    for (const tag of [
      '<script src="https://www.google.com/recaptcha/api.js?render=KEY" async defer></script>',
      '<script src="https://js.hcaptcha.com/1/api.js" async></script>',
      '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>',
      '<script src="https://js.datadome.co/tags.js" async></script>',
    ]) {
      expect(detectBlock(page(tag)).blocked).toBe(false);
    }
  });

  it('still flags a loader script on a non-2xx response and a visible widget on a 200', () => {
    const script = '<script src="https://www.google.com/recaptcha/api.js"></script>';
    expect(
      detectBlock({ url: 'https://shop.pl/', status: 503, body: `<html>${script}</html>` }),
    ).toMatchObject({ blocked: true, kind: 'captcha' });
    for (const widget of [
      '<div class="cf-turnstile" data-sitekey="x"></div>',
      '<iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=x"></iframe>',
      '<div id="px-captcha"></div>',
    ]) {
      expect(
        detectBlock({ url: 'https://shop.pl/', status: 200, body: `<html>${widget}</html>` }),
      ).toMatchObject({ blocked: true, kind: 'captcha' });
    }
  });

  it('detects a portal-configured block signature, case-insensitively', () => {
    const res = responseFromHar('custom-signature.har');
    expect(detectBlock(res).blocked).toBe(false);
    expect(detectBlock(res, ['NIETYPOWY RUCH'])).toMatchObject({
      blocked: true,
      kind: 'portal_signature',
    });
  });

  it('does not flag a normal 200 or a 404', () => {
    expect(detectBlock(responseFromHar('ok-200.har'), ['nietypowy ruch']).blocked).toBe(false);
    expect(detectBlock(responseFromHar('not-found-404.har')).blocked).toBe(false);
    expect(detectBlock(responseFromHar('article-about-captcha-200.har')).blocked).toBe(false);
  });

  it('always yields a warning naming the URL when blocked', () => {
    expect(detectBlock(responseFromHar('forbidden-403.har')).warning).toContain(
      'marketsite.example',
    );
  });
});
