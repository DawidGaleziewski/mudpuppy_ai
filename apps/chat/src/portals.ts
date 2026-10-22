// Portals from the dashboard (spec 011): the "+ new portal" form (FR-004, FR-011) and the portal
// settings page (FR-012). Files are written here and checked with the same loader a run uses;
// nothing half-written is left. User decisions 2026-10-06: robots ignored by default, forms may
// be submitted on any environment, production included (constitution 4.0.0); one portal holds
// several environments, each with its own address and limit.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import {
  ConfigError,
  Environment,
  loadEffectiveConfig,
  portalEnvironments,
} from '@pathfinder/config';
import { SafetyClass } from '@pathfinder/core';
import { portalFile, type WorkspacePaths } from './workflow-data.js';

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;

export const EnvironmentBody = z.object({
  base_url: z.string().trim().min(1).max(2000),
  max_action_class: SafetyClass.default('external-side-effect'),
});
export type EnvironmentBody = z.input<typeof EnvironmentBody>;

export const NewPortalBody = z.object({
  /** Short name; proposed from the first address when left out. */
  id: z.string().trim().max(60).optional(),
  robots: z.enum(['respect', 'ignore']).default('ignore'),
  /** Free names the developer chooses (spec 030 R-61), in the order given. */
  environments: z.record(Environment, EnvironmentBody),
});
export type NewPortalBody = z.input<typeof NewPortalBody>;

export class PortalRefusal extends Error {
  constructor(
    readonly code: 'PORTAL_EXISTS' | 'PORTAL_NOT_FOUND' | 'LAST_ENVIRONMENT' | 'INVALID',
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'PortalRefusal';
  }
}

export interface PortalSummary {
  portal: string;
  persona: 'guest';
  environments: { environment: Environment; base_url: string; max_action_class?: SafetyClass }[];
  files: string[];
}

/** `https://www.Wikipedia.org/wiki` → `wikipedia-org`. */
export function proposeId(url: URL): string {
  return url.hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function parseAddress(raw: string): URL {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new PortalRefusal('INVALID', `"${raw}" is not a web address`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new PortalRefusal('INVALID', `the address must start with http:// or https://`);
  // "mailto:x@y" becomes "https://mailto:x@y": a user part means it was not a web address
  if (url.username !== '' || url.password !== '')
    throw new PortalRefusal('INVALID', `"${raw}" is not a web address`);
  return url;
}

/** The YAML entry of one environment: address, limit, and its domain (and subdomains). */
function environmentEntry(body: EnvironmentBody): Record<string, unknown> {
  const parsed = EnvironmentBody.parse(body);
  const url = parseAddress(parsed.base_url);
  return {
    base_url: url.toString(),
    max_action_class: parsed.max_action_class,
    allowed_domains: [url.hostname.toLowerCase().replace(/^www\./, '')],
  };
}

const personaFence = (paths: WorkspacePaths, id: string) => [
  join(paths.repoRoot, 'personas', '_mixins'),
  join(paths.repoRoot, 'personas', id),
];

/** Load every environment of the portal with its guest persona, as a run would. */
function check(paths: WorkspacePaths, id: string): PortalSummary {
  const portalPath = portalFile(paths, id);
  const personaPath = join(paths.repoRoot, 'personas', id, 'guest.yaml');
  const environments = portalEnvironments(portalPath);
  for (const e of environments)
    loadEffectiveConfig(portalPath, personaPath, { fence: personaFence(paths, id) }, e.environment);
  return { portal: id, persona: 'guest', environments, files: [portalPath, personaPath] };
}

export function createPortal(paths: WorkspacePaths, input: NewPortalBody): PortalSummary {
  const body = NewPortalBody.parse(input);
  const chosen = Object.keys(body.environments);
  if (chosen.length === 0)
    throw new PortalRefusal('INVALID', 'give the address of at least one environment');
  const environments: Record<string, Record<string, unknown>> = {};
  for (const e of chosen) environments[e] = environmentEntry(body.environments[e]!);

  const first = parseAddress(body.environments[chosen[0]!]!.base_url);
  const id = body.id && body.id.length > 0 ? body.id.toLowerCase() : proposeId(first);
  if (!SLUG.test(id))
    throw new PortalRefusal(
      'INVALID',
      `the short name "${id}" may use only lowercase letters, digits, "-" and "_"`,
    );
  const portalPath = portalFile(paths, id);
  const personaPath = join(paths.repoRoot, 'personas', id, 'guest.yaml');
  if (existsSync(dirname(portalPath)) || existsSync(personaPath))
    throw new PortalRefusal(
      'PORTAL_EXISTS',
      `a portal called "${id}" already exists; pick another short name`,
    );

  const portal = {
    id,
    // Not reviewed: the BA's choice for a site they work on (constitution 4.0.0, Principle V).
    compliance: { robots_checked_on: null, terms_reviewed_on: null, terms_reviewed_by: null },
    robots: body.robots,
    environments,
    // No `urls`: every URL on the portal's domains is in scope (spec 023 US3.1).
    scope: {
      external_link_policy: 'record',
      max_depth: 6,
      max_states: 200,
      max_actions_per_state: 40,
      max_run_time_minutes: 60,
      max_steps: 600,
    },
    denylist: [],
    rate_limit: {
      requests_per_second: 2,
      max_concurrency: 1,
      user_agent: 'PathfinderAI-Crawler/0.1 (portal added from the dashboard)',
    },
  };
  const persona = {
    id: 'guest',
    extends: ['../_mixins/anonymous-base.yaml'],
    // The mixin is read-only; each run is capped by its environment's limit anyway.
    max_action_class: 'external-side-effect',
  };
  const header = `# Added from the dashboard (spec 011) on ${new Date().toISOString().slice(0, 10)}.\n`;

  mkdirSync(dirname(portalPath), { recursive: true });
  mkdirSync(dirname(personaPath), { recursive: true });
  try {
    writeFileSync(portalPath, header + stringify(portal), { flag: 'wx' });
    writeFileSync(personaPath, header + stringify(persona), { flag: 'wx' });
    return check(paths, id);
  } catch (error) {
    rmSync(dirname(portalPath), { recursive: true, force: true });
    rmSync(dirname(personaPath), { recursive: true, force: true });
    if (error instanceof ConfigError)
      throw new PortalRefusal('INVALID', 'the portal could not be saved', error.problems);
    throw error;
  }
}

/**
 * Change a portal file and check it; on any problem the file is put back as it was. A legacy
 * single-environment file is first moved to the `environments` form.
 */
function editPortal(
  paths: WorkspacePaths,
  id: string,
  change: (doc: ReturnType<typeof parseDocument>) => void,
): PortalSummary {
  if (!SLUG.test(id)) throw new PortalRefusal('PORTAL_NOT_FOUND', `no portal "${id}"`);
  const portalPath = portalFile(paths, id);
  if (!existsSync(portalPath)) throw new PortalRefusal('PORTAL_NOT_FOUND', `no portal "${id}"`);
  const before = readFileSync(portalPath, 'utf8');
  const doc = parseDocument(before);
  if (!doc.has('environments')) {
    const env = String(doc.get('environment'));
    const entry: Record<string, unknown> = { base_url: doc.get('base_url') };
    if (doc.has('max_action_class')) entry.max_action_class = doc.get('max_action_class');
    for (const k of ['environment', 'base_url', 'max_action_class']) doc.delete(k);
    doc.set('environments', doc.createNode({ [env]: entry }));
  }
  change(doc);
  writeFileSync(portalPath, doc.toString());
  try {
    return check(paths, id);
  } catch (error) {
    writeFileSync(portalPath, before);
    if (error instanceof ConfigError)
      throw new PortalRefusal('INVALID', 'the change could not be saved', error.problems);
    throw error;
  }
}

/** Add an environment, or change its address and limit (FR-012). */
export function setEnvironment(
  paths: WorkspacePaths,
  id: string,
  environment: Environment,
  body: EnvironmentBody,
): PortalSummary {
  const entry = environmentEntry(body);
  return editPortal(paths, id, (doc) =>
    doc.setIn(['environments', environment], doc.createNode(entry)),
  );
}

/** An A/B test's flag: the cookie or storage key whose value names the arm. */
export interface ExperimentFlag {
  kind: 'cookie' | 'storage';
  name: string;
}

/**
 * Add an A/B flag to the portal's Hints (`model.experiment_flags`, spec 039 owner answer OV-2):
 * a person confirmed the A/B test it separates. Already there: nothing changes. Returns whether
 * it was added.
 */
export function addExperimentFlag(
  paths: WorkspacePaths,
  id: string,
  flag: ExperimentFlag,
): boolean {
  let added = false;
  editPortal(paths, id, (doc) => {
    const flags = (doc.getIn(['model', 'experiment_flags']) ?? null) as {
      toJSON?: () => unknown;
    } | null;
    const now = (flags?.toJSON?.() ?? []) as Record<string, string>[];
    if (now.some((f) => f[flag.kind] === flag.name)) return;
    doc.setIn(['model', 'experiment_flags'], doc.createNode([...now, { [flag.kind]: flag.name }]));
    added = true;
  });
  return added;
}

/**
 * Settings ▸ Hints and Budgets from the dashboard (spec 040 T021, 12-v2-ux § 10, UX-R80–R81):
 * each key given replaces that part of the portal file; a key left out stays as it is. An empty
 * release marker removes it. The portal schema checks the result (the file is put back if not).
 */
export const HintsBody = z
  .object({
    release_marker: z
      .object({
        header: z.string().trim().max(200).optional(),
        meta: z.string().trim().max(200).optional(),
      })
      .strict()
      .optional(),
    experiment_flags: z
      .array(z.object({ kind: z.enum(['cookie', 'storage']), name: z.string().trim().min(1).max(200) }))
      .max(50)
      .optional(),
    business_errors: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
    replay_budget: z.number().int().min(0).max(1000).optional(),
    probes: z
      .object({
        per_step: z.number().int().min(0).max(1000),
        per_run: z.number().int().min(0).max(10000),
      })
      .strict()
      .optional(),
  })
  .strict();
export type HintsBody = z.input<typeof HintsBody>;

export function setHints(paths: WorkspacePaths, id: string, body: HintsBody): PortalSummary {
  const h = HintsBody.parse(body);
  return editPortal(paths, id, (doc) => {
    if (h.release_marker !== undefined) {
      const marker = Object.fromEntries(
        Object.entries(h.release_marker).filter(([, v]) => v !== undefined && v !== ''),
      );
      if (Object.keys(marker).length > 0)
        doc.setIn(['model', 'build_marker'], doc.createNode(marker));
      else if (doc.hasIn(['model', 'build_marker'])) doc.deleteIn(['model', 'build_marker']);
    }
    if (h.experiment_flags !== undefined)
      doc.setIn(
        ['model', 'experiment_flags'],
        doc.createNode(h.experiment_flags.map((f) => ({ [f.kind]: f.name }))),
      );
    if (h.business_errors !== undefined)
      doc.setIn(
        ['model', 'business_errors'],
        doc.createNode(h.business_errors.map((text) => ({ text }))),
      );
    if (h.replay_budget !== undefined) doc.setIn(['model', 'replay_budget'], h.replay_budget);
    if (h.probes !== undefined) doc.setIn(['probes'], doc.createNode(h.probes));
  });
}

/** Revoke an environment; the last one stays (FR-012). Runs already recorded are kept. */
export function removeEnvironment(
  paths: WorkspacePaths,
  id: string,
  environment: Environment,
): PortalSummary {
  return editPortal(paths, id, (doc) => {
    const envs = doc.get('environments') as { items?: unknown[] } | undefined;
    if (!doc.hasIn(['environments', environment]))
      throw new PortalRefusal('INVALID', `portal "${id}" has no environment "${environment}"`);
    if ((envs?.items?.length ?? 0) <= 1)
      throw new PortalRefusal(
        'LAST_ENVIRONMENT',
        `"${environment}" is the only environment of "${id}"; add another before revoking it`,
      );
    doc.deleteIn(['environments', environment]);
  });
}

/** The portal's environments for the settings page. */
export function describePortal(paths: WorkspacePaths, id: string): PortalSummary {
  if (!SLUG.test(id) || !existsSync(portalFile(paths, id)))
    throw new PortalRefusal('PORTAL_NOT_FOUND', `no portal "${id}"`);
  try {
    return {
      portal: id,
      persona: 'guest',
      environments: portalEnvironments(portalFile(paths, id)),
      files: [portalFile(paths, id)],
    };
  } catch (error) {
    if (error instanceof ConfigError)
      throw new PortalRefusal('INVALID', 'the portal file has problems', error.problems);
    throw error;
  }
}
