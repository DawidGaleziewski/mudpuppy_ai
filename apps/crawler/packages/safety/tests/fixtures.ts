import { readFileSync } from 'node:fs';
import type { SafetyClass } from '@pathfinder/core';
import type { ActionDescriptor, ResponseInfo } from '../src/index.js';

const FIXTURES = new URL('../../../tests/fixtures/', import.meta.url);

export interface LabeledAction {
  id: string;
  expected: SafetyClass;
  descriptor: ActionDescriptor;
}

export const labeledActions: LabeledAction[] = JSON.parse(
  readFileSync(new URL('actions/actions.json', FIXTURES), 'utf8'),
);

interface Har {
  log: {
    entries: {
      request: { url: string };
      response: {
        status: number;
        headers: { name: string; value: string }[];
        content: { text?: string };
      };
    }[];
  };
}

/** Turn the first entry of a HAR fixture into the detector's input. */
export function responseFromHar(name: string): ResponseInfo {
  const har: Har = JSON.parse(readFileSync(new URL(`har/${name}`, FIXTURES), 'utf8'));
  const e = har.log.entries[0]!;
  return {
    url: e.request.url,
    status: e.response.status,
    headers: Object.fromEntries(e.response.headers.map((h) => [h.name, h.value])),
    body: e.response.content.text,
  };
}
