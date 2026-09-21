/**
 * Pure PII scrubber (FR-014). Regex/type-based masking; output is deterministic (fixed placeholders).
 * Applied to every ARIA snapshot and network shape record BEFORE it is written to evidence.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi;
// Long hex/base64url-ish secrets. Requires a digit and a letter so plain words are never masked.
const LONG_TOKEN = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g;
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
// International (+48 601 234 567) and grouped national numbers (601-234-567, 601 234 567, 12 345 67 89).
const PHONE_INTL = /(?<![\w/])(?:\+|00)\d{1,3}[ .-]?(?:\d[ .-]?){7,11}\d(?!\w)/g;
const PHONE_GROUPED = /(?<![\w/.-])\d{3}[ -]\d{3}[ -]\d{3}(?![\w/-])/g;
// Names: greeting + capitalised words, or an explicit name label.
const NAME_WORD = "\\p{Lu}[\\p{L}'-]+";
const NAME_AFTER_GREETING = new RegExp(
  `((?:Cześć|Czesc|Witaj|Witamy|Hej|Hello|Hi|Dzień dobry),?\\s+)${NAME_WORD}(?:\\s+${NAME_WORD}){0,2}`,
  'gu',
);
const NAME_AFTER_LABEL = new RegExp(
  `((?:Imię i nazwisko|Imię|Nazwisko|Name|Full name|First name|Last name)\\s*:\\s*)${NAME_WORD}(?:\\s+${NAME_WORD}){0,2}`,
  'gu',
);

export const MASK = {
  email: '[email]',
  phone: '[phone]',
  token: '[token]',
  card: '[card]',
  name: '[name]',
  redacted: '[redacted]',
} as const;

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function maskCards(text: string): string {
  return text.replace(CARD, (m) => {
    const digits = m.replace(/\D/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? MASK.card : m;
  });
}

/** Mask PII in free text. Order matters: tokens and emails before phones and cards. */
export function maskText(text: string): string {
  return maskCards(
    text
      .replace(JWT, MASK.token)
      .replace(BEARER, `Bearer ${MASK.token}`)
      .replace(EMAIL, MASK.email)
      .replace(LONG_TOKEN, MASK.token),
  )
    .replace(PHONE_INTL, MASK.phone)
    .replace(PHONE_GROUPED, MASK.phone)
    .replace(NAME_AFTER_GREETING, `$1${MASK.name}`)
    .replace(NAME_AFTER_LABEL, `$1${MASK.name}`);
}

const SENSITIVE_KEY =
  /^(?:e-?mail|phone|tel(?:ephone)?|mobile|password|passwd|pass|token|access_?token|refresh_?token|id_?token|secret|api_?key|authorization|cookie|session(?:_?id)?|first_?name|last_?name|full_?name|name|pesel|iban|card(?:_?number)?)$/i;

/** Type tags a shape record may legitimately hold as leaves (`string`, `number`, `array<string>`, ...). */
const TYPE_TAG =
  /^(?:string|number|integer|boolean|null|object|unknown|any|array(?:<.*>)?|\[\]|\{\})$/;

/** Deep-mask a JSON value: values via {@link maskText}; values under sensitive keys are redacted. */
export function scrubJson(value: unknown): unknown {
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) return value.map(scrubJson);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        SENSITIVE_KEY.test(k) && typeof v !== 'object' && !TYPE_TAG.test(String(v))
          ? MASK.redacted
          : scrubJson(v);
    }
    return out;
  }
  return value;
}

/**
 * True when a payload that should be shape-only (`req_schema`/`res_schema`) carries real values:
 * PII in any string, a value under a sensitive key that is not a type tag, or a literal
 * number/boolean under a sensitive key.
 */
export function looksLikeRawPayload(value: unknown): boolean {
  if (typeof value === 'string') return maskText(value) !== value;
  if (Array.isArray(value)) return value.some(looksLikeRawPayload);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => {
      if (
        SENSITIVE_KEY.test(k) &&
        v !== null &&
        typeof v !== 'object' &&
        !(typeof v === 'string' && TYPE_TAG.test(v))
      ) {
        return true;
      }
      return looksLikeRawPayload(v);
    });
  }
  return false;
}
