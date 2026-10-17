/**
 * Form steps on one route (spec 032 US1, research.md). A React wizard renders its steps on one URL;
 * each step has its own form controls. A state belongs to a step of its route template when the
 * form has the same accessible name, or when, without names, the control sets overlap by a
 * Jaccard ≥ 0.5 (an option that reveals fields stays the same step). Values, state flags and texts
 * never decide a step. Pure and deterministic for a given insertion order.
 */
import type { AriaNode } from './aria-canonical.js';

/** Roles a person types into or chooses with. */
const CONTROL_ROLES = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'spinbutton',
  'slider',
  'radio',
  'checkbox',
  'switch',
]);

export const STEP_OVERLAP = 0.5;

export interface FormControls {
  /** The first named form's accessible name; null when no form is named. */
  formName: string | null;
  /** Sorted, unique `role|name` of the controls. */
  controls: string[];
  /** What the step is called on screen: the form's name, else the last heading before the first control. */
  label: string | null;
}

export function formControls(nodes: readonly AriaNode[]): FormControls {
  const controls = new Set<string>();
  let formName: string | null = null;
  let heading: string | null = null;
  let label: string | null = null;
  for (const n of nodes) {
    if (n.role === 'form' && n.name && formName === null) formName = n.name;
    if (n.role === 'heading' && controls.size === 0) heading = n.shown ?? heading;
    if (!CONTROL_ROLES.has(n.role)) continue;
    if (controls.size === 0) label = heading;
    controls.add(`${n.role}|${n.name}`);
  }
  return { formName, controls: [...controls].sort(), label: formName ?? label };
}

export interface ErrorSignals {
  /** Names of the controls the page marks invalid. */
  invalid: string[];
  /** Non-empty texts inside alerts. */
  alerts: string[];
}

export function errorSignals(nodes: readonly AriaNode[]): ErrorSignals {
  const invalid = nodes.filter((n) => n.invalid && CONTROL_ROLES.has(n.role)).map((n) => n.name);
  const alerts = nodes
    .filter(
      (n) => n.name && (n.role === 'alert' || (n.role === 'text' && n.path.includes('alert'))),
    )
    .map((n) => n.shown ?? n.name);
  return { invalid, alerts };
}

export const hasErrors = (s: ErrorSignals): boolean => s.invalid.length > 0 || s.alerts.length > 0;

export interface FormStep {
  id: string;
  routeTemplate: string;
  stepIndex: number;
  formName: string | null;
  /** Every control seen on the step so far (the union), sorted. */
  controls: string[];
  label: string;
}

export interface StepAssignment {
  step: FormStep;
  created: boolean;
  /** Controls added to a known step by this state (revealed fields). */
  added: string[];
  /** How the step was chosen, for the decision log. */
  reason: 'form-name' | 'overlap' | 'new-step';
  overlap: number;
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const inter = b.filter((x) => sa.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

/** The steps of a portal by route template; seeded with the stored steps so numbers hold across runs. */
export class FormStepIndex {
  private readonly byRoute = new Map<string, FormStep[]>();

  constructor(known: readonly FormStep[] = []) {
    for (const s of known) this.list(s.routeTemplate).push({ ...s, controls: [...s.controls] });
  }

  private list(route: string): FormStep[] {
    let l = this.byRoute.get(route);
    if (!l) this.byRoute.set(route, (l = []));
    return l;
  }

  /** The known step these controls belong to, without changing anything (a replay's check). */
  match(
    routeTemplate: string,
    fc: FormControls,
  ): { step: FormStep | null; reason: 'form-name' | 'overlap' | null; overlap: number } {
    if (fc.controls.length === 0) return { step: null, reason: null, overlap: 0 };
    const steps = this.list(routeTemplate);
    const named = fc.formName === null ? undefined : steps.find((s) => s.formName === fc.formName);
    if (named)
      return { step: named, reason: 'form-name', overlap: jaccard(named.controls, fc.controls) };
    let best: FormStep | null = null;
    let bestOverlap = 0;
    for (const s of steps) {
      if (s.formName !== null && fc.formName !== null) continue; // two different names
      const o = jaccard(s.controls, fc.controls);
      if (o > bestOverlap) [best, bestOverlap] = [s, o];
    }
    if (best && bestOverlap >= STEP_OVERLAP)
      return { step: best, reason: 'overlap', overlap: bestOverlap };
    return { step: null, reason: null, overlap: bestOverlap };
  }

  /** The step of a state; null when the state has no form controls. `newId` names a new step. */
  assign(routeTemplate: string, fc: FormControls, newId: () => string): StepAssignment | null {
    if (fc.controls.length === 0) return null;
    const steps = this.list(routeTemplate);
    const found = this.match(routeTemplate, fc);
    if (found.step && found.reason) return this.join(found.step, fc, found.reason, found.overlap);
    const bestOverlap = found.overlap;
    const step: FormStep = {
      id: newId(),
      routeTemplate,
      stepIndex: steps.reduce((m, s) => Math.max(m, s.stepIndex), 0) + 1,
      formName: fc.formName,
      controls: fc.controls,
      label: fc.label ?? `step ${steps.length + 1}`,
    };
    steps.push(step);
    return { step, created: true, added: [], reason: 'new-step', overlap: bestOverlap };
  }

  private join(
    step: FormStep,
    fc: FormControls,
    reason: 'form-name' | 'overlap',
    overlap: number,
  ): StepAssignment {
    const added = fc.controls.filter((c) => !step.controls.includes(c));
    if (added.length > 0) step.controls = [...step.controls, ...added].sort();
    return { step, created: false, added, reason, overlap };
  }
}
