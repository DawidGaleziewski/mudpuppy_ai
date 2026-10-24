// Settings (`web/api_settings.py` over `queries_app_settings.py`), typed as the pydantic models
// declare them, and its writes, each through the chat service: an environment saved or revoked,
// the hints, the budgets, the calibrated τ or the classifier accepted.
import type { StatusOut } from './api';
import type { Option } from './api-review';
import { api as rtk, read } from './state/api';
import type { Write } from './state/http';
import type { PersonaArgs } from './PersonaForm';

export interface SettingsEnvironment {
  name: string;
  base_url: string;
  limit: string;
  limit_word: string;
  robots: string | null;
  can_revoke: boolean;
}

export interface SettingsHints {
  release_marker: string | null;
  ab_flags: string[];
  refusals: string[];
  marker_header: string;
  marker_meta: string;
  checks_per_scan: number;
  probes_per_step: number;
  probes_per_scan: number;
}

export interface SettingsPage {
  portal: string;
  service_up: boolean;
  start_hint: string | null;
  error: string | null;
  environments: SettingsEnvironment[];
  missing: string[];
  limits: Option[];
  not_configured: StatusOut;
  credentials: Option[];
  workbench: string | null;
  personas: { id: string; kind: string; refs: string[]; attributes: Option[] }[];
  /** Credential names a new persona can sign in with (X: X_LOGIN and X_PASSWORD known). */
  sign_ins: string[];
  rules: { robots: string; domains: string[]; allowed_urls: string[] | null; disallowed_urls: string[] } | null;
  hints: SettingsHints | null;
  identity: { profile: string | null; tau: string | null; same_labels: number; distinct_labels: number; classifier: string | null; can_accept_classifier: boolean };
  store: { environment: string; path: string; exists: boolean; size_kb: number };
  reviewer: boolean;
}

/** The environments a portal can have, in the order pages show them. */
export const PORTAL_ENVS = ['production', 'staging', 'sandbox'] as const;

const api = (portal: string) => `/api/portals/${encodeURIComponent(portal)}`;

export const settingsKey = (portal: string) => ['portals', portal, 'settings'] as const;

export const settingsHref = (portal: string) => `/app/portals/${encodeURIComponent(portal)}/settings`;

const settingsApi = rtk.injectEndpoints({
  endpoints: (b) => ({
    settings: read<SettingsPage, string>(b, (portal) => `${api(portal)}/settings`, settingsKey),
  }),
});

export const useSettings = (portal: string) => settingsApi.useSettingsQuery(portal);

export const settingsWrites = {
  saveEnvironment: (portal: string, environment: string, baseUrl: string, limit: string): Write => ({
    path: `${api(portal)}/environments`,
    body: { environment, base_url: baseUrl, limit },
  }),
  revokeEnvironment: (portal: string, environment: string): Write => ({
    path: `${api(portal)}/environments/${encodeURIComponent(environment)}/revoke`,
    body: {},
  }),
  /** Release marker, A/B cookies and business refusals (lists one per line). */
  hints: (portal: string, fields: { marker_header: string; marker_meta: string; ab_flags: string; refusals: string }): Write => ({
    path: `${api(portal)}/hints/hints`,
    body: fields,
  }),
  budgets: (portal: string, fields: { checks_per_scan: string; probes_per_step: string; probes_per_scan: string }): Write => ({
    path: `${api(portal)}/hints/budgets`,
    body: fields,
  }),
  accept: (portal: string, what: 'tau' | 'classifier'): Write => ({ path: `${api(portal)}/model/accept`, body: { what } }),
  /** Add a persona (spec 072): `persona.add`'s args. */
  addPersona: (portal: string, args: PersonaArgs): Write => ({ path: `${api(portal)}/personas`, body: { ...args } }),
  /** Remove a persona no scan used yet. */
  removePersona: (portal: string, name: string): Write => ({ path: `${api(portal)}/personas/${encodeURIComponent(name)}/remove`, body: {} }),
};
