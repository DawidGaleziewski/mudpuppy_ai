import { afterEach } from 'vitest';
import { canLaunchBrowser } from '@pathfinder/crawler';
import { startHarness } from './harness.js';
import { startMockInsurer, type MockInsurerOptions } from './mock-insurer.js';
import type { MockPortal } from './mock-portal.js';

export const available = await canLaunchBrowser();

/** Written by the test: the insurer mock is onboarded with configuration only (SC-004). */
export const insurerYaml = (
  origin: string,
  o: { pageRequests?: 'block' | 'allow_and_record'; denylist?: string; extra?: string } = {},
) => `
id: insurer
base_url: ${origin}/
environment: sandbox
scope:
  allowed_domains: [127.0.0.1]
  allowed_paths: ["/*"]
  external_link_policy: record
  max_depth: 4
  max_states: 40
  max_actions_per_state: 40
  max_run_time_minutes: 5
  max_steps: 60
denylist: ${o.denylist ?? '[logout, delete, payment, purchase, submit_request, contact_or_message, reveal_contact]'}
obstacles:
  - { id: cookie_dialog, selector: "#CybotCookiebotDialogBodyButtonDecline" }
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "PathfinderAI-Crawler/0.1 (+ops@corp.pl)" }
robots_page_requests: ${o.pageRequests ?? 'block'}
${o.extra ?? ''}`;
export const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

const mocks: MockPortal[] = [];

/** Call once at the top of each test file: closes every mock the file started after each test. */
export function useInsurerMocks(): void {
  afterEach(async () => {
    for (const m of mocks.splice(0)) await m.close();
  });
}

export async function insurer(
  opts: MockInsurerOptions = {},
  yaml: Parameters<typeof insurerYaml>[1] = {},
) {
  const mock = await startMockInsurer(opts);
  mocks.push(mock);
  const h = await startHarness({
    'portals/insurer/portal.yaml': insurerYaml(mock.origin, yaml),
    'personas/insurer/guest.yaml': PERSONA,
  });
  return { mock, ...h };
}

export const DISALLOWED = [/cHash/, /^\/quote\/(?!start)/, /^\/api\//];
