import { readFileSync } from 'node:fs';
import { canLaunchBrowser } from '@mudpuppy/crawler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness } from './harness.js';
import { startMockPortal, type MockPortal } from './mock-portal.js';
import { portalYaml } from './trace-run-harness.js';

/** Constitution 2.0.0 / spec 008 FR-004: text evidence is masked only when the portal says so. */

const available = await canLaunchBrowser();
const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

let portal: MockPortal;
beforeAll(async () => {
  if (available) portal = await startMockPortal();
});
afterAll(async () => portal?.close());

async function snapshotOfSellerPage(scrub: boolean) {
  const yaml = portalYaml(portal.origin, 10) + (scrub ? 'pii_scrub: true\n' : '');
  const h = await startHarness({
    'portals/mock/portal.yaml': yaml,
    'personas/mock/guest.yaml': PERSONA,
  });
  try {
    const start = await h.call('start_run', { portal_id: 'mock', persona_id: 'guest' });
    const page = await h.call('navigate', {
      run_id: start.body.run_id,
      url: `${portal.origin}/sprzedawca`,
      rationale: 'x',
    });
    expect(page.body.error, JSON.stringify(page.body.error)).toBeUndefined();
    const state = h.ctx.raw
      .prepare('SELECT title, evidence_ref, screenshot_ref FROM states WHERE id = ?')
      .get(page.body.state_id) as { title: string; evidence_ref: string; screenshot_ref: string };
    return {
      title: state.title,
      snapshot: readFileSync(h.ctx.evidence.resolve(state.evidence_ref), 'utf8'),
      screenshot: state.screenshot_ref,
    };
  } finally {
    await h.cleanup();
  }
}

describe.skipIf(!available)('pii_scrub (spec 008 FR-004)', () => {
  it('stores the snapshot and title as recorded by default', async () => {
    const s = await snapshotOfSellerPage(false);
    expect(s.snapshot).toContain('jan.kowalski@example.com');
    expect(s.snapshot).toContain('601 234 567');
    expect(s.title).toContain('jan.kowalski@example.com');
    expect(s.screenshot).toMatch(/\.png$/); // never masked either way
  });

  it('refuses a personal-looking trace input only on a scrubbing portal (PII_SUSPECTED)', async () => {
    for (const scrub of [true, false]) {
      // A ceiling above read, so the login form is not a trace boundary on this sandbox.
      const h = await startHarness({
        'portals/mock/portal.yaml':
          portalYaml(portal.origin, 10) +
          'max_action_class: external-side-effect\n' +
          (scrub ? 'pii_scrub: true\n' : ''),
        'personas/mock/guest.yaml': PERSONA.replace(
          'max_action_class: read',
          'max_action_class: external-side-effect',
        ),
      });
      try {
        const start = await h.call('start_run', {
          portal_id: 'mock',
          persona_id: 'guest',
          mode: 'trace',
          process: { name: 'Log in', goal: 'Reach the account page' },
        });
        expect(start.isError).toBe(false);
        const page = await h.call('navigate', {
          run_id: start.body.run_id,
          url: `${portal.origin}/konto/zaloguj`,
          intent: 'Open the login page',
          rationale: 'x',
        });
        expect(page.isError, JSON.stringify(page.body)).toBe(false);
        const email = (page.body.actions as { role: string; action_id: string }[]).find(
          (a) => a.role === 'textbox',
        )!;
        const r = await h.call('act', {
          run_id: start.body.run_id,
          action_id: email.action_id,
          value: 'jan.kowalski@example.com',
          intent: 'Type the e-mail',
          rationale: 'x',
        });
        if (scrub) expect(r.body.error?.code).toBe('PII_SUSPECTED');
        else expect(r.isError).toBe(false);
      } finally {
        await h.cleanup();
      }
    }
  });

  it('masks them when the portal sets pii_scrub: true', async () => {
    const s = await snapshotOfSellerPage(true);
    expect(s.snapshot).not.toContain('jan.kowalski@example.com');
    expect(s.snapshot).not.toContain('601 234 567');
    expect(s.title).not.toContain('jan.kowalski@example.com');
    expect(s.screenshot).toMatch(/\.png$/);
  });
});
