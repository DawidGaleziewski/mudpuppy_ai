// What MudPuppy 2.0 records about each page beyond v1 (spec 039 design § 5.2–5.6): the step result,
// the builds of its scopes and the endpoint templates it called. Pure over what the pipeline has
// already observed; the writes happen in `record_observation` and `record_transition`.

import { createHash } from 'node:crypto';
import type { StepResult } from '@pathfinder/core';
import { transientError, type NetworkObservation } from '@pathfinder/crawler';
import { canonicalizeAria, errorSignals, hasErrors } from '@pathfinder/fingerprint';
import { buildSignatures, stepResult, type AssetRef, type BuildSignature } from '@pathfinder/model';
import type { RunState } from '../run-state.js';
import { isBrowserErrorPage } from './fingerprint-step.js';

export interface PageCapture {
  result: StepResult;
  builds: BuildSignature[];
  /** `METHOD /template` of every call the page made while settling, sorted, unique. */
  calls: string[];
  /** Micro-frontend and frame scopes on the page (every build scope but the shell). */
  mounts: string[];
}

/** The page's text as the ARIA tree shows it, for error templates and soft error pages. */
function pageText(masked: string): string {
  return canonicalizeAria(masked)
    .nodes.map((n) => n.shown ?? n.name)
    .filter(Boolean)
    .join(' ');
}

/** The assets of the current document, each marked as named by the document or loaded by script. */
export function loadedAssets(rs: RunState): AssetRef[] {
  const bundles = new Set(rs.lastMounts?.bundles ?? []);
  return (rs.loaded?.current() ?? []).map((a) => ({
    ...a,
    loadedBy: bundles.has(a.url) ? ('script' as const) : ('document' as const),
  }));
}

export function capturePage(
  rs: RunState,
  page: {
    url: string;
    masked: string;
    net: NetworkObservation;
    settled: boolean;
    /** The meta tag marker's content, when the portal names one and the page has it. */
    metaMarker?: string | null;
  },
): PageCapture {
  const hooks = rs.effective.portal.model;
  const text = pageText(page.masked);
  const nodes = canonicalizeAria(page.masked).nodes;
  const marker = rs.loaded?.markerHeader() ?? page.metaMarker ?? undefined;
  const builds = buildSignatures(loadedAssets(rs), marker ?? undefined);
  const result = stepResult({
    blocked: false,
    browserErrorPage: isBrowserErrorPage(page.url) || transientError({ text }) !== null,
    blockingStatuses: page.net.calls.map((c) => c.status),
    settled: page.settled,
    validation: hasErrors(errorSignals(nodes)),
    pageText: text,
    businessErrors: hooks.business_errors.map((b) => b.text),
  });
  const calls = [...new Set(page.net.calls.map((c) => `${c.method} ${c.url_template}`))].sort();
  const mounts = builds.map((b) => b.scope).filter((s) => s !== 'shell');
  return { result, builds, calls, mounts };
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Audience = sha256 of the persona's attribute set and the environment (design § 5.6). */
export function audienceKey(rs: RunState): string {
  const attrs = Object.entries(rs.effective.persona.attributes)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? [...v].sort().join(',') : String(v)}`)
    .sort();
  return sha([`env=${rs.effective.portal.environment ?? ''}`, ...attrs].join('\n'));
}

/** Context key = sha256 of the sorted build ids, the audience and the experiment arm. */
export function contextKey(
  buildIds: readonly string[],
  audience: string,
  flags: Readonly<Record<string, string>>,
): string {
  const arm = Object.entries(flags)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('&');
  return sha([[...buildIds].sort().join(','), audience, arm].join('\n'));
}
