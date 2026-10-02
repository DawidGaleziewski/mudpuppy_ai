/**
 * The portal's business rules as pure functions. `ground-truth.json` describes them; the tests
 * check the served pages against both. "Today" is fixed so age and date rules never drift.
 */

export const TODAY = '2026-01-15';
export const CURRENT_YEAR = 2026;

export const MIN_DRIVER_AGE = 18;
export const MAX_DRIVER_AGE = 75;
export const MIN_PRODUCTION_YEAR = 1990;
export const AC_MAX_VEHICLE_AGE = 15; // AC only for vehicles younger than this many years
export const NO_CLAIMS_YEARS = 5;
export const NO_CLAIMS_DISCOUNT = 0.1;
export const MAX_TRAVEL_DAYS = 90;
export const POSTCODE_PATTERN = '[0-9]{2}-[0-9]{3}';
export const DISCOUNT_CODE_PATTERN = '[A-Z]+[0-9]{2}';
export const ACTIVE_DISCOUNT_CODES: Readonly<Record<string, number>> = { WIOSNA10: 0.1 };

export const BASE_OC = 800;
export const BASE_AC = 1200;
export const ASSISTANCE_PRICE = 99;
export const TRAVEL_DAILY_RATE: Readonly<Record<string, number>> = { europa: 12, swiat: 25 };

/** Full years between an ISO birth date and TODAY. */
export function ageOn(birthIso: string, todayIso: string = TODAY): number {
  const [by, bm, bd] = birthIso.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = todayIso.split('-').map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Birth-date bounds for the `min`/`max` attributes of the date input. */
export function birthDateBounds(): { min: string; max: string } {
  // Oldest allowed: turns 76 tomorrow → born the day after TODAY minus 76 years.
  return { min: `${CURRENT_YEAR - MAX_DRIVER_AGE - 1}-01-16`, max: `${CURRENT_YEAR - MIN_DRIVER_AGE}-01-15` };
}

export function ageFactor(age: number): number {
  if (age <= 25) return 1.5;
  if (age <= 65) return 1.0;
  return 1.3;
}

export function engineFactor(cc: number): number {
  if (cc <= 1400) return 0.9;
  if (cc <= 2000) return 1.0;
  return 1.25;
}

export function acAllowed(productionYear: number): boolean {
  return CURRENT_YEAR - productionYear < AC_MAX_VEHICLE_AGE;
}

export interface PremiumInput {
  scope: 'oc' | 'oc_ac';
  age: number;
  engineCc: number;
  noClaimsYears: number;
  assistance: boolean;
  discountCode: string;
}

export interface PremiumLine {
  label: string;
  value: string;
}

export interface Premium {
  base: number;
  ageFactor: number;
  engineFactor: number;
  noClaimsDiscount: number;
  assistance: number;
  codeDiscount: number;
  codeMessage: string | null;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function premium(i: PremiumInput): Premium {
  const base = BASE_OC + (i.scope === 'oc_ac' ? BASE_AC : 0);
  const af = ageFactor(i.age);
  const ef = engineFactor(i.engineCc);
  const subtotal = base * af * ef;
  const noClaims = i.noClaimsYears >= NO_CLAIMS_YEARS ? round2(subtotal * NO_CLAIMS_DISCOUNT) : 0;
  const afterNoClaims = subtotal - noClaims;
  const rate = i.discountCode ? ACTIVE_DISCOUNT_CODES[i.discountCode] : undefined;
  const codeDiscount = rate ? round2(afterNoClaims * rate) : 0;
  const codeMessage = !i.discountCode
    ? null
    : rate
      ? `Kod rabatowy ${i.discountCode} przyjęty`
      : 'Kod rabatowy nie jest aktywny';
  const assistance = i.assistance ? ASSISTANCE_PRICE : 0;
  return {
    base,
    ageFactor: af,
    engineFactor: ef,
    noClaimsDiscount: noClaims,
    assistance,
    codeDiscount,
    codeMessage,
    total: round2(afterNoClaims - codeDiscount + assistance),
  };
}

/** Inclusive day count between two ISO dates. */
export function travelDays(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

export function matches(pattern: string, v: string): boolean {
  return new RegExp(`^(?:${pattern})$`).test(v);
}
