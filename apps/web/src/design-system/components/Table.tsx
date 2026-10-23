import type { ReactNode } from 'react';
import { cx } from '../cx.js';

export interface Column<Row> {
  /** The header, sentence case. */
  header: ReactNode;
  /** What the cell shows. */
  cell: (row: Row) => ReactNode;
  /** Numbers are right-aligned in a mono face. */
  numeric?: boolean;
  /** The column that names the row: a row header (`th scope="row"`). */
  rowHeader?: boolean;
}

export interface TableProps<Row> {
  /** What the table is, for assistive technology (visible as the caption when `showCaption`). */
  caption: string;
  showCaption?: boolean;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Inside a plate, edge to edge. */
  flush?: boolean;
  dense?: boolean;
  /** Rows react to hover (each row is a link or a choice). */
  interactive?: boolean;
  /** Shown instead of the body when there are no rows. */
  empty?: ReactNode;
}

/** A data table: headers with scope, numbers aligned, an empty state that says so. */
export function Table<Row>({
  caption,
  showCaption = false,
  columns,
  rows,
  rowKey,
  flush = false,
  dense = false,
  interactive = false,
  empty = 'Nothing yet.',
}: TableProps<Row>) {
  return (
    <div className={cx('sy-table-wrap', flush && 'sy-table-wrap--flush')}>
      <table
        className={cx('sy-table', dense && 'sy-table--dense', interactive && 'sy-table--interactive')}
      >
        <caption className={showCaption ? undefined : 'sy-sr-only'}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col" className={c.numeric ? 'sy-num' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="sy-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c, i) =>
                  c.rowHeader ? (
                    <th key={i} scope="row">
                      {c.cell(row)}
                    </th>
                  ) : (
                    <td key={i} className={c.numeric ? 'sy-num' : undefined}>
                      {c.cell(row)}
                    </td>
                  ),
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
