import type { ProbeField, ProbeValue } from '@pathfinder/probes';
import { getAction } from './actions.js';
import type { ReplayScope } from './replay.js';

/**
 * A step by visible label, the shape of a `traces.yaml` step (without its intent): what a probe
 * typed and pressed, so the owner-approved suite can do the same with no LLM (spec 032 US3).
 * Values are the synthetic test values (autofill, the persona's test data), never personal data.
 */
export interface LabelStep {
  name: string;
  kind: 'fill' | 'select' | 'check' | 'click';
  value?: string;
}

/** The label steps that set these values on a fresh page (empty and unchecked need no step). */
export function labelSteps(
  fields: readonly ProbeField[],
  values: ReadonlyMap<number, ProbeValue>,
): LabelStep[] {
  const out: LabelStep[] = [];
  for (const f of fields) {
    const v = values.get(f.index);
    if (v === undefined || v === '' || v === false || !f.label) continue;
    if (v === true) out.push({ name: f.label, kind: 'check' });
    else if (f.tag === 'select')
      out.push({
        name: f.label,
        kind: 'select',
        value: f.options?.find((o) => o.value === v)?.text ?? v,
      });
    else out.push({ name: f.label, kind: 'fill', value: v });
  }
  return out;
}

/** The run's way to a state as label steps: the start URL, then each step's fills and press. */
export async function pathJson(
  sc: ReplayScope,
  stateId: string,
): Promise<{ start_url: string; steps: LabelStep[] }> {
  const path = sc.rs.pathTo.get(stateId);
  if (path === undefined) return { start_url: sc.rs.session.page.url(), steps: [] };
  const steps: LabelStep[] = [];
  for (const s of path.steps) {
    const action = await getAction(sc.ctx, sc.run.id, s.actionId);
    steps.push(...(s.fills ?? []));
    const name = action.accessible_name ?? action.role;
    const kind = action.json.input ?? 'click';
    steps.push(
      kind === 'fill' || kind === 'select'
        ? { name, kind, value: s.value ?? '' }
        : { name, kind: kind === 'check' ? 'check' : 'click' },
    );
  }
  return { start_url: path.url, steps };
}
