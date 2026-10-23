// The to-be editor's step operations (designer screen 05) as pure functions: each takes a model's
// steps exactly as stored and returns the new steps, which the page autosaves as the person's
// draft. A step the person changes or draws is "designed, not observed": it loses its recorded
// state.

/** A step as the store keeps it (`process_model_revisions.steps`). */
export interface RawStep {
  id: string;
  title: string;
  route: string | null;
  state_id: string | null;
  screen_id: string | null;
  observed: boolean;
  from: string[];
  annotations: { text: string; author: string; at: string }[];
  [more: string]: unknown;
}

/** The next id for a drawn step: n1, n2, … never one a step already has. */
function freshId(steps: readonly RawStep[]) {
  const ns = steps.map((s) => /^n(\d+)$/.exec(s.id)).filter((m) => m !== null).map((m) => Number(m[1]));
  return `n${String(Math.max(0, ...ns) + 1)}`;
}

function drawn(steps: readonly RawStep[], fields: Pick<RawStep, 'title' | 'route'> & Partial<RawStep>): RawStep {
  return {
    id: freshId(steps),
    title: fields.title,
    route: fields.route,
    state_id: null,
    screen_id: null,
    observed: false,
    from: fields.from ?? [],
    annotations: fields.annotations ?? [],
  };
}

const at = (steps: readonly RawStep[], id: string) => steps.findIndex((s) => s.id === id);

function swap(steps: readonly RawStep[], i: number, j: number): RawStep[] {
  if (i < 0 || j < 0 || j >= steps.length) return [...steps];
  const out = [...steps];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

export const stepOps = {
  remove: (steps: readonly RawStep[], id: string) => steps.filter((s) => s.id !== id),
  up: (steps: readonly RawStep[], id: string) => swap(steps, at(steps, id), at(steps, id) - 1),
  down: (steps: readonly RawStep[], id: string) => swap(steps, at(steps, id), at(steps, id) + 1),
  /** This step and the next become one drawn step built from both. */
  merge: (steps: readonly RawStep[], id: string): RawStep[] => {
    const i = at(steps, id);
    const a = steps[i];
    const b = steps[i + 1];
    if (!a || !b) return [...steps];
    const merged = drawn(steps, { title: a.title, route: a.route, from: [...a.from, ...b.from], annotations: [...a.annotations, ...b.annotations] });
    return [...steps.slice(0, i), merged, ...steps.slice(i + 2)];
  },
  /** A drawn step at the end. */
  add: (steps: readonly RawStep[], fields: { title: string; route: string }) => [...steps, drawn(steps, { title: fields.title, route: fields.route || null })],
  /** A new title or route: the step becomes a designed one. */
  edit: (steps: readonly RawStep[], id: string, fields: { title: string; route: string }) =>
    steps.map((s) =>
      s.id !== id || (s.title === fields.title && (s.route ?? '') === fields.route)
        ? s
        : { ...s, title: fields.title, route: fields.route || null, state_id: null, screen_id: null, observed: false },
    ),
  annotate: (steps: readonly RawStep[], id: string, text: string, author: string, now = new Date().toISOString()) =>
    steps.map((s) => (s.id !== id ? s : { ...s, annotations: [...s.annotations, { text, author, at: now }] })),
};
