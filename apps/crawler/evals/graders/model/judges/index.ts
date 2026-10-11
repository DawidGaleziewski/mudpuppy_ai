/**
 * Every judge the evals run. Adding one: its file in this folder and one line here
 * (contracts/judge-definition.md); nothing else changes.
 */
import type { JudgeDefinition } from '../definition.js';
import { glossaryTerms } from './glossary-terms.js';

export const JUDGES: readonly JudgeDefinition[] = [glossaryTerms];

export function judgeById(id: string): JudgeDefinition | undefined {
  return JUDGES.find((j) => j.id === id);
}
