// Docs, part 2 (spec 067) over a stubbed API: one record (content blocks, evidence, relations,
// revisions, the review asked then sent, Prev / Next, Open in Processes) and one session.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const API = '/api/portals/shop/docs';
const s = (shape: string, word: string) => ({ shape, word });
const ref = (label: string, href: string) => ({ label, href, title: null });
const record = (over: Record<string, unknown> = {}) => ({
  portal: 'shop',
  key: 'REQ-001',
  title: 'Premium form requires the model',
  kind: 'requirement',
  status: s('needs', 'Draft'),
  confidence: s('inferred', 'Inferred'),
  not_observable: null,
  followup: null,
  blocked_reason: null,
  rev: 2,
  latest_rev: 2,
  confirmed_rev: 1,
  is_latest: true,
  change: 'revise',
  change_note: 'Added the form field evidence',
  session: ref('sess-2', '/app/portals/shop/docs/sessions/sess-2'),
  written_at: '2026-09-25T19:30:00Z',
  blocks: [
    { type: 'text', text: 'The system shall require the field.', strong: true, facts: [], caption: null, headers: [], rows: [] },
    { type: 'facts', text: null, strong: false, facts: [{ label: 'Term as shown', values: ['Składka'], mono: false, lang: 'pl', listed: false }], caption: null, headers: [], rows: [] },
    { type: 'code', text: 'Scenario 1\n  Given the calculator is open', strong: false, facts: [], caption: 'Acceptance criteria', headers: [], rows: [] },
  ],
  variant_maps: [],
  figures: [],
  figures_open: true,
  evidence: [{ kind: 'form', label: 'Vehicle form', resolved: true, href: '/app/scans/run-map/forms#form-vehicle', tag: null, region: null, note: 'field Model marked required', scan: ref('run-map', '/app/scans/run-map'), scan_note: 'map · 2026-09-25T19:10:00Z' }],
  relations: [{ direction: 'Out', type: 'refines', key: 'CAP-001', title: 'Quote a premium', status: s('ok', 'Confirmed'), href: '/app/portals/shop/docs/CAP-001' }],
  history: [
    { rev: 2, shown: true, href: '/app/portals/shop/docs/REQ-001?rev=2', status: s('needs', 'Draft'), confidence: s('inferred', 'Inferred'), not_observable: false, change: 'revise', at: '2026-09-25T19:30:00Z', change_note: null, session: ref('sess-2', '/x'), reviews: [] },
    { rev: 1, shown: false, href: '/app/portals/shop/docs/REQ-001?rev=1', status: s('ok', 'Confirmed'), confidence: s('ok', 'Observed'), not_observable: false, change: 'create', at: '2026-09-25T19:00:00Z', change_note: null, session: ref('sess-1', '/y'), reviews: [{ id: 'rv1', action: s('ok', 'Confirmed'), reviewer: 'Test Reviewer', text: 'Looks right.', at: '2026-09-25T19:05:00Z' }] },
  ],
  panel: { enabled: true, rev: 2, status: 'draft', can_decide: true, viewing_latest: true, reviews: [] },
  neighbours: { position: 1, total: 3, label: 'Requirements', list: '/app/portals/shop/docs?section=requirements', prev: null, next: '/app/portals/shop/docs/REQ-002?list=x' },
  process: null,
  ...over,
});

describe('One record', () => {
  it('shows its content blocks, evidence, relations and revisions', async () => {
    at('/app/portals/shop/docs/REQ-001', { [`${API}/REQ-001`]: record() });
    expect(await screen.findByText('The system shall require the field.')).toBeTruthy();
    expect(screen.getByText('Składka').getAttribute('lang')).toBe('pl');
    expect(screen.getByText(/Given the calculator is open/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Vehicle form' }).getAttribute('href')).toBe('/app/scans/run-map/forms#form-vehicle');
    expect(screen.getByRole('link', { name: 'CAP-001' }).getAttribute('href')).toBe('/app/portals/shop/docs/CAP-001');
    expect(screen.getByRole('link', { name: 'rev 1' }).getAttribute('href')).toBe('/app/portals/shop/docs/REQ-001?rev=1');
    expect(screen.getByText('Looks right.').closest('.sy-note')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe('/app/portals/shop/docs/REQ-002?list=x');
    expect(screen.getByRole('link', { name: 'Requirements' }).getAttribute('href')).toBe('/app/portals/shop/docs?section=requirements');
  });

  it('confirms the latest revision after asking', async () => {
    const fetch = at('/app/portals/shop/docs/REQ-001', {
      [`${API}/REQ-001`]: record(),
      ['POST /api/portals/shop/review/records/REQ-001']: { ok: true, message: 'Recorded confirm on REQ-001 revision 2.', href: null },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm rev 2' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Confirm REQ-001 revision 2?' })).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Recorded confirm on REQ-001 revision 2.')).toBeTruthy();
    const call = fetch.mock.calls.find((c) => c[0] === '/api/portals/shop/review/records/REQ-001') as unknown as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ action: 'confirm', rev: 2, text: '' });
  });

  it('allows only a comment on a decided revision, and nothing without a reviewer', async () => {
    at('/app/portals/shop/docs/REQ-001', { [`${API}/REQ-001`]: record({ panel: { enabled: true, rev: 1, status: 'confirmed', can_decide: false, viewing_latest: true, reviews: [] } }) });
    expect((await screen.findByRole('button', { name: 'Confirm rev 1' })).hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Comment (required)').hasAttribute('disabled')).toBe(false);
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    at('/app/portals/shop/docs/REQ-001', { [`${API}/REQ-001`]: record({ panel: { enabled: false, rev: 2, status: 'draft', can_decide: true, viewing_latest: true, reviews: [] } }) });
    expect(await screen.findByText(/no reviewer is set/)).toBeTruthy();
    expect(screen.getByLabelText('Comment (required)').hasAttribute('disabled')).toBe(true);
  });

  it('says when an older revision is shown', async () => {
    at('/app/portals/shop/docs/REQ-001?rev=1', { [`${API}/REQ-001?rev=1`]: record({ rev: 1, is_latest: false }) });
    expect(await screen.findByText(/Showing revision 1 of 2/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View the latest' }).getAttribute('href')).toBe('/app/portals/shop/docs/REQ-001');
  });

  it('opens a process record in Processes after asking', async () => {
    const fetch = at('/app/portals/shop/docs/PROC-001', {
      [`${API}/PROC-001`]: record({ key: 'PROC-001', process: { export: '/docs/shop/PROC-001/export', linked: null, can_open: true } }),
      ['POST /api/portals/shop/processes/from-record']: { ok: true, message: 'PROC-001 is in Processes now.', href: '/app/portals/shop/processes/PRC-004?model=A' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Open in Processes' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Open PROC-001 in Processes?' })).getByRole('button', { name: 'Open in Processes' }));
    expect((await screen.findByRole('link', { name: 'Open the process' })).getAttribute('href')).toBe('/app/portals/shop/processes/PRC-004?model=A');
    expect(fetch.mock.calls.some((c) => c[0] === '/api/portals/shop/processes/from-record')).toBe(true);
    expect(screen.getByRole('link', { name: 'Documentation of this process' }).getAttribute('href')).toBe('/docs/shop/PROC-001/export');
  });

  it('says when the record does not exist', async () => {
    at('/app/portals/shop/docs/NOPE-1', {});
    expect(await screen.findByText(/does not exist/)).toBeTruthy();
  });
});

describe('One session', () => {
  it('shows its scans, passes, records and gaps', async () => {
    at('/app/portals/shop/docs/sessions/sess-1', {
      [`${API}/sessions/sess-1`]: {
        portal: 'shop',
        id: 'sess-1',
        status: s('ok', 'Completed'),
        started_at: '2026-09-25T19:00:00Z',
        ended_at: null,
        summary: 'summary of sess-1',
        scans: [{ scan: ref('run-map', '/app/scans/run-map'), mode: 'map', persona: 'guest', status: s('ok', 'Completed'), started_at: '2026-09-25T18:00:00Z' }],
        passes: [{ name: 'synthesis', summary: null, completed_at: null }],
        written: [{ key: 'REQ-001', title: 'Premium form', href: '/app/portals/shop/docs/REQ-001', change: 'create', status: s('needs', 'Draft'), confidence: s('inferred', 'Inferred') }],
        written_total: 1,
        next_cursor: null,
        gaps: ['Login pages not observable'],
      },
    });
    expect(await screen.findByText('summary of sess-1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'run-map' }).getAttribute('href')).toBe('/app/scans/run-map');
    expect(screen.getByRole('link', { name: 'REQ-001' }).getAttribute('href')).toBe('/app/portals/shop/docs/REQ-001');
    expect(screen.getByText('Login pages not observable')).toBeTruthy();
    expect(screen.getByText('synthesis')).toBeTruthy();
  });
});
