import { Cluster, Code, Count, Diagram, Disclosure, Facts, Grid, Note, Plate, Shot, Stack, SubHead, Table, Tag, Text } from '../design-system';
import type { ContentBlock, ContentFact, DocFigure, DocRecordPage, DocReview } from '../app/api-doc';
import { ShownStatus } from '../app/ShownStatus';
import { stateHref } from './RecordedInspector';

function FactValue({ f }: { f: ContentFact }) {
  if (f.listed) {
    return (
      <Stack>
        {f.values.map((v, i) => (
          <Text key={i} mono={f.mono} lang={f.lang}>
            {v}
          </Text>
        ))}
      </Stack>
    );
  }
  return (
    <Text mono={f.mono} lang={f.lang}>
      {f.values.join(', ')}
    </Text>
  );
}

function Block({ b }: { b: ContentBlock }) {
  if (b.type === 'facts') return <Facts items={b.facts.map((f) => [f.label, <FactValue key={f.label} f={f} />] as const)} />;
  if (b.type === 'code') {
    return (
      <Stack>
        {b.caption && <SubHead>{b.caption}</SubHead>}
        <Code label={b.caption ?? 'Content'}>{b.text ?? ''}</Code>
      </Stack>
    );
  }
  if (b.type === 'table') {
    return (
      <Table
        caption={b.caption ?? 'Table'}
        showCaption
        columns={b.headers.map((h, i) => ({ header: h, cell: (row: string[]) => row[i] ?? '' }))}
        rows={b.rows}
        rowKey={(row) => row.join('|')}
        dense
      />
    );
  }
  return (
    <Text block strong={b.strong}>
      {b.text ?? ''}
    </Text>
  );
}

/** The revision's content as the API gives it in blocks, whatever the record kind. */
export function Content({ d }: { d: DocRecordPage }) {
  return (
    <Plate title="Content">
      <Stack>
        {d.blocks.map((b, i) => (
          <Block key={i} b={b} />
        ))}
      </Stack>
    </Plate>
  );
}

/** A process record: one map per traced variant (spec 031 US5). */
export function VariantMaps({ d }: { d: DocRecordPage }) {
  const many = d.variant_maps.length > 1;
  return (
    <>
      {d.variant_maps.map((m, i) => (
        <Plate
          key={m.scan.href}
          {...(many
            ? {
                title: <Text asIs>{`Variant ${String(i + 1)}: ${m.variant}`}</Text>,
                actions: (
                  <Cluster>
                    <ShownStatus status={m.outcome} />
                    <Tag size="sm" href={m.scan.href}>
                      {m.scan.label}
                    </Tag>
                  </Cluster>
                ),
              }
            : { label: 'Process map' })}
        >
          <Diagram source={m.source} caption={`Process map from the recorded trace steps${many ? ` of ${m.variant}` : ''}`} />
        </Plate>
      ))}
    </>
  );
}

function Figure({ f }: { f: DocFigure }) {
  const src = f.shot ?? f.wire;
  const marks = f.shot ? f.marks.filter((m) => m.visible).map((m) => ({ region: m, label: String(m.n), title: m.key })) : [];
  return (
    <Stack>
      {src ? <Shot src={src} alt={`${f.shot ? 'Screenshot' : 'Wireframe'} of ${f.title} (${f.route})`} marks={marks} /> : <Text small muted>No screenshot and no wireframe recorded for this screen.</Text>}
      <Cluster>
        <Text small asIs href={stateHref(f.state_id)}>
          {f.title}
        </Text>
        <Text route>{f.route}</Text>
        {!f.shot && f.wire && <Text small muted>wireframe: no screenshot recorded</Text>}
        {f.shot && f.cut_at !== null && <Text small muted>{`cut at ${String(f.cut_at)} px`}</Text>}
      </Cluster>
      {f.marks.length > 0 && (
        <Stack>
          {f.marks.map((m) => (
            <Text key={m.n} small>
              {`${String(m.n)}. `}
              <Text mono small>
                {m.key}
              </Text>
              {m.note && <Text muted>{` ${m.note}`}</Text>}
              {!m.visible && <Text muted> · not on the screenshot</Text>}
            </Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** The screens the revision cites, with its regions numbered on each. */
export function Figures({ d }: { d: DocRecordPage }) {
  if (!d.figures.length) return null;
  return (
    <Disclosure
      open={d.figures_open}
      summary={
        <>
          Screens <Count muted>{d.figures.length}</Count>
        </>
      }
    >
      <Grid min="20rem">
        {d.figures.map((f) => (
          <Figure key={f.state_id} f={f} />
        ))}
      </Grid>
    </Disclosure>
  );
}

export function Evidence({ d }: { d: DocRecordPage }) {
  return (
    <Plate title={`Evidence · ${String(d.evidence.length)}`} flush={d.evidence.length > 0}>
      {d.evidence.length ? (
        <Table
          caption={`Evidence cited by revision ${String(d.rev)}`}
          columns={[
            {
              header: 'Target',
              rowHeader: true,
              cell: (e) => (
                <Stack>
                  <Text small muted>{e.kind}</Text>
                  {!e.resolved && <Text small muted>{`Unresolved: this store cannot look up ${e.kind} targets`}</Text>}
                  <Cluster>
                    {e.tag && e.href ? (
                      <Tag size="sm" href={e.href}>
                        {e.tag}
                      </Tag>
                    ) : null}
                    {e.label && (e.href && !e.tag ? <Text asIs href={e.href}>{e.label}</Text> : <Text asIs>{e.label}</Text>)}
                    {!e.label && !e.tag && e.href && <Text href={e.href}>Open scan</Text>}
                    {e.region && <Text mono small>{e.region}</Text>}
                  </Cluster>
                </Stack>
              ),
            },
            { header: 'What it supports', cell: (e) => e.note ?? '—' },
            {
              header: 'Scan',
              cell: (e) =>
                e.scan ? (
                  <Stack>
                    <Tag size="sm" href={e.scan.href} {...(e.scan.title ? { title: e.scan.title } : {})}>
                      {e.scan.label}
                    </Tag>
                    <Text small muted>{e.scan_note ?? ''}</Text>
                  </Stack>
                ) : (
                  <Text muted>Not scan-bound</Text>
                ),
            },
          ]}
          rows={d.evidence}
          rowKey={(e) => `${e.kind}|${e.href ?? ''}|${e.label ?? ''}|${e.note ?? ''}`}
          flush
        />
      ) : (
        <Text small muted>
          No evidence on this revision. Every revision must cite at least one record; run the docs audit.
        </Text>
      )}
    </Plate>
  );
}

export function Relations({ d }: { d: DocRecordPage }) {
  return (
    <Plate title="Relations" flush>
      <Table
        caption={`Relations of ${d.key}`}
        columns={[
          { header: 'Direction', cell: (r) => <Text>{r.direction === 'Out' ? 'Out · this revision points to' : 'In · points to this record'}</Text> },
          { header: 'Type', cell: (r) => r.type },
          {
            header: 'Record',
            rowHeader: true,
            cell: (r) => (
              <Cluster>
                <Tag size="sm" href={r.href}>
                  {r.key}
                </Tag>
                <Text asIs>{r.title}</Text>
              </Cluster>
            ),
          },
          { header: 'Status', cell: (r) => <ShownStatus status={r.status} /> },
        ]}
        rows={d.relations}
        rowKey={(r) => `${r.direction}|${r.type}|${r.key}`}
        flush
        empty="No relations to other records."
      />
    </Plate>
  );
}

export function ReviewNotes({ reviews }: { reviews: DocReview[] }) {
  if (!reviews.length) return <Text muted>None</Text>;
  return (
    <Stack>
      {reviews.map((rv) => (
        <Stack key={rv.id}>
          <ShownStatus status={rv.action} />
          {rv.text ? (
            <Note size="sm" by={`${rv.reviewer} · ${rv.at}`}>
              {rv.text}
            </Note>
          ) : (
            <Text small muted>{`${rv.reviewer} · ${rv.at}`}</Text>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

export function History({ d }: { d: DocRecordPage }) {
  return (
    <Plate title={`Revision history · ${String(d.history.length)}`} flush>
      <Table
        caption={`Every revision of ${d.key}, newest first`}
        columns={[
          {
            header: 'Rev',
            rowHeader: true,
            cell: (h) =>
              h.shown ? (
                <Cluster>
                  <Tag size="sm" intent>{`rev ${String(h.rev)}`}</Tag>
                  <Text small muted>shown</Text>
                </Cluster>
              ) : (
                <Tag size="sm" href={h.href}>{`rev ${String(h.rev)}`}</Tag>
              ),
          },
          { header: 'Status', cell: (h) => <ShownStatus status={h.status} /> },
          { header: 'Confidence', cell: (h) => <ShownStatus status={h.confidence} /> },
          {
            header: 'Change',
            cell: (h) => (
              <Stack>
                <Text small>{`${h.change} · ${h.at}`}</Text>
                {h.change_note && <Text small muted>{h.change_note}</Text>}
              </Stack>
            ),
          },
          { header: 'Session', cell: (h) => <Tag size="sm" href={h.session.href} {...(h.session.title ? { title: h.session.title } : {})}>{h.session.label}</Tag> },
          { header: 'Reviews', cell: (h) => <ReviewNotes reviews={h.reviews} /> },
        ]}
        rows={d.history}
        rowKey={(h) => String(h.rev)}
        flush
      />
    </Plate>
  );
}
