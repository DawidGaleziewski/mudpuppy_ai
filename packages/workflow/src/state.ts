// Workflow state of one portal, derived from recorded data only (R-30 FR-002, FR-009, research R4).
// Pure: the chat service loads the rows and passes them in; the orchestrator reads the result
// through `workflow_state` and may not invent steps or moves of its own.

export const STEPS = ['scan', 'map', 'narrow', 'document', 'amend'] as const;
export type Step = (typeof STEPS)[number];

/** `stopped`: the BA stopped the step's run on purpose; it can be resumed (spec 011 F-04). */
export const STEP_STATUSES = ['todo', 'pending', 'in_progress', 'done', 'failed', 'stopped'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export interface RunFact {
  id: string;
  mode: string; // 'map' | 'trace'
  status: 'running' | 'completed' | 'stopped_warning' | 'interrupted';
  warning?: string | null;
  startedAt: string;
  endedAt?: string | null;
}

export interface ProcessFact {
  id: string;
  name: string;
  outcome: 'goal_reached' | 'boundary_reached' | 'stopped' | 'abandoned' | null;
}

export interface SessionFact {
  id: string;
  status: 'running' | 'completed' | 'interrupted';
  startedAt: string;
  endedAt?: string | null;
}

export interface ScopeFact {
  id: string;
  processName: string;
  createdAt: string;
}

/** A step row the chat service wrote (workflow_steps): it knows about requests not yet in the data. */
export interface RecordedStep {
  step: Step;
  status: StepStatus;
  errorRef?: string | null;
  updatedAt: string;
}

export interface WorkflowInput {
  portal: string | null;
  /** A portal config with a URL exists (portals/<id>.yaml). */
  portalConfigured: boolean;
  personas: readonly string[];
  /** At least one credential reference is stored in the vault for this portal. */
  credentialsStored: boolean;
  runs: readonly RunFact[];
  statesRecorded: number;
  frontierPending: number;
  processes: readonly ProcessFact[];
  sessions: readonly SessionFact[];
  docRecords: number;
  scopes: readonly ScopeFact[];
  activeAmendments: number;
  supersededAmendments: number;
  recordedSteps: readonly RecordedStep[];
}

export interface StepState {
  step: Step;
  status: StepStatus;
  /** Plain-language one-liner for the tracker. */
  detail: string;
  errorRef: string | null;
}

export const MOVES = [
  'scan',
  'continue_scan',
  'map_process',
  'narrow_process',
  'document',
  'amend',
  'review_superseded',
] as const;
export type Move = (typeof MOVES)[number];

export interface NextMove {
  move: Move;
  valid: boolean;
  /** What must exist first; empty when valid. */
  missing: string[];
}

export interface WorkflowState {
  portal: string | null;
  steps: StepState[];
  moves: NextMove[];
  /** Valid moves in the order the chat should propose them. */
  proposals: Move[];
  /** True while any step is pending or in progress (drives the working animation). */
  busy: boolean;
}

const MAP_MODE = 'map';
const TRACE_MODE = 'trace';

function latest<T>(items: readonly T[], at: (item: T) => string): T | undefined {
  let best: T | undefined;
  for (const item of items) if (best === undefined || at(item) > at(best)) best = item;
  return best;
}

function fromRuns(runs: readonly RunFact[], noun: string): Omit<StepState, 'step'> {
  if (runs.some((r) => r.status === 'running'))
    return { status: 'in_progress', detail: `${noun} running`, errorRef: null };
  const done = runs.filter((r) => r.status === 'completed');
  if (done.length > 0)
    return {
      status: 'done',
      detail: `${String(done.length)} ${noun} completed`,
      errorRef: null,
    };
  const last = latest(runs, (r) => r.startedAt);
  if (last?.status === 'stopped_warning')
    return {
      status: 'failed',
      detail: `${noun} stopped: ${last.warning ?? 'warning'}`,
      errorRef: null,
    };
  if (last?.status === 'interrupted')
    return { status: 'failed', detail: `${noun} interrupted`, errorRef: null };
  return { status: 'todo', detail: `no ${noun} yet`, errorRef: null };
}

function derived(input: WorkflowInput): Record<Step, Omit<StepState, 'step'>> {
  const mapRuns = input.runs.filter((r) => r.mode === MAP_MODE);
  const traceRuns = input.runs.filter((r) => r.mode === TRACE_MODE);
  const scan = fromRuns(mapRuns, 'scan');
  if (scan.status === 'done' && input.frontierPending > 0)
    scan.detail = `${scan.detail}; ${String(input.frontierPending)} pages still queued`;

  const mapped = input.processes.filter((p) => p.outcome !== null);
  let map: Omit<StepState, 'step'>;
  if (traceRuns.some((r) => r.status === 'running'))
    map = {
      status: 'in_progress',
      detail: 'process trace running',
      errorRef: null,
    };
  else if (mapped.length > 0)
    map = {
      status: 'done',
      detail: `${String(mapped.length)} process(es) traced`,
      errorRef: null,
    };
  else
    map = {
      ...fromRuns(traceRuns, 'process trace'),
      detail: 'no process traced yet',
    };
  if (map.status === 'failed') map.detail = 'last process trace did not finish';

  const narrow: Omit<StepState, 'step'> =
    input.scopes.length > 0
      ? {
          status: 'done',
          detail: `scope: ${latest(input.scopes, (s) => s.createdAt)?.processName ?? ''}`,
          errorRef: null,
        }
      : { status: 'todo', detail: 'no process picked yet', errorRef: null };

  let document: Omit<StepState, 'step'>;
  const lastSession = latest(input.sessions, (s) => s.startedAt);
  if (input.sessions.some((s) => s.status === 'running'))
    document = {
      status: 'in_progress',
      detail: 'documentation running',
      errorRef: null,
    };
  else if (lastSession?.status === 'completed')
    document = {
      status: 'done',
      detail: `${String(input.docRecords)} documentation record(s)`,
      errorRef: null,
    };
  else if (lastSession?.status === 'interrupted')
    document = {
      status: 'failed',
      detail: 'documentation interrupted',
      errorRef: null,
    };
  else
    document = {
      status: 'todo',
      detail: 'no documentation yet',
      errorRef: null,
    };

  const amend: Omit<StepState, 'step'> =
    input.activeAmendments > 0
      ? {
          status: 'done',
          detail: `${String(input.activeAmendments)} amendment(s)`,
          errorRef: null,
        }
      : {
          status: 'todo',
          detail: 'no amendments yet (optional)',
          errorRef: null,
        };
  if (input.supersededAmendments > 0)
    amend.detail = `${amend.detail}; ${String(input.supersededAmendments)} superseded to review`;

  return { scan, map, narrow, document, amend };
}

/** Time of the newest data that belongs to a step; a recorded row older than this is stale. */
function lastActivity(input: WorkflowInput, step: Step): string | undefined {
  const runTime = (r: RunFact): string => r.endedAt ?? r.startedAt;
  const newest = (times: string[]): string | undefined =>
    times.length === 0 ? undefined : times.reduce((a, b) => (a > b ? a : b));
  switch (step) {
    case 'scan':
      return newest(input.runs.filter((r) => r.mode === MAP_MODE).map(runTime));
    case 'map':
      return newest(input.runs.filter((r) => r.mode === TRACE_MODE).map(runTime));
    case 'narrow':
      return newest(input.scopes.map((s) => s.createdAt));
    case 'document':
      return newest(input.sessions.map((s) => s.endedAt ?? s.startedAt));
    case 'amend':
      return undefined;
  }
}

/**
 * Merge what the data says with what the chat recorded. Data wins once it shows the work
 * running, and whenever it is newer than the recorded row. A recorded `pending` or `failed` that
 * is newer than the data fills the gap before the data catches up (request accepted but no run
 * yet, or a failure before anything was written). A recorded `done`/`todo` never overrides data.
 */
function reconcile(
  fromData: Omit<StepState, 'step'>,
  recorded: RecordedStep | undefined,
  dataAt: string | undefined,
): Omit<StepState, 'step'> {
  if (recorded === undefined) return fromData;
  if (fromData.status === 'in_progress') return fromData;
  // The BA's [stop]: the run reads as interrupted, but nothing failed (spec 011 F-04). A later
  // request records a newer row, and a completed run shows as done.
  if (recorded.status === 'stopped' && fromData.status !== 'done')
    return {
      status: 'stopped',
      detail: 'stopped by you; resume continues from the pages still queued',
      errorRef: null,
    };
  if (dataAt !== undefined && dataAt >= recorded.updatedAt) return fromData;
  if (recorded.status === 'pending' || recorded.status === 'in_progress') {
    return {
      status: 'pending',
      detail: 'requested, waiting to start',
      errorRef: null,
    };
  }
  if (recorded.status === 'failed') {
    return {
      status: 'failed',
      // Not "before any work was recorded": a stopped or stuck run may have recorded a lot (F-19).
      detail:
        fromData.status === 'failed'
          ? fromData.detail
          : 'the last request failed; its error reference says why (recorded work is kept)',
      errorRef: recorded.errorRef ?? null,
    };
  }
  return fromData;
}

/** The newest recorded row per step. */
function newestRecorded(rows: readonly RecordedStep[]): Map<Step, RecordedStep> {
  const out = new Map<Step, RecordedStep>();
  for (const row of rows) {
    const prev = out.get(row.step);
    if (prev === undefined || row.updatedAt > prev.updatedAt) out.set(row.step, row);
  }
  return out;
}

function moves(input: WorkflowInput, steps: Record<Step, Omit<StepState, 'step'>>): NextMove[] {
  const scanned = input.statesRecorded > 0;
  const scanBusy = steps.scan.status === 'in_progress' || steps.scan.status === 'pending';
  const missingScanInputs: string[] = [];
  if (input.portal === null) missingScanInputs.push('portal');
  if (!input.portalConfigured) missingScanInputs.push('portal URL');
  if (input.personas.length === 0) missingScanInputs.push('persona');
  if (!input.credentialsStored) missingScanInputs.push('test-user credentials');
  const needScan = scanned ? [] : ['a completed scan'];
  const noOther = (busy: boolean): string[] => (busy ? ['the running scan to finish'] : []);
  const unfinished =
    input.frontierPending > 0 || steps.scan.status === 'failed' || steps.scan.status === 'stopped';

  const out: NextMove[] = [
    {
      // A scanned portal may get a new scan too, e.g. one focused on a part (spec 011 FR-018).
      move: 'scan',
      valid: !scanBusy && missingScanInputs.length === 0,
      missing: [...noOther(scanBusy), ...missingScanInputs],
    },
    {
      move: 'continue_scan',
      valid: scanned && !scanBusy && unfinished,
      missing: !scanned
        ? needScan
        : scanBusy
          ? noOther(true)
          : unfinished
            ? []
            : ['queued pages (the scan has nothing left to visit)'],
    },
    {
      move: 'map_process',
      valid: scanned && !scanBusy,
      missing: [...needScan, ...noOther(scanBusy)],
    },
    { move: 'narrow_process', valid: scanned, missing: needScan },
    {
      move: 'document',
      valid: scanned && input.scopes.length > 0 && steps.document.status !== 'in_progress',
      missing: [
        ...needScan,
        ...(input.scopes.length === 0 ? ['a process scope (pick its start and end)'] : []),
        ...(steps.document.status === 'in_progress' ? ['the running documentation to finish'] : []),
      ],
    },
    { move: 'amend', valid: scanned, missing: needScan },
    {
      move: 'review_superseded',
      valid: input.supersededAmendments > 0,
      missing: input.supersededAmendments > 0 ? [] : ['superseded amendments'],
    },
  ];
  for (const m of out) if (m.valid) m.missing = [];
  return out;
}

const PROPOSAL_ORDER: readonly Move[] = [
  'review_superseded',
  'scan',
  'continue_scan',
  'narrow_process',
  'document',
  'map_process',
  'amend',
];

export function workflowState(input: WorkflowInput): WorkflowState {
  const data = derived(input);
  const recorded = newestRecorded(input.recordedSteps);
  const merged = {} as Record<Step, Omit<StepState, 'step'>>;
  for (const step of STEPS)
    merged[step] = reconcile(data[step], recorded.get(step), lastActivity(input, step));
  const steps = STEPS.map((step) => ({ step, ...merged[step] }));
  const ms = moves(input, merged);
  const valid = new Set(ms.filter((m) => m.valid).map((m) => m.move));
  // A new scan stays a valid move on a scanned portal, but is offered only when the BA asks.
  if (input.statesRecorded > 0) valid.delete('scan');
  return {
    portal: input.portal,
    steps,
    moves: ms,
    proposals: PROPOSAL_ORDER.filter((m) => valid.has(m)),
    busy: steps.some((s) => s.status === 'in_progress' || s.status === 'pending'),
  };
}
