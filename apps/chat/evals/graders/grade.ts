/** Run every grader over one finished trial's store (outcome only). */
import type BetterSqlite3 from 'better-sqlite3';
import type { GtProcess } from '../tasks.js';
import { followedNames, openSuggestions, recordedRoutes, technicalStates } from '../queries.js';
import { scoreGrouping, type GroupingGrades } from './code/grouping.js';

export function grade(raw: BetterSqlite3.Database, portal: string, processes: GtProcess[]) {
  const suggestions = openSuggestions(raw, portal);
  const grades: GroupingGrades = scoreGrouping({
    processes,
    suggestions,
    recorded: recordedRoutes(raw, portal),
    technical: technicalStates(raw, portal),
    followed: followedNames(raw, portal),
  });
  return { grades, suggestions };
}
