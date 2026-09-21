import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ConfigError } from './errors.js';

/** Read and YAML-parse a config file; every failure is a ConfigError naming the file. */
export function readYaml(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    throw new ConfigError(file, [
      `cannot read file (${(e as NodeJS.ErrnoException).code ?? 'error'})`,
    ]);
  }
  try {
    return parse(text);
  } catch (e) {
    throw new ConfigError(file, [`invalid YAML: ${(e as Error).message.split('\n')[0]}`]);
  }
}
