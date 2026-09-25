export interface ResponseInfo {
  url: string;
  status: number;
  headers?: Record<string, string>;
  /** Response body for HTML/text responses; omit for binary. */
  body?: string;
}

export type BlockKind = 'http_403' | 'http_429' | 'captcha' | 'portal_signature';

export interface BlockVerdict {
  blocked: boolean;
  kind?: BlockKind;
  /** Human-readable warning stored on the run (FR-008). */
  warning?: string;
}

/**
 * Markers of a CAPTCHA / bot challenge actually shown to the visitor (widget or challenge iframe).
 * Matched case-insensitively in the body, on any status.
 */
export const CAPTCHA_MARKERS: readonly string[] = [
  'g-recaptcha',
  'recaptcha/api2/anchor',
  'recaptcha/enterprise/anchor',
  'hcaptcha.com/captcha',
  'h-captcha',
  'cf-turnstile',
  'px-captcha',
  'geo.captcha-delivery.com',
];

/**
 * Vendor loader scripts that also sit on normal pages (invisible reCAPTCHA v3 scoring forms, a DataDome
 * or Turnstile tag). They count as a block only on a non-2xx response, never on a normal page.
 */
export const CAPTCHA_SCRIPT_MARKERS: readonly string[] = [
  'google.com/recaptcha',
  'recaptcha/api',
  'hcaptcha.com',
  'challenges.cloudflare.com',
  'datadome',
];

/** Detect a block (never a normal 200 or a plain 404). No bypass is ever attempted (FR-008). */
export function detectBlock(
  res: ResponseInfo,
  portalSignatures: readonly string[] = [],
): BlockVerdict {
  if (res.status === 403) {
    return {
      blocked: true,
      kind: 'http_403',
      warning: `HTTP 403 from ${res.url}: access refused, stopping the run`,
    };
  }
  if (res.status === 429) {
    const retry = res.headers?.['retry-after'] ?? res.headers?.['Retry-After'];
    return {
      blocked: true,
      kind: 'http_429',
      warning: `HTTP 429 from ${res.url}: rate limited${retry ? ` (Retry-After ${retry})` : ''}, stopping the run`,
    };
  }
  const body = res.body?.toLowerCase();
  if (body) {
    const ok = res.status >= 200 && res.status < 300;
    const marker =
      CAPTCHA_MARKERS.find((m) => body.includes(m)) ??
      (ok ? undefined : CAPTCHA_SCRIPT_MARKERS.find((m) => body.includes(m)));
    if (marker) {
      return {
        blocked: true,
        kind: 'captcha',
        warning: `CAPTCHA/bot challenge (${marker}) at ${res.url}, stopping the run`,
      };
    }
    const sig = portalSignatures.find((s) => body.includes(s.toLowerCase()));
    if (sig) {
      return {
        blocked: true,
        kind: 'portal_signature',
        warning: `portal block signature "${sig}" at ${res.url}, stopping the run`,
      };
    }
  }
  return { blocked: false };
}
