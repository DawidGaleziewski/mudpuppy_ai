/**
 * Code-based graders of one grouping trial (spec 038 FR-002, R-78 (5)): the assistant's suggested
 * processes against the ground-truth processes the scans could observe. Outcome only: the open
 * `grouping_suggestions` at the end of the trial.
 */
import type { GtProcess } from '../../tasks.js';
import type { Suggestion } from '../../queries.js';

export interface Score {
  matched: number;
  total: number;
  pct: number;
}

export interface GroupingGrades {
  scores: {
    /** Ground-truth processes (observable in the store) that a suggestion covers. */
    processes_found: Score;
    /** Covering suggestions whose first screen is the process's own first screen (R-77). */
    clean_starts: Score;
    /** Suggestions whose `why` quotes a followed link or button, or a route. */
    why_cites: Score;
  };
  checks: {
    suggestions: number;
    /** Covering suggestions beyond one per process. */
    duplicates: number;
    /** Suggestions of a single screen. */
    stubs: number;
    /** Suggestions with an error page (technical state) among their screens. */
    error_screens_inside: number;
    /** Screens inside covering suggestions that are no step of the process (navigation). */
    extra_screens: number;
    /** Suggestions that cover no ground-truth process. */
    unmatched: number;
  };
  /** Per ground-truth process: which suggestion covered it, or why none could. */
  detail: Record<string, string>;
}

export interface GradeInput {
  processes: GtProcess[];
  suggestions: Suggestion[];
  recorded: Set<string>;
  technical: Set<string>;
  followed: Set<string>;
}

const score = (matched: number, total: number): Score => ({
  matched,
  total,
  pct: total === 0 ? 0 : Math.round((matched / total) * 1000) / 10,
});

/** `steps` holds every route of `wanted` in that order (other screens may lie between them). */
export function inOrder(steps: readonly string[], wanted: readonly string[]): boolean {
  let at = 0;
  for (const route of steps) if (route === wanted[at]) at++;
  return at === wanted.length;
}

/** A suggestion covers a process when its screens walk every observable step in order. */
export function covers(s: Suggestion, p: GtProcess): boolean {
  return inOrder(
    s.steps.map((x) => x.route),
    p.observable,
  );
}

function citesLinks(s: Suggestion, followed: Set<string>): boolean {
  const why = s.why;
  if (s.steps.some((x) => x.route.length > 1 && why.includes(x.route))) return true;
  return [...followed].some((name) => why.includes(name));
}

export function scoreGrouping(input: GradeInput): GroupingGrades {
  const { processes, suggestions } = input;
  // Only what the scans saw can be grouped: a process whose first screen no scan recorded is left
  // out of the denominator and named in the detail.
  const observable = processes.filter((p) => input.recorded.has(p.firstRoute));
  const detail: Record<string, string> = {};
  let found = 0;
  let cleanStarts = 0;
  let covering = 0;
  let duplicates = 0;
  let extra = 0;
  const used = new Set<Suggestion>();
  for (const p of processes) {
    if (!observable.includes(p)) {
      detail[p.id] = `not in the store (no scan recorded ${p.firstRoute})`;
      continue;
    }
    const by = suggestions.filter((s) => covers(s, p));
    by.forEach((s) => used.add(s));
    if (by.length === 0) {
      detail[p.id] = 'no suggestion covers it';
      continue;
    }
    found++;
    covering += by.length;
    duplicates += by.length - 1;
    for (const s of by) {
      if (s.steps[0]?.route === p.firstRoute) cleanStarts++;
      // A later step the scans happened to reach (the purchase's page) is a step, not extra.
      extra += s.steps.filter((x) => !p.steps.includes(x.route)).length;
    }
    detail[p.id] = by.map((s) => `"${s.name}"`).join(', ');
  }
  return {
    scores: {
      processes_found: score(found, observable.length),
      clean_starts: score(cleanStarts, covering),
      why_cites: score(
        suggestions.filter((s) => citesLinks(s, input.followed)).length,
        suggestions.length,
      ),
    },
    checks: {
      suggestions: suggestions.length,
      duplicates,
      stubs: suggestions.filter((s) => s.steps.length === 1).length,
      error_screens_inside: suggestions.filter((s) =>
        s.steps.some((x) => x.state_id !== null && input.technical.has(x.state_id)),
      ).length,
      extra_screens: extra,
      unmatched: suggestions.filter((s) => !used.has(s)).length,
    },
    detail,
  };
}
