// Technical probes (spec 032 US2.1, owner answer O-M1): the happy-path values, and the request the
// step's control sends is broken in the crawler's own browser (aborted, answered with HTTP 500,
// held, or the browser goes offline). Nothing malformed reaches the server. They run wherever the
// action limit allows the submit, production included.

import type { ProbeFault } from '@pathfinder/core';
import { defineProbe, type ProbeTry } from '../define.js';

const technical = (id: string, fault: ProbeFault, summary: string) =>
  defineProbe({
    id,
    group: 'technical',
    summary,
    scars: ['SC-19'],
    tries: (): ProbeTry[] => [
      {
        key: id,
        probe: id,
        group: 'technical',
        target: 'the request the step sends',
        writes: [],
        fault,
        summary,
      },
    ],
  });

export const blockRequest = technical(
  'block-request',
  'block_request',
  'Block the request the step sends',
);
export const http500 = technical(
  'http-500',
  'http_500',
  'Answer the request the step sends with HTTP 500',
);
export const delay = technical(
  'delay',
  'delay',
  'Hold the request the step sends (up to 30 s) and look at the page meanwhile',
);
export const offline = technical('offline', 'offline', 'Go offline when the step is submitted');
