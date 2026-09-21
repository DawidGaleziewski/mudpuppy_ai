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

/** Vendor markers of a CAPTCHA / bot challenge page. Matched case-insensitively in the body. */
export const CAPTCHA_MARKERS: readonly string[] = [
  'g-recaptcha',
  'google.com/recaptcha',
  'recaptcha/api',
  'hcaptcha.com',
  'h-captcha',
  'challenges.cloudflare.com',
  'cf-turnstile',
  'datadome',
  'px-captcha',
  'geo.captcha-delivery.com',
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
    const marker = CAPTCHA_MARKERS.find((m) => body.includes(m));
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
