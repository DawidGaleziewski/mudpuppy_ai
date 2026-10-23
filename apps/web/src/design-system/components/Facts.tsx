import { Fragment, type ReactNode } from 'react';

/** Name–value facts (a definition list): "Portal reference-insurer", "Environment sandbox". */
export function Facts({ items }: { items: readonly (readonly [ReactNode, ReactNode])[] }) {
  return (
    <dl className="sy-facts">
      {items.map(([term, value], i) => (
        <Fragment key={i}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
