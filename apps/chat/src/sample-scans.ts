// `request_sample_scans` (spec 080 FR-006, R-98 (4), R-33 US4.2): scan a sample of the portal's
// personas from the chat, one after another. The sample is `pnpm personas:sample`'s (one persona
// per distinct attribute combination, plus the pairs that differ in one attribute). Every chosen
// persona is checked before the first scan, so a missing credential is asked for once, up front.
// Stateless: each call hands off the next persona that has no finished scan in the environment
// since the batch began (`since`, returned by the first call); one scan at a time, as always.

import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { z } from 'zod';
import {
  ConfigError,
  Environment,
  loadPersona,
  samplePersonas,
  type PersonaSample,
} from '@mudpuppy/config';
import { checkScanTarget, requestScan, ScanRefusal, type ScanHandoff } from './scan.js';
import { listPersonas, type WorkspacePaths } from './workflow-data.js';

export const RequestSampleScansInput = z
  .object({
    portal: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    environment: Environment.optional(),
    /** The personas to scan; left out: the portal's sample. */
    personas: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9_/-]*$/))
      .min(1)
      .max(50)
      .optional(),
    /** The batch's start, as the first call returned it; left out: a new batch starts now. */
    since: z.iso.datetime().optional(),
    allow_writes: z.boolean().optional(),
    skip_images: z.boolean().optional(),
  })
  .strict();
export type RequestSampleScansInput = z.input<typeof RequestSampleScansInput>;

export interface SampleScans {
  portal: string;
  environment: Environment;
  since: string;
  /** Why these personas: the sample (when proposed here), else null. */
  sample: Pick<PersonaSample, 'chosen' | 'pairs' | 'left_out'> | null;
  personas: string[];
  done: string[];
  /** The next scan's hand-off; null when the batch is complete. */
  next: { persona: string; handoff: ScanHandoff['handoff'] } | null;
  remaining: string[];
  complete: boolean;
}

/** The portal's sample, from every persona file that loads (one that does not is left out). */
function proposeSample(paths: WorkspacePaths, portal: string): PersonaSample {
  const personas = listPersonas(paths, portal).flatMap((id) => {
    try {
      const p = loadPersona(join(paths.repoRoot, 'personas', portal, `${id}.yaml`));
      return [{ id, attributes: p.attributes }];
    } catch (error) {
      if (error instanceof ConfigError) return []; // request_scan names its problems when asked
      throw error;
    }
  });
  return samplePersonas(personas);
}

/** Every persona's problems, so the BA fixes them all before the first scan. */
function checkAll(
  raw: BetterSqlite3.Database,
  paths: WorkspacePaths,
  input: { portal: string; environment?: Environment },
  personas: readonly string[],
): Environment {
  const missing: string[] = [];
  let environment: Environment | undefined = input.environment;
  for (const persona of personas)
    try {
      environment = checkScanTarget(raw, paths, { ...input, persona, environment });
    } catch (error) {
      if (!(error instanceof ScanRefusal)) throw error;
      missing.push(
        ...(error.missing.length > 0 ? error.missing : [error.message]).map(
          (m) => `${persona}: ${m}`,
        ),
      );
    }
  if (missing.length > 0 || environment === undefined)
    throw new ScanRefusal(
      'MISSING_INPUT',
      'some personas of the batch cannot be scanned yet',
      missing,
    );
  return environment;
}

/** Personas with a finished scan (a completed map run) in the environment since the batch began. */
function scannedSince(
  raw: BetterSqlite3.Database,
  { portal, environment, since }: { portal: string; environment: string; since: string },
): Set<string> {
  const rows = raw
    .prepare(
      `SELECT DISTINCT persona_id FROM runs WHERE portal_id = ? AND environment = ?
       AND mode = 'map' AND status = 'completed' AND started_at >= ?`,
    )
    .all(portal, environment, since) as { persona_id: string }[];
  return new Set(rows.map((r) => r.persona_id));
}

export function requestSampleScans(
  raw: BetterSqlite3.Database,
  paths: WorkspacePaths,
  conversationId: string,
  args: RequestSampleScansInput,
): SampleScans {
  const input = RequestSampleScansInput.parse(args);
  const sample = input.personas === undefined ? proposeSample(paths, input.portal) : null;
  const personas = input.personas ?? sample!.chosen.map((c) => c.id);
  if (personas.length === 0)
    throw new ScanRefusal('MISSING_INPUT', 'the portal has no persona to scan', ['persona']);
  const environment = checkAll(raw, paths, input, personas);
  const since = input.since ?? new Date().toISOString();
  const scanned = scannedSince(raw, { portal: input.portal, environment, since });
  const done = personas.filter((p) => scanned.has(p));
  const remaining = personas.filter((p) => !scanned.has(p));
  const persona = remaining[0];
  const next =
    persona === undefined
      ? null
      : {
          persona,
          handoff: requestScan(raw, paths, conversationId, {
            portal: input.portal,
            persona,
            environment,
            ...(input.allow_writes !== undefined ? { allow_writes: input.allow_writes } : {}),
            ...(input.skip_images !== undefined ? { skip_images: input.skip_images } : {}),
          }).handoff,
        };
  return {
    portal: input.portal,
    environment,
    since,
    sample: sample && { chosen: sample.chosen, pairs: sample.pairs, left_out: sample.left_out },
    personas,
    done,
    next,
    remaining,
    complete: next === null,
  };
}
