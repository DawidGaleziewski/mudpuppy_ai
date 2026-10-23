import { useLocation } from 'react-router';
import { Disclosure, Shot, Split, Stack, SubHead, Table, Text } from '../design-system';
import type { Access, SideBySide } from './api-state';

type Element = Access['elements'][number];

/** This page's address with personas `left` and `right` side by side, its other parameters kept. */
function withPair(pathname: string, search: string, left: string, right: string) {
  const p = new URLSearchParams(search);
  p.set('left', left);
  p.set('right', right);
  return `${pathname}?${p.toString()}`;
}

function Side({ s }: { s: SideBySide['left'] }) {
  return (
    <Stack>
      <Text asIs>{s.persona}</Text>
      <Text small muted asIs>{s.attributes ?? 'no attributes'}</Text>
      {s.shot ? <Shot src={s.shot} alt={`The screen as ${s.persona} saw it`} /> : <Text small muted>No screenshot recorded.</Text>}
    </Stack>
  );
}

function Pair({ a, pathname, search }: { a: Access; pathname: string; search: string }) {
  const s = a.side_by_side;
  if (!s) return null;
  const others = a.reached.filter((r) => r.persona !== s.left.persona && r.persona !== s.right.persona);
  return (
    <Stack>
      <SubHead>{`${s.left.persona} and ${s.right.persona} side by side`}</SubHead>
      <Split>
        <Side s={s.left} />
        <Side s={s.right} />
      </Split>
      {s.only_left.length > 0 && <Text small>{`Only ${s.left.persona}: ${s.only_left.join(', ')}`}</Text>}
      {s.only_right.length > 0 && <Text small>{`Only ${s.right.persona}: ${s.only_right.join(', ')}`}</Text>}
      {s.text_differs.map(([l, r]) => (
        <Text key={`${l}|${r}`} small>{`Text differs: ${l} · ${r}`}</Text>
      ))}
      <Text small muted>{`${String(s.same)} elements the same`}</Text>
      {others.map((o) => (
        <Text key={o.persona} small href={withPair(pathname, search, s.left.persona, o.persona)}>{`Compare ${s.left.persona} with ${o.persona}`}</Text>
      ))}
    </Stack>
  );
}

/**
 * Who sees what on this screen (spec 024 US2): the personas that reached it, each element some see
 * and others do not, and two personas side by side (`?left=&right=` picks them).
 */
export function RecordingAccess({ a }: { a: Access | null }) {
  const { pathname, search } = useLocation();
  if (!a || a.personas.length < 2) return null;
  const summary = a.elements.length ? `Access · ${String(a.elements.length)} differ` : 'Access · every persona sees the same';
  return (
    <Disclosure summary={summary}>
      <Stack>
        <Text small>{`Reached by ${a.reached.map((r) => (r.complete ? r.persona : `${r.persona} (trace only)`)).join(', ')}`}</Text>
        {a.not_reached.length > 0 && <Text small muted>{`Never reached by ${a.not_reached.join(', ')}`}</Text>}
        {a.elements.length > 0 && (
          <Table<Element>
            caption="Elements some personas see and others do not"
            dense
            rows={a.elements}
            rowKey={(e) => e.key}
            columns={[
              { header: 'Element', rowHeader: true, cell: (e) => <Text asIs>{e.key}</Text> },
              { header: 'Seen by', cell: (e) => e.seen_by.join(', ') },
              { header: 'Not seen by', cell: (e) => e.not_seen_by.join(', ') },
            ]}
          />
        )}
        <Pair a={a} pathname={pathname} search={search} />
      </Stack>
    </Disclosure>
  );
}
