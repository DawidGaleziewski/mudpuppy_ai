// What a form probe is (spec 032 US2.9, owner decision D-1): one deliberate variation of a form
// step, defined once and tested, in the style of the fix plugins. A probe reads the step's fields
// and the happy-path values and returns its tries; it never touches a browser. The runtime fills the
// happy values, applies a try's changes and fault, presses the step's control and records what
// happened.

import type { ProbeFault, ProbeGroup } from '@pathfinder/core';

/** One control of the step, as the form reader sees it (the shape of crawler's `AutofillField`). */
export interface ProbeField {
  /** Position in the form's controls; how a write finds the field again. */
  index: number;
  tag: 'input' | 'select' | 'textarea';
  /** Lower-case input type (`text`, `email`, `number`, …); `select` / `textarea` for those tags. */
  type: string;
  label: string;
  required: boolean;
  /** Radio group name. */
  group?: string;
  /** A radio group's visible name (legend or radiogroup label): how people and messages name it. */
  groupLabel?: string;
  min?: string;
  max?: string;
  placeholder?: string;
  minlength?: number;
  maxlength?: number;
  pattern?: string;
  options?: { value: string; text: string; disabled: boolean }[];
}

/** A value to write: text, an option value, `true` to check, `false` to uncheck. */
export type ProbeValue = string | boolean;

export interface ProbeWrite {
  index: number;
  value: ProbeValue;
}

/** What every probe sees: the fields and the happy-path value of each (absent = left as it is). */
export interface ProbeContext {
  fields: readonly ProbeField[];
  base: ReadonlyMap<number, ProbeValue>;
}

/** One try of a probe on one step. */
export interface ProbeTry {
  /** `<probe id>` or `<probe id>:<target>`: unique within the step. */
  key: string;
  probe: string;
  group: ProbeGroup;
  /** The field, option or request the try is about; null for the whole form. */
  target: string | null;
  /** Changes on top of the happy-path values, in order. */
  writes: ProbeWrite[];
  /**
   * Changes written after the form was read again, by index in that new reading: the fields an
   * option in `writes` revealed (spec 037 FR-002).
   */
  after?: ProbeWrite[];
  fault?: ProbeFault;
  /** One line for the agent and the decision log. */
  summary: string;
}

export interface Probe {
  id: string;
  group: ProbeGroup;
  summary: string;
  /** Scar ids that prove it (`SC-nn`). */
  scars: readonly string[];
  tries(ctx: ProbeContext): ProbeTry[];
}

export const defineProbe = (p: Probe): Probe => p;

/** The empty value of a field: unchecked for a box or radio, empty text otherwise. */
export const emptyValue = (f: ProbeField): ProbeValue =>
  f.type === 'checkbox' || f.type === 'radio' ? false : '';

/** The fields that make one control each (a radio group counts once, by its first radio). */
export function controls(fields: readonly ProbeField[]): ProbeField[] {
  const seen = new Set<string>();
  return fields.filter((f) => {
    if (f.group === undefined) return true;
    if (seen.has(f.group)) return false;
    seen.add(f.group);
    return true;
  });
}

/** Every radio of a group (a radio's label is its option). */
export const radiosOf = (fields: readonly ProbeField[], group: string): ProbeField[] =>
  fields.filter((f) => f.type === 'radio' && f.group === group);

/** Writes that leave a field empty, for a radio group every radio of it. */
export function clear(fields: readonly ProbeField[], f: ProbeField): ProbeWrite[] {
  const all = f.type === 'radio' && f.group !== undefined ? radiosOf(fields, f.group) : [f];
  return all.map((x) => ({ index: x.index, value: emptyValue(x) }));
}

/** A control's name for people: a radio group by its visible name, else its group name. */
export const nameOf = (f: ProbeField): string =>
  f.type === 'radio' && f.group !== undefined
    ? f.groupLabel || f.group
    : f.label || `field ${f.index + 1}`;
