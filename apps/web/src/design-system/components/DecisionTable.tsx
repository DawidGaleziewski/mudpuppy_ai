import type { ReactNode } from 'react';
import { Facts } from './Facts.js';

/** One rule of the table: a condition per input (`null`: any value) and the result. */
export interface DecisionRow {
  conditions: readonly (string | null)[];
  result: ReactNode;
}

export interface DecisionTableProps {
  /** The rule it states, for assistive technology ("BR-021 decision table"). */
  label: string;
  /** The inputs' names, as stored. */
  inputs: readonly string[];
  /** The result column's header ("→ Next screen"). */
  result: string;
  rows: readonly DecisionRow[];
  /** Name–value facts above the table: inputs, hit policy, where decided. */
  facts?: readonly (readonly [ReactNode, ReactNode])[];
}

/**
 * A business rule as a decision table (designer v2-12, `.sy-table--decision`): inputs left, a
 * double weld, the result right; one rule per row, numbered; a condition in mono, "any" muted.
 * The facts (inputs, hit policy) come first. On a narrow screen it scrolls sideways in its own
 * region.
 */
export function DecisionTable({ label, inputs, result, rows, facts }: DecisionTableProps) {
  return (
    <>
      {facts && <Facts items={facts} />}
      <Grid label={label} inputs={inputs} result={result} rows={rows} />
    </>
  );
}

function Grid({ label, inputs, result, rows }: Omit<DecisionTableProps, 'facts'>) {
  return (
    <div className="sy-table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table className="sy-table sy-table--decision">
        <caption className="sy-sr-only">{label}</caption>
        <thead>
          <tr className="sy-dt-group">
            <td />
            <th scope="colgroup" colSpan={inputs.length}>
              Inputs
            </th>
            <th scope="colgroup" className="sy-dt-result">
              Result
            </th>
          </tr>
          <tr>
            <th scope="col" className="sy-dt-n">
              <abbr title="Rule row">#</abbr>
            </th>
            {inputs.map((i) => (
              <th key={i} scope="col" className="sy-case-normal">
                {i}
              </th>
            ))}
            <th scope="col" className="sy-dt-result">
              {result}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, n) => (
            <tr key={n}>
              <th scope="row" className="sy-dt-n">
                {n + 1}
              </th>
              {r.conditions.map((c, i) => (
                <td key={i}>{c === null ? <span className="sy-dt-any">any</span> : <code className="sy-dt-cond">{c}</code>}</td>
              ))}
              <td className="sy-dt-result">{r.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
