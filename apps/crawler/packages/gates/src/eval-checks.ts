// Spec 014 US1 (D1–D4): pure helpers behind the eval's crawl_screens, password_hits and widget_actions.

export interface GtScreen {
  id: string;
  route_template: string;
  guest_visible: boolean;
  actor?: string;
}

const pct = (matched: number, total: number): number =>
  total === 0 ? 0 : Math.round((matched / total) * 1000) / 10;

/**
 * Parameter names are free text on both sides (the crawler writes `:param`, ground truth
 * `:slug`), so a route is compared with every `:name` reduced to `:` (spec 014 F-06).
 */
const routeKey = (route: string): string => route.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':');

/** D1/D2: screens for the persona (guest → guest_visible; else a non-guest actor), route match. */
export function crawlScreens(
  screens: readonly GtScreen[],
  recordedRoutes: readonly string[],
  loggedIn: boolean,
): { matched: number; total: number; pct: number; missing: string[] } {
  const wanted = screens.filter((s) =>
    loggedIn ? s.actor !== undefined && s.actor !== 'guest' : s.guest_visible,
  );
  const seen = new Set(recordedRoutes.map(routeKey));
  const missing = wanted.filter((s) => !seen.has(routeKey(s.route_template))).map((s) => s.id);
  const matched = wanted.length - missing.length;
  return { matched, total: wanted.length, pct: pct(matched, wanted.length), missing };
}

export interface SweepPlace {
  place: string;
  text: string;
}

/** Secrets shorter than this would match almost anywhere. */
const MIN_SECRET_LENGTH = 4;

const countOccurrences = (text: string, needle: string): number => text.split(needle).length - 1;

/** D3: occurrences of each secret per place; the secret itself is never returned. */
export function passwordHits(
  places: readonly SweepPlace[],
  secrets: readonly string[],
): { total: number; byPlace: Record<string, number> } {
  const usable = secrets.filter((s) => s.length >= MIN_SECRET_LENGTH);
  const byPlace: Record<string, number> = {};
  let total = 0;
  for (const { place, text } of places) {
    const hits = usable.reduce((sum, s) => sum + countOccurrences(text, s), 0);
    if (hits > 0) {
      byPlace[place] = (byPlace[place] ?? 0) + hits;
      total += hits;
    }
  }
  return { total, byPlace };
}

const WIDGET_CALLS = ['/widget/recaptcha/api2/userverify', '/widget/recaptcha/api2/payload'];

/** D4: edge actions that touch the captcha widget, plus action-caused widget calls. */
export function widgetActions(input: {
  edgeActions: readonly string[];
  actionCalls: readonly string[];
}): number {
  const edges = input.edgeActions.filter((a) => {
    const lower = a.toLowerCase();
    return lower.includes('recaptcha') || lower.includes('127.0.0.1:4101');
  }).length;
  const calls = input.actionCalls.filter((u) => WIDGET_CALLS.some((w) => u.includes(w))).length;
  return edges + calls;
}
