/**
 * Read a ground-truth file into the evaluator's input type. Ground truth is written in YAML
 * (G-34); YAML 1.2 is a superset of JSON, so an older `.json` file still reads.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { GroundTruth } from './evaluate.js';

export function readGroundTruth(path: string): GroundTruth {
  return GroundTruth.parse(parse(readFileSync(path, 'utf8')));
}
