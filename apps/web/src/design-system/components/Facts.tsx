import { Fragment, type ReactNode } from 'react';

export interface FactsProps {
  items: readonly (readonly [ReactNode, ReactNode])[];
  /** Joined to the top of the table right under it (designer Q7, `.sy-facts--table`); give it an `id` the table describes itself by. */
  table?: boolean;
  id?: string;
}

/** Name–value facts (a definition list): "Portal reference-insurer", "Environment sandbox". */
export function Facts({ items, table, id }: FactsProps) {
  return (
    <dl className={table ? 'sy-facts sy-facts--table' : 'sy-facts'} id={id}>
      {items.map(([term, value], i) => (
        <Fragment key={i}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
