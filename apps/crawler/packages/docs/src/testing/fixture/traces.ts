/** The fixture's trace runs (`addTraceRun`, `addBoundaryTrace`): a process row and its ordered steps. */
import type { TraceFixture } from '../fixture-store.js';
import { action, FIXTURE_TS, insert, observe, run, transition, type Builder } from './rows.js';

/** What a trace reuses from the map run: its states, their snapshots and two action descriptors. */
export interface MapRun {
  portalId: string;
  states: { home: string; car: string; vehicle: string; contact: string };
  refs: { home: string; car: string; vehicle: string; contact: string; other: string };
  calculate: { role: string; accessible_name: string };
  next: { role: string; accessible_name: string };
  ceiling: string;
}

interface StepSpec {
  intent: string;
  kind: 'navigate' | 'click' | 'fill' | 'check' | 'select';
  actionId: string | null;
  transitionId: string | null;
  value: string | null;
  before: string | null;
  after: string | null;
  outcomes: string[];
  ref: string;
}

interface TraceBody {
  steps: StepSpec[];
  outcome: 'goal_reached' | 'boundary_reached';
  boundaryActionId: string | null;
  observedResult: string;
  notObservable: string | null;
}

/** A trace run, its process row and ordered steps, written the way the crawler server writes them. */
function trace(
  b: Builder,
  m: MapRun,
  process: { environment: string; name: string; goal: string },
  build: (runId: string) => TraceBody,
): TraceFixture {
  const traceRun = run(b, m.portalId, { mode: 'trace', environment: process.environment });
  for (const [s, ref] of [
    [m.states.home, m.refs.home],
    [m.states.car, m.refs.car],
    [m.states.vehicle, m.refs.vehicle],
  ] as const)
    observe(b, traceRun, s, ref);
  const built = build(traceRun);
  const processId = b.nextId();
  insert(b, 'processes', {
    id: processId,
    run_id: traceRun,
    portal_id: m.portalId,
    persona_id: 'guest',
    name: process.name,
    goal: process.goal,
    followup_record_id: null,
    status: 'recorded',
    outcome: built.outcome,
    boundary_action_id: built.boundaryActionId,
    observed_result: built.observedResult,
    not_observable: built.notObservable,
    created_at: FIXTURE_TS,
    ended_at: FIXTURE_TS,
  });
  const stepIds = built.steps.map((s, i) => {
    const id = b.nextId();
    insert(b, 'process_steps', {
      id,
      process_id: processId,
      ord: i + 1,
      intent: s.intent,
      kind: s.kind,
      action_id: s.actionId,
      transition_id: s.transitionId,
      value: s.value,
      state_before: s.before,
      state_after: s.after,
      outcomes_json: JSON.stringify(s.outcomes),
      evidence_ref: s.ref,
      confidence: 'observed',
      created_at: FIXTURE_TS,
    });
    return id;
  });
  return {
    runId: traceRun,
    processId,
    stepIds,
    transitionIds: built.steps.map((s) => s.transitionId ?? undefined),
    boundaryActionId: built.boundaryActionId,
  };
}

/** The two steps both traces start with: open the car page, then the calculator. */
function openCalculator(m: MapRun, calc: string, toVehicle: string): StepSpec[] {
  return [
    {
      intent: 'Open the car insurance page',
      kind: 'navigate',
      actionId: null,
      transitionId: null,
      value: null,
      before: null,
      after: m.states.car,
      outcomes: ['page "Ubezpieczenie samochodu" opened'],
      ref: m.refs.car,
    },
    {
      intent: 'Open the premium calculator',
      kind: 'click',
      actionId: calc,
      transitionId: toVehicle,
      value: null,
      before: m.states.car,
      after: m.states.vehicle,
      outcomes: ['navigated to /kalkulator/pojazd'],
      ref: m.refs.vehicle,
    },
  ];
}

export function addTraceRun(b: Builder, m: MapRun): TraceFixture {
  const process = {
    environment: 'sandbox',
    name: 'Calculate a car premium',
    goal: 'See an OC/AC premium for a car',
  };
  return trace(b, m, process, (r) => {
    const calc = action(b, { runId: r, stateId: m.states.car }, m.calculate, {
      safetyClass: 'read',
      skipReason: null,
    });
    const model = action(
      b,
      { runId: r, stateId: m.states.vehicle },
      { role: 'textbox', accessible_name: 'Model' },
      { safetyClass: 'read', skipReason: null },
    );
    const toVehicle = transition(
      b,
      { runId: r, from: m.states.car, to: m.states.vehicle },
      { action: m.calculate, ref: m.refs.vehicle },
    );
    return {
      outcome: 'goal_reached',
      boundaryActionId: null,
      notObservable: null,
      observedResult: 'The calculator form "Dane pojazdu" is shown; no premium is displayed yet.',
      steps: [
        ...openCalculator(m, calc, toVehicle),
        {
          intent: 'Enter the vehicle model',
          kind: 'fill',
          actionId: model,
          transitionId: null,
          value: 'Test Model',
          before: m.states.vehicle,
          after: null,
          outcomes: ['field "Model" accepted the value'],
          ref: m.refs.vehicle,
        },
      ],
    };
  });
}

export function addBoundaryTrace(b: Builder, m: MapRun): TraceFixture {
  const process = {
    environment: 'production',
    name: 'Buy a car policy',
    goal: 'Reach the purchase confirmation',
  };
  return trace(b, m, process, (r) => {
    const calc = action(b, { runId: r, stateId: m.states.car }, m.calculate, {
      safetyClass: 'read',
      skipReason: null,
    });
    const dalej = action(b, { runId: r, stateId: m.states.vehicle }, m.next, {
      safetyClass: 'mutating',
      skipReason: m.ceiling,
    });
    const toVehicle = transition(
      b,
      { runId: r, from: m.states.car, to: m.states.vehicle },
      { action: m.calculate, ref: m.refs.vehicle },
    );
    return {
      outcome: 'boundary_reached',
      boundaryActionId: dalej,
      notObservable: 'What follows "Dalej": the next calculator step and the premium.',
      observedResult: 'The calculator form is shown; the next step needs a mutating action.',
      steps: openCalculator(m, calc, toVehicle),
    };
  });
}
