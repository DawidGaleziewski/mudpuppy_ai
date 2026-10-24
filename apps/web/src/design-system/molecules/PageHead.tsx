import { Fragment, type ReactNode } from 'react';
import { Anchor } from '../atoms/Anchor.js';

export interface Crumb {
  label: ReactNode;
  href?: string;
}

export interface PageHeadProps {
  /** The one `h1` of the page. Short; long names take the normal case on their own. */
  title: ReactNode;
  crumbs?: readonly Crumb[];
  /** One line under the title: counts first ("22 screens · 4 processes · scanned 23 Oct"). */
  meta?: ReactNode;
  /** The page's actions (at most one primary button). */
  actions?: ReactNode;
}

/** The head of a page: crumbs, the title, its meta line, its actions. */
export function PageHead({ title, crumbs, meta, actions }: PageHeadProps) {
  return (
    <div className="sy-pagehead">
      {crumbs && crumbs.length > 0 && (
        <nav className="sy-crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && ' / '}
              {/* rel=up: a crumb goes up the section tree; the app returns it to the list as it was left */}
              {c.href ? (
                <Anchor href={c.href} rel="up">
                  {c.label}
                </Anchor>
              ) : (
                c.label
              )}
            </Fragment>
          ))}
        </nav>
      )}
      <div className="sy-pagehead__row">
        <h1 className="sy-h1">{title}</h1>
        {actions}
      </div>
      {meta !== undefined && <p className="sy-meta">{meta}</p>}
    </div>
  );
}
