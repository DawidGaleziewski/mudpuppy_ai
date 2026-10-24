import { useState } from 'react';
import { Diagram, Segmented, Stack, Table, Tag, Text } from '../design-system';
import { docHref } from '../app/api-process';
import type { DocsPage } from '../app/api-docs';

interface Line {
  key: string;
  title: string;
  /** The capability it belongs to; none: a capability's own band. */
  of?: string;
  count?: number;
}

/**
 * The capability map (designer T-09, D-73): a List first (an indented table of the capabilities
 * and the records each contains, every key a tag to its record: readable and accessible), the
 * Diagram second (the shape).
 */
export function CapabilityMap({ page }: { page: DocsPage }) {
  const [view, setView] = useState<'list' | 'diagram'>('list');
  const lines: Line[] = (page.capabilities ?? []).flatMap((c) => [{ key: c.key, title: c.title, count: c.contains.length }, ...c.contains.map((p) => ({ key: p.key, title: p.title, of: c.key }))]);
  const columns = [
    {
      header: 'Capability or record',
      rowHeader: true,
      cell: (l: Line) =>
        l.of ? (
          <Text>
            {'↳ '}
            <Tag size="sm" href={docHref(page.portal, l.key)}>
              {l.key}
            </Tag>{' '}
            <Text asIs>{l.title}</Text>
          </Text>
        ) : (
          <Text strong>
            <Tag size="sm" href={docHref(page.portal, l.key)}>
              {l.key}
            </Tag>{' '}
            <Text asIs>{l.title}</Text>
          </Text>
        ),
    },
    { header: 'Contains', numeric: true, cell: (l: Line) => (l.of ? '' : String(l.count ?? 0)) },
  ];
  return (
    <Stack>
      <Segmented
        label="Capability map as"
        selected={view}
        onSelect={(v) => setView(v === 'diagram' ? 'diagram' : 'list')}
        items={[
          { value: 'list', label: 'List' },
          { value: 'diagram', label: 'Diagram' },
        ]}
      />
      {view === 'list' || !page.diagram ? (
        <Table caption="Capability map" columns={columns} rows={lines} rowKey={(l) => `${l.of ?? ''}/${l.key}`} dense />
      ) : (
        <Diagram source={page.diagram.source} caption={page.diagram.caption} />
      )}
    </Stack>
  );
}
