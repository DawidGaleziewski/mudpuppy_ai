// Branch probes (spec 032 US2.1, US2.4): every other option of a radio group, a select or an
// optional checkbox. On legacy forms one option can lead into a different process; the runtime
// compares where each try lands with the happy path's next step.

import { defineProbe, nameOf, radiosOf, type ProbeContext, type ProbeTry } from '../define.js';

/** A long select (countries, years) is sampled: its first other options, not all of them. */
export const OPTIONS_PER_CONTROL = 6;

const PLACEHOLDER = /wybierz|select|choose|bitte|^\s*[-—–]+|^\s*$/i;

const branchTry = (target: string, option: string, writes: ProbeTry['writes']): ProbeTry => ({
  key: `option:${target}=${option}`,
  probe: 'option',
  group: 'branch',
  target: `${target} = ${option}`,
  writes,
  summary: `choose "${option}" for "${target}"`,
});

export const options = defineProbe({
  id: 'option',
  group: 'branch',
  summary: 'Each other option of a radio group, select or optional checkbox',
  scars: ['SC-19'],
  tries: ({ fields, base }: ProbeContext) => {
    const out: ProbeTry[] = [];
    const groups = new Set<string>();
    for (const f of fields) {
      if (f.type === 'radio' && f.group !== undefined) {
        if (groups.has(f.group)) continue;
        groups.add(f.group);
        const radios = radiosOf(fields, f.group);
        const chosen = radios.find((r) => base.get(r.index) === true);
        for (const r of radios.filter((x) => x !== chosen).slice(0, OPTIONS_PER_CONTROL))
          out.push(
            branchTry(nameOf(f), r.label || `option ${r.index + 1}`, [
              ...radios.map((x) => ({ index: x.index, value: false })),
              { index: r.index, value: true },
            ]),
          );
      } else if (f.tag === 'select') {
        const chosen = base.get(f.index);
        const usable = (f.options ?? []).filter(
          (o) => !o.disabled && o.value !== '' && !PLACEHOLDER.test(o.text) && o.value !== chosen,
        );
        for (const o of usable.slice(0, OPTIONS_PER_CONTROL))
          out.push(branchTry(nameOf(f), o.text || o.value, [{ index: f.index, value: o.value }]));
      } else if (f.type === 'checkbox' && !f.required) {
        const on = base.get(f.index) === true;
        out.push(
          branchTry(nameOf(f), on ? 'unchecked' : 'checked', [{ index: f.index, value: !on }]),
        );
      }
    }
    return out;
  },
});
