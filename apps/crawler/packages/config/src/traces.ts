// A portal's trace catalogue (spec 030 R-64, field pattern "03"): `portals/<id>/traces.yaml` names
// the processes to drive to their end, with the fields to fill by their visible labels, the
// controls that move a multi-step form on, and variants (the happy path, each validation error).
// A process known to exist but not mapped yet is a stub (`to_be_discovered: true`, no steps).

import { existsSync } from 'node:fs';
import { ProbeFault } from '@pathfinder/core';
import { z } from 'zod';
import { ConfigError, zodProblems } from './errors.js';
import { readYaml } from './read.js';

export const TraceStep = z
  .object({
    /** The control's accessible name (its label), as the crawler lists it. */
    name: z.string().min(1),
    kind: z.enum(['fill', 'select', 'check', 'click']),
    /** Synthetic value for fill/select (a select takes the visible option label). */
    value: z.string().optional(),
    intent: z.string().min(1),
  })
  .strict()
  .refine((s) => (s.kind === 'fill' || s.kind === 'select') === (s.value !== undefined), {
    message: 'fill and select take a value; check and click do not',
  });
export type TraceStep = z.infer<typeof TraceStep>;

export const TraceVariant = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    /**
     * `proceed`: the form gets past its submit; `validation_error`: it refuses (messages kept);
     * `technical_error`: a simulated fault shows an error (spec 032); `branch`: an option leads
     * somewhere else than the happy path.
     */
    expect: z.enum(['proceed', 'validation_error', 'technical_error', 'branch']),
    /** Replaces the trace's steps for this variant (e.g. a required field left out). */
    steps: z.array(TraceStep).optional(),
    /**
     * A technical fault the browser simulates on the request the variant's last action sends
     * (spec 032 plan decision 8): nothing malformed ever reaches the server.
     */
    fault: ProbeFault.optional(),
    /** The form probe this variant came from (spec 032 US3), for the reader; not used to drive. */
    probe: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => (v.expect === 'technical_error') === (v.fault !== undefined), {
    message: 'a technical_error variant needs a fault, and only it takes one',
  });
export type TraceVariant = z.infer<typeof TraceVariant>;

export const TraceSpecEntry = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1),
    goal: z.string().min(1),
    /** The page the process starts on (absolute, or a path on the portal's base URL). */
    start_url: z.string().min(1),
    to_be_discovered: z.boolean().default(false),
    steps: z.array(TraceStep).default([]),
    /** The controls that move a multi-step form on, pressed in order after the steps. */
    advance: z.array(z.string().min(1)).default([]),
    /** The final, irreversible control; the persona's limit decides whether it is pressed. */
    submit: z.string().min(1).optional(),
    variants: z.array(TraceVariant).default([{ id: 'happy-path', expect: 'proceed' }]),
  })
  .strict()
  .refine((t) => t.to_be_discovered || t.steps.length > 0 || t.advance.length > 0 || t.submit, {
    message: 'a trace needs steps, advance or submit unless it is to_be_discovered',
  });
export type TraceSpecEntry = z.infer<typeof TraceSpecEntry>;

export const TracesFile = z.object({ traces: z.array(TraceSpecEntry) }).strict();
export type TracesFile = z.infer<typeof TracesFile>;

/** The catalogue of `file`; an absent file is an empty catalogue, a bad one a `ConfigError`. */
export function loadTraces(file: string): TraceSpecEntry[] {
  if (!existsSync(file)) return [];
  const parsed = TracesFile.safeParse(readYaml(file));
  if (!parsed.success) throw new ConfigError(file, zodProblems(parsed.error));
  const ids = new Set<string>();
  for (const t of parsed.data.traces) {
    if (ids.has(t.id)) throw new ConfigError(file, [`traces: duplicate id ${t.id}`]);
    ids.add(t.id);
  }
  return parsed.data.traces;
}
