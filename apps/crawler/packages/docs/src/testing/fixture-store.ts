import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEvidenceStore,
  elementKeys,
  newId,
  parseAriaYaml,
  type EvidenceStore,
  type Layout,
} from '@mudpuppy/core';
import { migrateUp, openDb, type OpenedDb, type MudPuppyDb } from '@mudpuppy/store';
import {
  CONTACT_FIELDS,
  SNAPSHOTS,
  VEHICLE_BOXES,
  VEHICLE_FIELDS,
  VEHICLE_PNG,
  fixturePng,
} from './fixture/data.js';
import {
  action,
  button,
  FIXTURE_TS,
  form,
  insert,
  link,
  networkCall,
  observe,
  question,
  run,
  state,
  transition,
  type Builder,
} from './fixture/rows.js';
import { addBoundaryTrace, addTraceRun, type MapRun } from './fixture/traces.js';

export { FIXTURE_TS } from './fixture/rows.js';

// packages/docs/src/testing -> repo root is six levels up.
const MIGRATIONS = fileURLToPath(new URL('../../../../../../data/migrations', import.meta.url));

export interface FixtureStoreOptions {
  /** Portal the map run belongs to. Tests pass the reference portal's id; the default is neutral. */
  portalId?: string;
  /**
   * Counter-based UUIDv7-shaped ids (`00000000-0000-7000-8000-000000000001`, …) instead of random
   * ones, so rendered output that prints ids (the SRS export goldens) is byte-stable across runs.
   */
  deterministicIds?: boolean;
}

/** The n-th fixed id: valid UUID shape (version 7, variant 8), sorted in creation order. */
export function fixedId(n: number): string {
  return `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

export interface FixtureStore {
  opened: OpenedDb;
  db: MudPuppyDb;
  raw: OpenedDb['raw'];
  /** Temp directory holding the evidence files the seeded rows point at. */
  evidenceDir: string;
  evidence: EvidenceStore;
  portalId: string;
  /** The id source rows were written with (fixed or random, per `deterministicIds`). */
  nextId: () => string;
  /** The completed map run of `portalId`. */
  runId: string;
  states: { home: string; car: string; vehicle: string; contact: string };
  forms: { vehicle: string; contact: string };
  transitions: {
    homeToCar: string;
    carToVehicle: string;
    homeToContact: string;
    buySkipped: string;
  };
  actions: { calculate: string; next: string; buy: string; send: string };
  networkCalls: { quote: string; contact: string };
  /** Crawler questions: [what follows "Dalej", what happens after "Kup polisę"]. */
  openQuestions: [string, string];
  decision: string;
  /** A second portal with one run, for PORTAL_MISMATCH. */
  otherPortalId: string;
  otherRunId: string;
  otherState: string;
  /** The calculator state's screenshot and layout (spec 008); other states have none. */
  visuals: { vehicle: { screenshot_ref: string; layout_ref: string; layout: Layout } };
  /**
   * Another completed run (of `portalId` unless told otherwise) that saw the home state again and
   * recorded one transition of its own; for RUN_NOT_IN_SESSION and multi-run sessions.
   */
  addRun(portalId?: string): { runId: string; transitionId: string };
  /**
   * A completed sandbox trace run of `portalId`: process "Calculate a car premium", outcome
   * `goal_reached`, three steps (navigate, click, fill). Added on demand so the default fixture
   * keeps its single map run.
   */
  addTraceRun(): TraceFixture;
  /**
   * A completed trace run under a `read` limit (labelled production): two steps, then the
   * mutating "Dalej" action refused,
   * outcome `boundary_reached` with `not_observable` and `boundary_action_id` set.
   */
  addBoundaryTrace(): TraceFixture;
  close(): Promise<void>;
}

export interface TraceFixture {
  runId: string;
  processId: string;
  /** Step ids in `ord` order (1..n). */
  stepIds: string[];
  /** The transition each click step executed as, by step index (undefined for navigate/fill). */
  transitionIds: (string | undefined)[];
  /** Set on the boundary trace: the refused action that ended it. */
  boundaryActionId: string | null;
}

type Refs = MapRun['refs'];
type States = MapRun['states'];

async function storeSnapshots(evidence: EvidenceStore): Promise<Refs> {
  return {
    home: await evidence.storeText(SNAPSHOTS.home, 'yaml'),
    car: await evidence.storeText(SNAPSHOTS.car, 'yaml'),
    vehicle: await evidence.storeText(SNAPSHOTS.vehicle, 'yaml'),
    contact: await evidence.storeText(SNAPSHOTS.contact, 'yaml'),
    other: await evidence.storeText(SNAPSHOTS.other, 'yaml'),
  };
}

function seedStates(b: Builder, at: { portal: string; runId: string }, refs: Refs): States {
  const suffix = ' | Towarzystwo Ubezpieczeń Wzorcowych';
  return {
    home: state(b, at, { route: '/', title: `Start${suffix}`, ref: refs.home }),
    car: state(b, at, {
      route: '/ubezpieczenia/samochod',
      title: `Ubezpieczenie samochodu${suffix}`,
      ref: refs.car,
    }),
    vehicle: state(b, at, {
      route: '/kalkulator/pojazd',
      title: `Kalkulator OC/AC — dane pojazdu${suffix}`,
      ref: refs.vehicle,
    }),
    contact: state(b, at, { route: '/kontakt', title: `Kontakt${suffix}`, ref: refs.contact }),
  };
}

/** The calculator page has a screenshot and a layout (spec 008); the other states predate them. */
async function storeVisuals(
  b: Builder,
  evidence: EvidenceStore,
  vehicleState: string,
): Promise<FixtureStore['visuals']> {
  const vehiclePng = fixturePng(VEHICLE_PNG.width, VEHICLE_PNG.height, VEHICLE_BOXES);
  const vehicleLayout: Layout = {
    version: 1,
    viewport: { width: VEHICLE_PNG.width, height: VEHICLE_PNG.height },
    page: { width: VEHICLE_PNG.width, height: VEHICLE_PNG.height },
    cut: false,
    elements: elementKeys(parseAriaYaml(SNAPSHOTS.vehicle)).map((e) => ({
      key: e.key,
      role: e.role,
      name: e.name,
      box: VEHICLE_BOXES[e.key] ?? null,
    })),
  };
  const visuals = {
    vehicle: {
      screenshot_ref: await evidence.storeBinary(vehiclePng, 'png'),
      layout_ref: await evidence.storeJson(vehicleLayout),
      layout: vehicleLayout,
    },
  };
  b.raw
    .prepare('UPDATE states SET screenshot_ref = ?, layout_ref = ? WHERE id = ?')
    .run(visuals.vehicle.screenshot_ref, visuals.vehicle.layout_ref, vehicleState);
  return visuals;
}

/** The map run's pressable elements: two links, two refused mutating buttons. */
function descriptors(refs: Refs) {
  return {
    calculate: link('Oblicz składkę', '/kalkulator/pojazd', refs.car),
    next: button('Dalej', { method: 'GET', action: '/kalkulator/kierowca' }, refs.vehicle),
    buy: button('Kup polisę', { method: 'POST', action: '/kalkulator/kup' }, refs.car),
    send: button('Wyślij', { method: 'POST', action: '/kontakt' }, refs.contact),
    ceiling: 'ceiling:read: classified mutating, above the effective ceiling read',
  };
}

type Descriptors = ReturnType<typeof descriptors>;

function seedActions(b: Builder, runId: string, states: States, d: Descriptors) {
  const refused = { safetyClass: 'mutating', skipReason: d.ceiling };
  return {
    calculate: action(b, { runId, stateId: states.car }, d.calculate, {
      safetyClass: 'read',
      skipReason: null,
    }),
    next: action(b, { runId, stateId: states.vehicle }, d.next, refused),
    buy: action(b, { runId, stateId: states.car }, d.buy, refused),
    send: action(b, { runId, stateId: states.contact }, d.send, refused),
  };
}

function seedTransitions(b: Builder, runId: string, m: MapRun, d: Descriptors) {
  const { states, refs } = m;
  return {
    homeToCar: transition(
      b,
      { runId, from: states.home, to: states.car },
      { action: link('Samochód', '/ubezpieczenia/samochod', refs.home), ref: refs.car },
    ),
    carToVehicle: transition(
      b,
      { runId, from: states.car, to: states.vehicle },
      { action: d.calculate, ref: refs.vehicle },
    ),
    homeToContact: transition(
      b,
      { runId, from: states.home, to: states.contact },
      { action: link('Kontakt', '/kontakt', refs.home), ref: refs.contact },
    ),
    buySkipped: transition(
      b,
      { runId, from: states.car, to: null },
      { action: d.buy, ref: refs.car },
      { safety_class: 'mutating', status: 'skipped' },
    ),
  };
}

/** The calls, the crawler's two questions and its refusal of "Kup polisę". */
function seedNotes(
  b: Builder,
  runId: string,
  {
    states,
    transitions,
    buy,
  }: { states: States; transitions: FixtureStore['transitions']; buy: string },
) {
  const networkCalls = {
    quote: networkCall(
      b,
      { runId, transitionId: transitions.carToVehicle },
      {
        method: 'GET',
        urlTemplate: '/api/kalkulator/marki',
        req: {},
        res: { marki: 'array<string>' },
      },
    ),
    contact: networkCall(
      b,
      { runId, transitionId: transitions.homeToContact },
      {
        method: 'GET',
        urlTemplate: '/api/kontakt/tematy',
        req: {},
        res: { tematy: 'array<string>' },
      },
    ),
  };
  const openQuestions: [string, string] = [
    question(
      b,
      runId,
      '"Dalej" is classified mutating and blocked at the read ceiling. How many calculator steps follow?',
      states.vehicle,
    ),
    question(b, runId, 'What happens after "Kup polisę"? It was refused as mutating.', states.car),
  ];
  const decision = b.nextId();
  insert(b, 'decision_log', {
    id: decision,
    run_id: runId,
    kind: 'skip',
    rule: 'ceiling:read',
    reason: 'classified mutating, above the effective ceiling read',
    subject_ref: buy,
    detail_json: null,
    created_at: FIXTURE_TS,
  });
  return { networkCalls, openQuestions, decision };
}

/**
 * An in-memory store, migrated, holding one completed map run shaped like the reference portal
 * (four screens, two forms, network calls, a refused mutating action, crawler notes) and a second
 * portal with one run. Layer B is empty: tests write it through the code under test.
 */
export async function makeFixtureStore(opts: FixtureStoreOptions = {}): Promise<FixtureStore> {
  const portalId = opts.portalId ?? 'fixture-insurer';
  const otherPortalId = 'other';
  let idCount = 0;
  const nextId = opts.deterministicIds ? () => fixedId(++idCount) : () => newId();
  const opened = openDb(':memory:');
  migrateUp(opened.raw, MIGRATIONS);
  const { raw } = opened;
  const b: Builder = { raw, nextId, fingerprints: 0 };
  const evidenceDir = mkdtempSync(join(tmpdir(), 'pf-docs-fixture-'));
  const evidence = createEvidenceStore(evidenceDir);
  const refs = await storeSnapshots(evidence);
  const runId = run(b, portalId);
  const states = seedStates(b, { portal: portalId, runId }, refs);
  const visuals = await storeVisuals(b, evidence, states.vehicle);
  const forms = {
    vehicle: form(b, { runId, stateId: states.vehicle }, VEHICLE_FIELDS, refs.vehicle),
    contact: form(b, { runId, stateId: states.contact }, CONTACT_FIELDS, refs.contact),
  };
  const d = descriptors(refs);
  const m: MapRun = { portalId, states, refs, ...d };
  const actions = seedActions(b, runId, states, d);
  const transitions = seedTransitions(b, runId, m, d);
  const notes = seedNotes(b, runId, { states, transitions, buy: actions.buy });
  const otherRunId = run(b, otherPortalId);
  const otherState = state(
    b,
    { portal: otherPortalId, runId: otherRunId },
    { route: '/', title: 'Start', ref: refs.other },
  );
  return {
    opened,
    db: opened.db,
    raw,
    evidenceDir,
    evidence,
    portalId,
    nextId,
    runId,
    states,
    forms,
    transitions,
    actions,
    ...notes,
    otherPortalId,
    otherRunId,
    otherState,
    visuals,
    addRun(portal = portalId) {
      const id = run(b, portal);
      const home = portal === portalId ? states.home : otherState;
      observe(b, id, home, portal === portalId ? refs.home : refs.other);
      return {
        runId: id,
        transitionId: transition(
          b,
          { runId: id, from: home, to: home },
          { action: link('Start', '/', refs.home), ref: refs.home },
        ),
      };
    },
    addTraceRun: () => addTraceRun(b, m),
    addBoundaryTrace: () => addBoundaryTrace(b, m),
    async close() {
      await opened.close();
      rmSync(evidenceDir, { recursive: true, force: true });
    },
  };
}
