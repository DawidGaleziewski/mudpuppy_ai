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
 * `:slug`), so a route is compared with every `:name` reduced to `:` (spec 014 F-06). Ground-truth
 * routes never hold a query, while a crawled hash route may keep one
 * (`#/szkody/potwierdzenie?nr=…`): the query is not part of the screen (spec 015 F-18; query
 * parameters are recorded on their own by R-37).
 */
const routeKey = (route: string): string =>
  route.replace(/\?.*$/, '').replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':');

/**
 * Routes of the frames the crawler read (spec 015, LO-02/LO-04): a legacy page shown inside a
 * wrapper iframe or a frameset is recorded as part of the outer state, whose route is the outer
 * page's; its own URL is in the observation's page composition. A frame URL counts as its path
 * without path parameters (`;jsessionid=…`, LO-24) and without the query. Frames that were not
 * read (cross-origin, failed) do not count. Unparseable compositions are skipped.
 */
export function frameRoutes(compositions: readonly (string | null)[]): string[] {
  const out = new Set<string>();
  for (const raw of compositions) {
    if (raw === null) continue;
    let frames: { url?: unknown; observed?: unknown }[];
    try {
      frames = (JSON.parse(raw) as { frames?: typeof frames }).frames ?? [];
    } catch {
      continue;
    }
    for (const f of frames) {
      if (f.observed !== true || typeof f.url !== 'string') continue;
      try {
        const u = new URL(f.url);
        if (u.protocol === 'http:' || u.protocol === 'https:')
          out.add(u.pathname.replace(/;[^/]*/g, ''));
      } catch {
        // about:srcdoc and the like have no route
      }
    }
  }
  return [...out];
}

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

/** D4: transition actions that touch the captcha widget, plus action-caused widget calls. */
export function widgetActions(input: {
  transitionActions: readonly string[];
  actionCalls: readonly string[];
}): number {
  const transitions = input.transitionActions.filter((a) => {
    const lower = a.toLowerCase();
    return lower.includes('recaptcha') || lower.includes('127.0.0.1:4101');
  }).length;
  const calls = input.actionCalls.filter((u) => WIDGET_CALLS.some((w) => u.includes(w))).length;
  return transitions + calls;
}
