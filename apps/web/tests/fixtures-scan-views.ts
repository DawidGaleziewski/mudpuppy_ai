// Answers of the scan-based views' API (spec 054), shaped as the pydantic models declare them.

export const RECORDED = '/api/portals/shop/map/recorded?';

const ok = { shape: 'ok', word: 'Observed' };
const rnode = (id: string, route: string, title: string, more: object = {}) => ({
  id,
  kind: 'screen',
  route,
  title,
  status: ok,
  state: null,
  deck: false,
  kind_status: null,
  chips: [],
  marked: false,
  first_state: `st-${id}`,
  states: 1,
  near: [],
  x: 0,
  y: 0,
  depth: 0,
  ...more,
});

export const recorded = {
  portal: 'shop',
  has_model: true,
  views: [
    { value: 'now', label: 'Now' },
    { value: 'since', label: 'Since previous release' },
    { value: 'path', label: "One scan's path" },
  ],
  filter: { scan: null, persona: null, layers: ['states', 'errors', 'frontier'], open: null },
  layer_options: [
    { value: 'states', label: 'States' },
    { value: 'errors', label: 'Errors' },
    { value: 'frontier', label: 'Queue' },
    { value: 'links', label: 'All links' },
  ],
  legend: [
    { value: '', label: 'First move into a screen' },
    { value: 'failed', label: 'Failed move' },
  ],
  node_legend: [ok, { shape: 'failed', word: 'Failed' }],
  scans: [
    { id: '01a0da64-3bf1-7000-8000-000000000002', persona: 'client', status: { shape: 'ok', word: 'Completed' }, started_at: '2026-10-23T01:00:00.000Z' },
    { id: '01a0da64-3bf1-7000-8000-000000000001', persona: 'guest', status: { shape: 'stopped', word: 'Interrupted' }, started_at: '2026-10-22T01:00:00.000Z' },
  ],
  personas: ['client', 'guest'],
  nodes: [
    rnode('sc-home', '/', 'Strona główna', { near: ['sc-form'] }),
    rnode('sc-form', '/form', 'Wniosek', {
      deck: true,
      states: 2,
      marked: true,
      chips: [
        { word: '2 states', variant: null },
        { word: '+2 queued', variant: 'dashed' },
      ],
      near: ['sc-home'],
      y: 166,
      depth: 1,
    }),
    { ...rnode('family:/oferta', '/oferta', '14 pages'), kind: 'family', first_state: null, states: 14, depth: 1 },
  ],
  edges: [{ state: null, d: 'M75 96 C75 131 75 131 75 166' }],
  width: 530,
  height: 262,
  node_h: 96,
  screens: 16,
  transitions: 3,
  queued: 2,
  open_marks: 1,
};

export const recordedNode = {
  screen_id: 'sc-form',
  route: '/form',
  title: 'Wniosek',
  first_state: 'st-f1',
  states: [
    { id: 'st-f1', label: 'Step 1 · Dane', kind: { shape: 'ok', word: 'Main' } },
    { id: 'st-f1v', label: 'Step 1 · Dane', kind: { shape: 'todo', word: 'Validation' } },
  ],
  scans: [recorded.scans[0]],
  personas: ['client'],
  moves: [{ label: 'Dalej', to_route: '/form/2', to_title: 'Krok 2', times: 2, failed: false }],
  items: [{ label: 'Pomoc', reason: null, status: { shape: 'queued', word: 'Queued' } }],
  outcomes: [{ word: '1 next', variant: null }],
  marks: [
    { kind: 'start', label: 'Start here', hint: 'The next focused scan starts here.', on: false, state: 'st-f1' },
    { kind: 'skip', label: 'Skip', hint: 'Leave this screen out.', on: true, state: 'st-f1v' },
  ],
  probe: { state: 'st-f1', on: true },
};

export const recordedPages = {
  portal: 'shop',
  q: '',
  page: 1,
  pages: 2,
  total: 30,
  every: 30,
  rows: [
    {
      state: 'st-home',
      title: 'Strona główna',
      route: '/',
      picture: '/evidence/shots/home.png',
      confidence: { shape: 'ok', word: 'Observed' },
      probe_marked: false,
      probe: null,
      scans: 2,
      personas: ['client', 'guest'],
      last_seen: '2026-10-23T01:00:00.000Z',
    },
    {
      state: 'st-f1',
      title: 'Wniosek',
      route: '/form',
      picture: null,
      confidence: { shape: 'ok', word: 'Observed' },
      probe_marked: true,
      probe: null,
      scans: 1,
      personas: ['client'],
      last_seen: null,
    },
  ],
  steps: 1,
  steps_marked: 1,
  steps_unprobed: 0,
};

export const SCAN = '01a0da64-3bf1-7000-8000-000000000001';

export const scanHead = {
  id: SCAN,
  portal: 'shop',
  persona: 'guest',
  status: { shape: 'stopped', word: 'Interrupted' },
  warning: 'step budget reached',
  facts: [
    { label: 'Started (UTC)', value: '2026-10-22T01:00:00.000Z' },
    { label: 'Duration', value: '4m 02s' },
  ],
  tabs: [
    { id: 'graph', label: 'Graph', count: 2 },
    { id: 'states', label: 'States', count: 3 },
  ],
  needs_attention: true,
};

const snode = (id: string, route: string, title: string, order: number, more: object = {}) => ({
  id,
  route,
  title,
  status: ok,
  state: null,
  state_id: `st-${id}`,
  order,
  failures: [],
  queued: 0,
  unreachable: 0,
  blocked: 0,
  stopped_here: false,
  chips: [],
  near: [],
  x: 0,
  y: 0,
  ...more,
});

export const scanGraph = {
  scan: SCAN,
  recovery: {
    status: { shape: 'stopped', word: 'Interrupted' },
    stopped: true,
    persona: 'guest',
    environment: 'sandbox',
    warning: 'step budget reached',
    steps: 12,
    queued: 1,
  },
  nodes: [
    snode('sc-home', '/', 'Start', 1, { near: ['sc-list'] }),
    snode('sc-list', '/oferty', 'Oferty', 2, {
      status: { shape: 'failed', word: 'Failed' },
      state: 'failed',
      failures: [{ transition: 'e-bad', label: 'Dalej', error: 'selector not found', at: '2026-10-22T01:02:00.000Z' }],
      queued: 1,
      stopped_here: true,
      chips: [{ word: '1 failed', variant: 'fail' }],
      near: ['sc-home'],
      y: 166,
    }),
  ],
  edges: [{ state: null, d: 'M75 96 C75 131 75 131 75 166' }],
  width: 300,
  height: 262,
  node_h: 96,
  stop_node: 'sc-list',
  open_node: 'sc-list',
  path: ['sc-home', 'sc-list'],
  failures: 1,
  failed_moves: 0,
  unreachable: 0,
  variations: [
    { value: 'none', label: 'As before' },
    { value: 'wait_longer', label: 'Wait longer' },
  ],
  legend: [ok, { shape: 'failed', word: 'Failed' }],
  edge_legend: [
    { value: '', label: 'First move into a screen' },
    { value: 'failed', label: 'Failed move' },
  ],
};
