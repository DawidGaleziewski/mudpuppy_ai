import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEvidenceStore,
  migrateUp,
  newId,
  openDb,
  type EvidenceStore,
  type OpenedDb,
  type PathfinderDb,
} from '@pathfinder/core';

// packages/docs/src/testing -> repo root is six levels up.
const MIGRATIONS = fileURLToPath(new URL('../../../../../../data/migrations', import.meta.url));

/** Fixed clock: nothing in the fixture depends on when the test runs. */
export const FIXTURE_TS = '2026-01-15T10:00:00.000Z';

export interface FixtureStoreOptions {
  /** Portal the map run belongs to. Tests pass the reference portal's id; the default is neutral. */
  portalId?: string;
}

export interface FixtureStore {
  opened: OpenedDb;
  db: PathfinderDb;
  raw: OpenedDb['raw'];
  /** Temp directory holding the evidence files the seeded rows point at. */
  evidenceDir: string;
  evidence: EvidenceStore;
  portalId: string;
  /** The completed map run of `portalId`. */
  runId: string;
  states: { home: string; car: string; vehicle: string; contact: string };
  forms: { vehicle: string; contact: string };
  edges: { homeToCar: string; carToVehicle: string; homeToContact: string; buySkipped: string };
  actions: { calculate: string; next: string; buy: string; send: string };
  networkCalls: { quote: string; contact: string };
  /** Crawler questions: [what follows "Dalej", what happens after "Kup polisę"]. */
  openQuestions: [string, string];
  ruleCandidate: string;
  decision: string;
  /** A second portal with one run, for PORTAL_MISMATCH. */
  otherPortalId: string;
  otherRunId: string;
  otherState: string;
  /**
   * Another completed run (of `portalId` unless told otherwise) that saw the home state again and
   * recorded one edge of its own; for RUN_NOT_IN_SESSION and multi-run sessions.
   */
  addRun(portalId?: string): { runId: string; edgeId: string };
  close(): Promise<void>;
}

const page = (heading: string, body: string): string =>
  [
    '- banner:',
    '  - navigation "Menu główne":',
    '    - link "Start":',
    '      - /url: /',
    '    - link "Samochód":',
    '      - /url: /ubezpieczenia/samochod',
    '    - link "Oblicz składkę":',
    '      - /url: /kalkulator/pojazd',
    '    - link "Kontakt":',
    '      - /url: /kontakt',
    '- main:',
    `  - heading "${heading}" [level=1]`,
    body,
  ].join('\n');

const SNAPSHOTS = {
  home: page(
    'Ubezpieczenia na każdą drogę',
    '  - paragraph: Porównaj oferty OC, Autocasco (AC) i Assistance.',
  ),
  car: page(
    'Ubezpieczenie samochodu',
    [
      '  - paragraph: OC jest obowiązkowe. Autocasco (AC) tylko dla pojazdów do 15 lat.',
      '  - link "Oblicz składkę":',
      '    - /url: /kalkulator/pojazd',
      '  - button "Kup polisę"',
    ].join('\n'),
  ),
  vehicle: page(
    'Kalkulator OC/AC — dane pojazdu',
    [
      '  - form "Dane pojazdu":',
      '    - combobox "Marka"',
      '    - textbox "Model"',
      '    - spinbutton "Rok produkcji"',
      '    - spinbutton "Pojemność silnika (cm³)"',
      '    - textbox "Kod pocztowy"',
      '    - text: Format NN-NNN',
      '    - button "Dalej"',
    ].join('\n'),
  ),
  contact: page(
    'Kontakt',
    [
      '  - form "Formularz kontaktowy":',
      '    - textbox "Imię"',
      '    - combobox "Temat"',
      '    - textbox "Wiadomość"',
      '    - textbox "Telefon"',
      '    - textbox "E-mail"',
      '    - text: Podaj telefon lub e-mail.',
      '    - button "Wyślij"',
    ].join('\n'),
  ),
  other: '- main:\n  - heading "Start" [level=1]',
} as const;

const VEHICLE_FIELDS = [
  {
    name: 'marka',
    type: 'select',
    required: true,
    options: ['— wybierz —', 'Toyota', 'Skoda', 'Inna'],
  },
  { name: 'model', type: 'text', required: true, constraints: { maxlength: 40 } },
  { name: 'rok_produkcji', type: 'number', required: true, constraints: { min: 1990, max: 2026 } },
  { name: 'pojemnosc', type: 'number', required: true, constraints: { min: 50, max: 8000 } },
  {
    name: 'kod_pocztowy',
    type: 'text',
    required: true,
    constraints: { pattern: '[0-9]{2}-[0-9]{3}' },
    validation_messages: ['Please fill out this field.'],
  },
];

const CONTACT_FIELDS = [
  { name: 'imie', type: 'text', required: true, constraints: { maxlength: 60 } },
  {
    name: 'temat',
    type: 'select',
    required: true,
    options: ['— wybierz —', 'Oferta', 'Szkoda', 'Inne'],
  },
  { name: 'wiadomosc', type: 'textarea', required: true, constraints: { maxlength: 1000 } },
  { name: 'telefon', type: 'tel', required: false, constraints: { pattern: '\\+?[0-9 ]{9,15}' } },
  { name: 'email', type: 'email', required: false },
];

/**
 * An in-memory store, migrated, holding one completed map run shaped like the reference portal
 * (four screens, two forms, network calls, a refused mutating action, crawler notes) and a second
 * portal with one run. Layer B is empty: tests write it through the code under test.
 */
export async function makeFixtureStore(opts: FixtureStoreOptions = {}): Promise<FixtureStore> {
  const portalId = opts.portalId ?? 'fixture-insurer';
  const otherPortalId = 'other';
  const opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  const { raw } = opened;
  const evidenceDir = mkdtempSync(join(tmpdir(), 'pf-docs-fixture-'));
  const evidence = createEvidenceStore(evidenceDir);

  const insert = (table: string, row: Record<string, unknown>): void => {
    const cols = Object.keys(row);
    raw
      .prepare(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      )
      .run(...cols.map((c) => row[c]));
  };

  const run = (portal: string): string => {
    const id = newId();
    insert('runs', {
      id,
      portal_id: portal,
      persona_id: 'guest',
      mode: 'map',
      environment: 'sandbox',
      env_version_or_date: '2026-01-15',
      seed_id: null,
      viewport: '1366x768',
      locale: 'pl-PL',
      browser: 'chromium',
      config_snapshot: '{}',
      status: 'completed',
      warning: null,
      steps_used: 12,
      elapsed_ms: 4200,
      max_depth_reached: 2,
      started_at: FIXTURE_TS,
      ended_at: FIXTURE_TS,
      coverage: null,
    });
    return id;
  };

  const observe = (runId: string, stateId: string, ref: string): void =>
    insert('state_observations', {
      run_id: runId,
      state_id: stateId,
      persona_id: 'guest',
      evidence_ref: ref,
      observed_at: FIXTURE_TS,
    });

  let fingerprints = 0;
  const state = (
    portal: string,
    runId: string,
    route: string,
    title: string,
    ref: string,
  ): string => {
    const id = newId();
    fingerprints += 1;
    insert('states', {
      id,
      portal_id: portal,
      fingerprint: fingerprints.toString(16).padStart(64, '0'),
      cluster_id: `cluster-${fingerprints}`,
      route_template: route,
      title,
      evidence_ref: ref,
      confidence: 'observed',
      stabilization: 'settled',
      first_seen_run: runId,
      created_at: FIXTURE_TS,
    });
    observe(runId, id, ref);
    return id;
  };

  const link = (name: string, href: string, snapshotRef: string) => ({
    role: 'link',
    accessible_name: name,
    locators: [{ kind: 'role', value: `role=link[name="${name}"]`, rank: 0 }],
    snapshot_ref: snapshotRef,
    nth: 0,
    href,
  });
  const button = (name: string, method: string, action: string, snapshotRef: string) => ({
    role: 'button',
    accessible_name: name,
    locators: [{ kind: 'role', value: `role=button[name="${name}"]`, rank: 0 }],
    snapshot_ref: snapshotRef,
    nth: 0,
    form: { method, action, hasPassword: false, purpose: 'other' },
  });

  const edge = (
    runId: string,
    from: string,
    to: string | null,
    action: object,
    ref: string,
    over: { safety_class?: string; status?: string } = {},
  ): string => {
    const id = newId();
    insert('edges', {
      id,
      run_id: runId,
      from_state: from,
      to_state: to,
      action_json: JSON.stringify(action),
      safety_class: over.safety_class ?? 'read',
      status: over.status ?? 'executed',
      evidence_ref: ref,
      confidence: 'observed',
      error: null,
      stabilization: 'settled',
      created_at: FIXTURE_TS,
    });
    return id;
  };

  const action = (
    runId: string,
    stateId: string,
    descriptor: { role: string; accessible_name: string },
    safetyClass: string,
    skipReason: string | null,
  ): string => {
    const id = newId();
    insert('actions', {
      id,
      run_id: runId,
      state_id: stateId,
      role: descriptor.role,
      accessible_name: descriptor.accessible_name,
      action_json: JSON.stringify(descriptor),
      safety_class: safetyClass,
      allowed: skipReason === null ? 1 : 0,
      skip_reason: skipReason,
      created_at: FIXTURE_TS,
    });
    return id;
  };

  const refs = {
    home: await evidence.storeText(SNAPSHOTS.home, 'yaml'),
    car: await evidence.storeText(SNAPSHOTS.car, 'yaml'),
    vehicle: await evidence.storeText(SNAPSHOTS.vehicle, 'yaml'),
    contact: await evidence.storeText(SNAPSHOTS.contact, 'yaml'),
    other: await evidence.storeText(SNAPSHOTS.other, 'yaml'),
  };

  const runId = run(portalId);
  const suffix = ' | Towarzystwo Ubezpieczeń Wzorcowych';
  const states = {
    home: state(portalId, runId, '/', `Start${suffix}`, refs.home),
    car: state(
      portalId,
      runId,
      '/ubezpieczenia/samochod',
      `Ubezpieczenie samochodu${suffix}`,
      refs.car,
    ),
    vehicle: state(
      portalId,
      runId,
      '/kalkulator/pojazd',
      `Kalkulator OC/AC — dane pojazdu${suffix}`,
      refs.vehicle,
    ),
    contact: state(portalId, runId, '/kontakt', `Kontakt${suffix}`, refs.contact),
  };

  const form = (stateId: string, fields: object, ref: string): string => {
    const id = newId();
    insert('forms', {
      id,
      run_id: runId,
      state_id: stateId,
      fields_json: JSON.stringify(fields),
      evidence_ref: ref,
      confidence: 'observed',
      created_at: FIXTURE_TS,
    });
    return id;
  };
  const forms = {
    vehicle: form(states.vehicle, VEHICLE_FIELDS, refs.vehicle),
    contact: form(states.contact, CONTACT_FIELDS, refs.contact),
  };

  const calculate = link('Oblicz składkę', '/kalkulator/pojazd', refs.car);
  const next = button('Dalej', 'GET', '/kalkulator/kierowca', refs.vehicle);
  const buy = button('Kup polisę', 'POST', '/kalkulator/kup', refs.car);
  const send = button('Wyślij', 'POST', '/kontakt', refs.contact);
  const ceiling = 'ceiling:read: classified mutating, above the effective ceiling read';
  const actions = {
    calculate: action(runId, states.car, calculate, 'read', null),
    next: action(runId, states.vehicle, next, 'mutating', ceiling),
    buy: action(runId, states.car, buy, 'mutating', ceiling),
    send: action(runId, states.contact, send, 'mutating', ceiling),
  };

  const edges = {
    homeToCar: edge(
      runId,
      states.home,
      states.car,
      link('Samochód', '/ubezpieczenia/samochod', refs.home),
      refs.car,
    ),
    carToVehicle: edge(runId, states.car, states.vehicle, calculate, refs.vehicle),
    homeToContact: edge(
      runId,
      states.home,
      states.contact,
      link('Kontakt', '/kontakt', refs.home),
      refs.contact,
    ),
    buySkipped: edge(runId, states.car, null, buy, refs.car, {
      safety_class: 'mutating',
      status: 'skipped',
    }),
  };

  const networkCall = (
    edgeId: string,
    method: string,
    urlTemplate: string,
    req: object,
    res: object,
  ): string => {
    const id = newId();
    insert('network_calls', {
      id,
      run_id: runId,
      edge_id: edgeId,
      method,
      url_template: urlTemplate,
      status: 200,
      req_schema: JSON.stringify(req),
      res_schema: JSON.stringify(res),
      console_errors: '[]',
      created_at: FIXTURE_TS,
    });
    return id;
  };
  const networkCalls = {
    quote: networkCall(
      edges.carToVehicle,
      'GET',
      '/api/kalkulator/marki',
      {},
      { marki: 'array<string>' },
    ),
    contact: networkCall(
      edges.homeToContact,
      'GET',
      '/api/kontakt/tematy',
      {},
      { tematy: 'array<string>' },
    ),
  };

  const question = (text: string, aboutRef: string): string => {
    const id = newId();
    insert('open_questions', {
      id,
      run_id: runId,
      text,
      about_ref: aboutRef,
      status: 'open',
      created_at: FIXTURE_TS,
    });
    return id;
  };
  const openQuestions: [string, string] = [
    question(
      '"Dalej" is classified mutating and blocked at the read ceiling. How many calculator steps follow?',
      states.vehicle,
    ),
    question('What happens after "Kup polisę"? It was refused as mutating.', states.car),
  ];

  const ruleCandidate = newId();
  insert('rule_candidates', {
    id: ruleCandidate,
    run_id: runId,
    text: 'Autocasco (AC) seems to be offered only for vehicles younger than 15 years.',
    about_ref: states.car,
    evidence_ref: refs.car,
    confidence: 'inferred',
    created_at: FIXTURE_TS,
  });

  const decision = newId();
  insert('decision_log', {
    id: decision,
    run_id: runId,
    kind: 'skip',
    rule: 'ceiling:read',
    reason: 'classified mutating, above the effective ceiling read',
    subject_ref: actions.buy,
    detail_json: null,
    created_at: FIXTURE_TS,
  });

  const otherRunId = run(otherPortalId);
  const otherState = state(otherPortalId, otherRunId, '/', 'Start', refs.other);

  return {
    opened,
    db: opened.db,
    raw,
    evidenceDir,
    evidence,
    portalId,
    runId,
    states,
    forms,
    edges,
    actions,
    networkCalls,
    openQuestions,
    ruleCandidate,
    decision,
    otherPortalId,
    otherRunId,
    otherState,
    addRun(portal = portalId) {
      const id = run(portal);
      const home = portal === portalId ? states.home : otherState;
      observe(id, home, portal === portalId ? refs.home : refs.other);
      return { runId: id, edgeId: edge(id, home, home, link('Start', '/', refs.home), refs.home) };
    },
    async close() {
      await opened.close();
      rmSync(evidenceDir, { recursive: true, force: true });
    },
  };
}
