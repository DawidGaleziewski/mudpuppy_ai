import { readFile } from 'node:fs/promises';
import { newId, nowIso, type ProbeFault } from '@mudpuppy/core';
import {
  captureAria,
  nativeMessages,
  readFormFields,
  testValueFor,
  transientError,
  writeFormFields,
  type AutofillField,
} from '@mudpuppy/crawler';
import { canonicalizeAria, errorSignals } from '@mudpuppy/fingerprint';
import {
  classifyOutcome,
  type Classified,
  type FieldMessage,
  type HappyNext,
  type ProbeTry,
  type ProbeValue,
} from '@mudpuppy/probes';
import type { PageResult } from '../../runtime.js';
import { captchaInDom } from '../handoff.js';
import type { ActionRow } from './actions.js';
import { event, reported, step } from './context.js';
import { armFault, type FaultResult } from './fault.js';
import { findAgain } from './find-again.js';
import { againInFreshSession } from './fresh-session.js';
import { labelSteps, pathJson, type LabelStep } from './probe-steps.js';
import { processPage } from './process-page.js';
import { returnToState, type ReplayScope } from './replay.js';

/** The form step being probed: its control, its state, and what the happy path did from it. */
export interface ProbeTarget {
  action: ActionRow;
  stateId: string;
  stepId: string | null;
  route: string;
  depth: number;
}

/** One press of the step's control with the given values (and fault), and what it produced. */
export interface Pressed {
  result: PageResult;
  /** What was typed and pressed, by label, in order: the suite repeats it (US3). */
  steps: LabelStep[];
  native: FieldMessage[];
  /** The page's ARIA snapshot just before the press: new text after it can be a message. */
  before: string;
  fault: FaultResult | null;
  captcha: string | null;
  /** The fields the try's choices added to the form (none for most tries). */
  revealed: Revealed;
}

type Locator = NonNullable<Awaited<ReturnType<typeof findAgain>>['locator']>;

/** The fields an option revealed, by index in the form read after it, and their happy values. */
export interface Revealed {
  fields: AutofillField[];
  base: Map<number, ProbeValue>;
}

/**
 * Fields an option revealed (Business shows "Company name"): filled with the persona's test data
 * or a test value, so the try can reach where the option leads instead of stopping on them; then a
 * try's own `after` writes on them (spec 037 FR-002).
 */
async function fillRevealed(
  locator: Locator,
  before: readonly AutofillField[],
  o: { inputs: Readonly<Record<string, string>>; after: ProbeTry['after'] },
): Promise<{ steps: LabelStep[]; revealed: Revealed }> {
  const known = new Set(before.map((f) => `${f.type}|${f.label}`));
  const read = (await readFormFields(locator)) ?? [];
  const fields = read.filter((x) => !known.has(`${x.type}|${x.label}`));
  const base = new Map<number, ProbeValue>();
  for (const f of fields) {
    const v = testValueFor({ ...f, empty: true }, o.inputs[f.label]);
    if (v !== null) base.set(f.index, v);
  }
  const values = new Map(base);
  for (const w of o.after ?? []) values.set(w.index, w.value);
  if (values.size > 0)
    await writeFormFields(
      locator,
      [...values].map(([index, value]) => ({ index, value })),
    );
  return { steps: labelSteps(read, values), revealed: { fields, base } };
}

/**
 * Back on the step (unless the browser is already there, untouched), the happy values plus the
 * try's changes written, the fault armed, the control pressed without autofill, and the page
 * recorded like any `act` (states, transitions, frontier: a branch is explored from there).
 */
export async function press(
  sc: ReplayScope,
  target: ProbeTarget,
  opts: {
    base: ReadonlyMap<number, ProbeValue>;
    writes: ProbeTry['writes'];
    after?: ProbeTry['after'];
    fault?: ProbeFault;
    fresh: boolean;
  },
): Promise<Pressed | { skipped: string }> {
  const { rs } = sc;
  if (!opts.fresh || rs.currentStateId !== target.stateId)
    await againInFreshSession(sc, () => returnToState(sc, target.stateId));
  const found = await findAgain(rs.session.page, target.action);
  if (found.locator === null) return { skipped: 'the step control is not on the page' };
  const fields = (await readFormFields(found.locator)) ?? [];
  const values = new Map(opts.base);
  for (const w of opts.writes) values.set(w.index, w.value);
  await writeFormFields(
    found.locator,
    [...values].map(([index, value]) => ({ index, value })),
  );
  const inputs = rs.effective.persona.test_data;
  const filled = await fillRevealed(found.locator, fields, { inputs, after: opts.after });
  const steps = [
    ...labelSteps(fields, values),
    ...filled.steps,
    { name: target.action.accessible_name ?? target.action.role, kind: 'click' as const },
  ];
  const before = await captureAria(rs.session.page).catch(() => '');
  const armed = opts.fault ? await armFault(rs, opts.fault) : null;
  rs.keepErrorPages = armed !== null;
  let fault: FaultResult | null = null;
  try {
    rs.session.navigation.begin(rs.session.page.url());
    await found.locator.click({ timeout: 30_000 }).catch(() => undefined);
    const result = await processPage({
      ...sc,
      via: { kind: 'act', action: target.action },
      depth: target.depth + 1,
      includeActions: true,
    });
    // Only while the control is still there: a locator waits for its element without a time
    // limit, and after a press that moved on, the page has none.
    const still = (await found.locator.count().catch(() => 0)) > 0;
    const native = (still ? await nativeMessages(found.locator).catch(() => []) : []).map(
      (m): FieldMessage => ({ field: m.field, text: m.text, source: 'native' }),
    );
    fault = armed ? await armed.disarm() : null;
    const captcha = await captchaInDom(rs.session.page);
    return { result, steps, native, before, fault, captcha, revealed: filled.revealed };
  } finally {
    rs.keepErrorPages = false;
    if (armed && fault === null) await armed.disarm().catch(() => undefined);
  }
}

/** Messages the page rendered (alerts, invalid controls); paired when the counts match. */
export function domMessages(snapshot: string): FieldMessage[] {
  const s = errorSignals(canonicalizeAria(snapshot).nodes);
  return s.alerts.map((text, i) => ({
    field: s.invalid.length === s.alerts.length ? (s.invalid[i] ?? null) : null,
    text,
    source: 'dom',
  }));
}

const PAGE_CHROME = new Set(['banner', 'navigation', 'contentinfo', 'complementary']);
const TEXT_ROLES = new Set(['text', 'paragraph', 'status', 'note']);
const TEXT_CAP = 3;

/**
 * Text the press made appear, outside the page's header, menu and footer (F-07@038, R-80 (1)): a
 * page that writes its error as a plain paragraph, with no alert role, still says what was wrong.
 * Used only when the page rendered no alert and the browser stayed on the step.
 */
export function textMessages(before: string, after: string): FieldMessage[] {
  const texts = (s: string) =>
    canonicalizeAria(s)
      .nodes.filter(
        (n) => n.name && TEXT_ROLES.has(n.role) && !n.path.some((r) => PAGE_CHROME.has(r)),
      )
      .map((n) => ({ key: n.name, text: n.shown ?? n.name }));
  const seen = new Set(texts(before).map((t) => t.key));
  const fresh = new Map<string, string>();
  for (const t of texts(after))
    if (!seen.has(t.key) && t.text.length >= 3 && t.text.length <= 200) fresh.set(t.key, t.text);
  return [...fresh.values()]
    .slice(0, TEXT_CAP)
    .map((text) => ({ field: null, text, source: 'dom-text' }));
}

/** The step's snapshot as recorded when its state was first seen; null when it cannot be read. */
async function cleanStep(sc: ReplayScope, stateId: string): Promise<string | null> {
  const row = await sc.ctx.db
    .selectFrom('states')
    .select('evidence_ref')
    .where('id', '=', stateId)
    .executeTakeFirst();
  if (!row) return null;
  return readFile(sc.ctx.evidence.resolve(row.evidence_ref), 'utf8').catch(() => null);
}

/** The facts of a press, classified (plan decision 7). */
export async function classifyPress(
  sc: ReplayScope,
  target: ProbeTarget,
  p: Pressed,
  t: { group: ProbeTry['group']; happyNext: HappyNext | null },
): Promise<{ c: Classified; messages: FieldMessage[]; httpStatus: number | null }> {
  const { ctx, rs } = sc;
  const stepAfter = rs.stepOfState.get(p.result.state_id) ?? null;
  const sameStep = p.result.route_template === target.route && stepAfter === target.stepId;
  const after = rs.lastObserved?.snapshot ?? '';
  const messages = [...domMessages(after), ...p.native];
  // Only for a validation try (a filter's happy press also shows new text, F-18@032), and against
  // the step as first recorded: an earlier try's message can still be on the page.
  if (messages.length === 0 && sameStep && t.group === 'validation')
    messages.push(...textMessages((await cleanStep(sc, target.stateId)) ?? p.before, after));
  const calls = p.result.transition_id
    ? await ctx.db
        .selectFrom('network_calls')
        .select((eb) => eb.fn.max('status').as('status'))
        .where('transition_id', '=', p.result.transition_id)
        .executeTakeFirst()
    : undefined;
  const httpStatus = p.fault?.status ?? (calls?.status ? Number(calls.status) : null);
  const text = await rs.session.page.innerText('body').catch(() => '');
  const screen = await ctx.db
    .selectFrom('states')
    .select('screen_rev')
    .where('id', '=', p.result.state_id)
    .executeTakeFirst();
  const c = classifyOutcome({
    group: t.group,
    blocked: p.captcha ? `a CAPTCHA (${p.captcha}) after the press` : null,
    sameStep,
    stepAfter,
    routeAfter: p.result.route_template,
    happyNext: t.happyNext,
    messages,
    httpStatus,
    errorPage: transientError({ text }) !== null,
    newScreen: p.result.created && screen?.screen_rev === 1,
    changed: p.result.state_id !== target.stateId,
  });
  return { c, messages, httpStatus };
}

/** Store one outcome (spec 032 FR-005) and say so in the trace. */
export function recordOutcome(
  sc: ReplayScope & { formStepId: string | null },
  target: ProbeTarget,
  o: {
    t: ProbeTry;
    p: Pressed;
    c: Classified;
    messages: FieldMessage[];
    httpStatus: number | null;
  },
): Promise<string> {
  const { ctx, run } = sc;
  return step(sc, 'probe', async () => {
    const id = newId();
    const { t, p, c } = o;
    if (t.group === 'technical' && p.result.created)
      await ctx.db
        .updateTable('states')
        .set({ state_kind: 'technical' })
        .where('id', '=', p.result.state_id)
        .execute();
    const evidence = await ctx.db
      .selectFrom('states')
      .select('evidence_ref')
      .where('id', '=', p.result.state_id)
      .executeTakeFirstOrThrow();
    await ctx.db
      .insertInto('probe_outcomes')
      .values({
        id,
        run_id: run.id,
        from_state_id: target.stateId,
        form_step_id: sc.formStepId,
        probe_id: t.probe,
        probe_group: t.group,
        target: t.target,
        inputs_json: JSON.stringify(p.steps),
        path_json: JSON.stringify(await pathJson(sc, target.stateId)),
        fault: t.fault ?? null,
        outcome_kind: c.kind,
        to_state_id: p.result.state_id,
        accepted: c.accepted ? 1 : 0,
        possible_new_process: c.possibleNewProcess ? 1 : 0,
        messages_json: JSON.stringify(o.messages),
        http_status: o.httpStatus,
        reason: c.why,
        evidence_ref: evidence.evidence_ref,
        transition_id: p.result.transition_id ?? null,
        created_at: nowIso(),
      })
      .execute();
    return reported(id, [
      event('probe_outcome', {
        probe: t.probe,
        key: t.key,
        group: t.group,
        ...(t.fault ? { fault: t.fault } : {}),
        outcome_kind: c.kind,
        to_state: p.result.state_id,
        messages: o.messages.length,
        accepted: c.accepted,
        possible_new_process: c.possibleNewProcess,
      }),
    ]);
  });
}
