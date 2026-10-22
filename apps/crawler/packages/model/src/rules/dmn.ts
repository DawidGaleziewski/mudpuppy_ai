/**
 * DMN 1.3 XML of a decision table (spec 039 design § 11.4), exported with the SRS and the process
 * export. Conditions become FEEL unary tests (`< 18`, `"premium"`, `"a","b"`). Pure.
 */
import type { DecisionTable } from './boundary.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const id = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, '_');

/** A condition in FEEL unary-test syntax. */
export function feel(condition: string | undefined): string {
  if (condition === undefined || condition.trim() === '') return '-';
  const c = condition.trim();
  const eq = /^=\s*(.+)$/.exec(c);
  if (eq) return JSON.stringify(eq[1]!.trim());
  const list = /^in\s*\[(.*)\]$/.exec(c);
  if (list)
    return list[1]!
      .split(',')
      .map((v) => JSON.stringify(v.trim()))
      .join(',');
  // `>= 18 and < 21` → `[18..21[`
  const range = /^>=\s*(-?[\d.]+)\s+and\s+<\s*(-?[\d.]+)$/.exec(c);
  if (range) return `[${range[1]}..${range[2]}[`;
  return c;
}

export function toDmnXml(table: DecisionTable, name: string): string {
  const decision = id(`${table.decisionPoint.screen}_${name}`);
  const inputs = table.inputs
    .map(
      (i, n) =>
        `      <input id="${decision}_in${n}" label="${esc(i.name)}">\n` +
        `        <inputExpression typeRef="${i.type === 'number' ? 'number' : 'string'}"><text>${esc(i.name)}</text></inputExpression>\n` +
        `      </input>`,
    )
    .join('\n');
  const rules = table.rules
    .map(
      (r, n) =>
        `      <rule id="${decision}_r${n}">\n` +
        table.inputs
          .map((i) => `        <inputEntry><text>${esc(feel(r.when[i.name]))}</text></inputEntry>`)
          .join('\n') +
        `\n        <outputEntry><text>${esc(JSON.stringify(r.then))}</text></outputEntry>\n      </rule>`,
    )
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="defs_${decision}" name="${esc(name)}" namespace="https://mudpuppy.local/dmn">`,
    `  <decision id="${decision}" name="${esc(name)}">`,
    `    <!-- decided on ${esc(table.decisionPoint.screen)} by ${esc(table.decisionPoint.action)}; fitness ${table.fitness}, precision ${table.precision}, ${table.rows} rows -->`,
    `    <decisionTable id="${decision}_table" hitPolicy="${table.hitPolicy === 'U' ? 'UNIQUE' : 'COLLECT'}">`,
    inputs,
    `      <output id="${decision}_out" name="next" typeRef="string"/>`,
    rules,
    '    </decisionTable>',
    '  </decision>',
    '</definitions>',
    '',
  ].join('\n');
}
