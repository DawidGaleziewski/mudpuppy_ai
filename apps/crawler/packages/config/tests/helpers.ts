import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach } from 'vitest';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Write `files` (relative path -> content) into a fresh temp dir and return its path. */
export function tmpTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'pf-config-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

export const PORTAL_YAML = `
id: marketsite
base_url: https://marketsite.example/
environment: production
compliance:
  robots_checked_on: null
  terms_reviewed_on: null
  terms_reviewed_by: null
scope:
  allowed_domains: [marketsite.example]
  external_link_policy: record
  max_depth: 6
  max_states: 500
  max_actions_per_state: 20
  max_run_time_minutes: 60
  max_steps: 2000
urls:
  disallowed: ["/oferty/wystaw/*"]
denylist: [logout, delete, payment, bidding, buy_now, message_or_contact_seller, reveal_seller_contact]
obstacles:
  - id: cookie_banner
    selector: "#cookie-consent button[data-accept]"
rate_limit:
  requests_per_second: 1
  max_concurrency: 1
  user_agent: "MudPuppy-Crawler/0.1 (+contact@example.com)"
item_view_cap: 25
item_route_templates: ["/oferta/:id"]
`;
