import { useSearchParams } from 'react-router';
import { Button, Cluster, Field, Select, Text } from '../design-system';
import type { Option } from './api-map';

/**
 * The page address of a paged scan section: its filters, the API's `cursor` and the page number
 * shown. A new filter starts at the first page again.
 */
export function useSectionParams() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? '1') || 1;
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('cursor');
    next.delete('page');
    setParams(next, { replace: true });
  };
  const goTo = (cursor: string | null) => {
    const next = new URLSearchParams(params);
    if (cursor) {
      next.set('cursor', cursor);
      next.set('page', String(page + 1));
    } else {
      next.delete('cursor');
      next.delete('page');
    }
    setParams(next);
  };
  return { params, page, setFilter, goTo };
}

/** First and Next under a paged section (the API pages by cursor, so there is no Previous). */
export function CursorPager({ total, nextCursor }: { total: number; nextCursor: string | null }) {
  const { page, goTo } = useSectionParams();
  if (!nextCursor && page === 1) return null;
  return (
    <nav aria-label="Pages">
      <Cluster>
        <Text small muted>{`Page ${String(page)} · ${String(total)} in all`}</Text>
        {page > 1 && (
          <Button size="sm" variant="quiet" onClick={() => goTo(null)}>
            First
          </Button>
        )}
        {nextCursor && (
          <Button size="sm" onClick={() => goTo(nextCursor)}>
            Next
          </Button>
        )}
      </Cluster>
    </nav>
  );
}

/** A filter of a scan section: a labelled select whose change asks the API at once. */
export function SectionFilter({
  label,
  name,
  value,
  options,
  any,
}: {
  label: string;
  name: string;
  value: string | null;
  options: readonly Option[];
  /** The word for "no filter" ("Any status"). */
  any: string;
}) {
  const { setFilter } = useSectionParams();
  return (
    <Field label={label}>
      <Select value={value ?? ''} onChange={(e) => setFilter(name, e.target.value)}>
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
