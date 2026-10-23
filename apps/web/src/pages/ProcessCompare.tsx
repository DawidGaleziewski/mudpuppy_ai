import { useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Button, Callout, Cluster, Field, LinkButton, Note, PageHead, Plate, Segmented, Stack, Table, Tag, Text, Textarea } from '../design-system';
import { processesKey, processHref } from '../app/api-processes';
import { useCompare, type Compare, type DiffRow } from '../app/api-process-compare';
import { writes } from '../app/api-write';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';

type Side = DiffRow['left'][number];

function Steps({ steps }: { steps: readonly Side[] }) {
  if (steps.length === 0) return <Text muted>—</Text>;
  return (
    <Stack>
      {steps.map((s, i) => (
        <Stack key={i}>
          <Text asIs>{s.title}</Text>
          <Text route>{s.route ?? '—'}</Text>
        </Stack>
      ))}
    </Stack>
  );
}

function columns(c: Compare) {
  return [
    { header: c.left_label, rowHeader: true, cell: (r: DiffRow) => <Steps steps={r.left} /> },
    {
      header: `${c.right_label}${c.draft ? ' · your draft' : ''}`,
      cell: (r: DiffRow) => (
        <Stack>
          <Steps steps={r.right ? [r.right] : []} />
          {r.notes.map((n, i) => (
            <Note key={i} size="sm">
              {n}
            </Note>
          ))}
        </Stack>
      ),
    },
    {
      header: 'Change',
      cell: (r: DiffRow) => (
        <Cluster>
          <ShownStatus status={r.change} />
          {r.merged && (
            <Text small muted>
              {r.merged}
            </Text>
          )}
        </Cluster>
      ),
    },
  ];
}

/** The change spec: generated (or the saved revision), editable per section, saved as a revision. */
function ChangeSpec({ c, ask }: { c: Compare; ask: (a: Ask) => void }) {
  const [texts, setTexts] = useState(() => Object.fromEntries(c.sections.map((s) => [s.key, s.text])));
  const next = (c.spec_head ?? 0) + 1;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const sections = Object.fromEntries(
      c.sections.map((s) => {
        const text = (texts[s.key] ?? '').trim();
        return [s.key, s.is_list ? text.split('\n').map((l) => l.trim()).filter(Boolean) : text];
      }),
    );
    ask({
      title: `Save the change spec as r${String(next)}?`,
      text: `It is saved with the process for ${c.left_label} against ${c.right_label}, signed with your name; observed documentation is not touched.`,
      confirm: `Save spec as r${String(next)}`,
      write: writes.changeSpec(c.head.portal, c.head.id, {
        left: { label: c.left, rev: c.left_rev },
        right: { label: c.right, rev: c.right_rev },
        sections,
        ...(c.spec_head ? { base_rev: c.spec_head } : {}),
      }),
    });
  };
  const exportHref = `/processes/${encodeURIComponent(c.head.key)}/spec.md?left=${encodeURIComponent(c.left)}&right=${encodeURIComponent(c.right ?? '')}`;
  return (
    <Plate variant="drawn" title="Change spec" actions={c.saved ? <Tag size="sm">{c.saved}</Tag> : <Text small muted>generated · editable</Text>}>
      <form onSubmit={submit} aria-label="Change spec">
        <Stack>
          {c.sections.map((s) => (
            <Field key={s.key} label={`${s.title}${s.is_list ? ' (one per line)' : ''}`}>
              <Textarea
                value={texts[s.key] ?? ''}
                rows={Math.max(2, (texts[s.key] ?? '').split('\n').length + (s.is_list ? 1 : 0))}
                onChange={(e) => setTexts({ ...texts, [s.key]: e.target.value })}
              />
            </Field>
          ))}
          <Cluster>
            <Button variant="primary" type="submit">{`Save spec as r${String(next)}`}</Button>
            <LinkButton href={exportHref} download>
              Export spec
            </LinkButton>
          </Cluster>
          <Text small muted block>
            Saved specs are to-be documents: they stay with the process and are not mixed into the observed documentation.
          </Text>
        </Stack>
      </form>
    </Plate>
  );
}

function Body({ c, pick }: { c: Compare; pick: (side: 'left' | 'right', label: string) => void }) {
  const { ask, view } = useConfirmedWrite(processesKey(c.head.portal));
  return (
    <Stack>
      {view}
      <Cluster>
        <Segmented label="Left process model" selected={c.left} onSelect={(l) => pick('left', l)} items={c.head.models.map((m) => ({ value: m.value, label: `Left · ${m.label}` }))} />
        <Segmented label="Right process model" selected={c.right ?? ''} onSelect={(r) => pick('right', r)} items={c.head.models.map((m) => ({ value: m.value, label: `Right · ${m.label}` }))} />
      </Cluster>
      {c.right === null ? (
        <Callout title="Nothing to compare yet">Branch a to-be process model from the as-is to draw the change.</Callout>
      ) : (
        <>
          <Cluster>
            {c.counts.map(([s, n]) => (
              <Text key={s.word} small>
                <ShownStatus status={s} /> <Text mono small>{String(n)}</Text>
              </Text>
            ))}
          </Cluster>
          <Plate title={`${c.left_label} against ${c.right_label}`} flush>
            <Table caption={`Steps of ${c.left_label} against ${c.right_label}${c.draft ? ' (your draft)' : ''}`} columns={columns(c)} rows={c.rows} rowKey={(r) => JSON.stringify([r.left, r.right])} flush />
          </Plate>
          <ChangeSpec key={`${c.left}-${c.right}-${String(c.spec_head)}`} c={c} ask={ask} />
        </>
      )}
    </Stack>
  );
}

/** Compare two process models (designer screen 06): the step diff and the change spec. */
export function ProcessCompare() {
  const { portal = '', key = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const left = params.get('left') ?? 'A';
  const right = params.get('right') ?? 'B';
  const pick = (side: 'left' | 'right', label: string) =>
    setParams(side === 'left' ? { left: label, right } : { left, right: label }, { replace: true });
  const q = useCompare(portal, key, left, right);
  const name = q.data?.head.name ?? key;
  return (
    <Shell current="processes">
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` },
          { label: 'Processes', href: `/app/portals/${encodeURIComponent(portal)}/processes` },
          { label: name, href: processHref(portal, key) },
          { label: 'Compare' },
        ]}
        title={q.data ? `Compare ${q.data.left} and ${q.data.right ?? '—'}` : 'Compare'}
      />
      <QueryState query={q} what="the comparison">
        {(c) => <Body c={c} pick={pick} />}
      </QueryState>
    </Shell>
  );
}
