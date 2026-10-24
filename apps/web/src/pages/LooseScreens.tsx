import { useState } from 'react';
import { useParams } from 'react-router';
import { Button, Columns, Field, Menu, PageHead, Plate, RowPicture, Segmented, Select, SelectionBar, Skeleton, SortGrid, Split, Stack, Table, Text, ViewNav } from '../design-system';
import { addEntries, rememberAdded, seenBy } from '../app/addToProcess';
import { looseHref, processesKey, useProcesses, type LooseScreen, type ProcessList, type Target } from '../app/api-processes';
import { writes } from '../app/api-write';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { headMeta, QueryState } from '../app/QueryState';
import { ScreenBrowser, useScreenBrowser } from '../app/ScreenBrowser';
import { Shell } from '../app/Shell';
import { IN_LOOSE, stateIn } from '../app/StepNeighbours';
import { NewProcess } from './NewProcess';

const SORTS = [
  ['seen', 'Last seen'],
  ['route', 'Route'],
  ['title', 'Title'],
] as const;
type Sort = (typeof SORTS)[number][0];

const BY: Record<Sort, (a: LooseScreen, b: LooseScreen) => number> = {
  seen: (a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? ''),
  route: (a, b) => a.route.localeCompare(b.route),
  title: (a, b) => a.title.localeCompare(b.title),
};

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : null);
const meta = (s: LooseScreen) => [day(s.last_seen) && `seen ${day(s.last_seen) ?? ''}`, `${String(s.variants ?? 1)} variant${(s.variants ?? 1) === 1 ? '' : 's'}`].filter(Boolean).join(' · ');

/** The ticks in tick order: a tick adds at the end; Shift + click ticks every card from the last ticked one. */
function useTicks(order: readonly string[]) {
  const [ticked, setTicked] = useState<string[]>([]);
  const tick = (key: string, range: boolean) => {
    const last = ticked.at(-1);
    if (range && last !== undefined) {
      const [a, b] = [order.indexOf(last), order.indexOf(key)];
      const span = order.slice(Math.min(a, b), Math.max(a, b) + 1).filter((k) => !ticked.includes(k));
      setTicked([...ticked, ...(a <= b ? span : span.reverse())]);
      return;
    }
    setTicked(ticked.includes(key) ? ticked.filter((k) => k !== key) : [...ticked, key]);
  };
  return { ticked, setTicked, tick };
}

/** Add to process: asks first, then the answer offers Undo (the screens leave the scope again). */
function addAsk(portal: string, t: Target, states: readonly string[], names: string, done: () => void): Ask {
  return {
    title: `Add ${names} to ${t.name}?`,
    text: `They join ${t.key}'s scope. Its as-is follows what scans saw: a screen no scan reached from its steps waits as "Not on the observed path yet". No to-be model changes.`,
    confirm: 'Add to process',
    write: writes.addToScope(portal, t.id, states),
    follow: 'Open the process',
    onDone: () => {
      rememberAdded(t.id);
      done();
    },
    undo: (u) => ({
      title: `Take ${names} out of ${t.name} again?`,
      text: 'They leave its scope, and the as-is revision they caused is undone by a new one.',
      confirm: 'Undo',
      write: writes.removeFromScope(portal, t.id, u.split(',')),
    }),
  };
}

function ListView({ rows, open }: { rows: readonly LooseScreen[]; open: (key: string) => void }) {
  const cols = [
    {
      header: 'Screen',
      rowHeader: true,
      cell: (s: LooseScreen) => (
        <RowPicture src={s.thumb ?? s.shot ?? s.wire} alt={s.title || s.route} missing="not recorded yet" onOpen={() => open(s.state)} pick={s.state}>
          <Text asIs>{s.title || '(untitled page)'}</Text>
          <Text route>{s.route}</Text>
        </RowPicture>
      ),
    },
    { header: 'Seen', cell: (s: LooseScreen) => <Text small>{meta(s)}</Text> },
  ];
  return <Table caption="Screens in no process" columns={cols} rows={rows} rowKey={(s) => s.state} dense flush />;
}

function Body({ d }: { d: ProcessList }) {
  const { ask, view } = useConfirmedWrite(processesKey(d.portal));
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<Sort>('seen');
  const rows = [...d.loose].sort(BY[sort]);
  const { ticked, setTicked, tick } = useTicks(rows.map((s) => s.state));
  const browser = useScreenBrowser();
  const byState = new Map(rows.map((s) => [s.state, s]));
  const names = (states: readonly string[]) => states.map((s) => byState.get(s)?.title || s).join(', ');
  const fresh = () => document.querySelector<HTMLInputElement>('form[aria-label="New process from these"] input')?.focus();
  const menu = (states: readonly string[]) => addEntries(d.targets, seenBy(d.loose, states, d.default_persona), states, (t) => ask(addAsk(d.portal, t, states, names(states), () => setTicked([]))), fresh);
  const open = (key: string) => browser.open(rows.findIndex((s) => s.state === key));
  const items = rows.map((s) => ({ key: s.state, title: s.title || s.route, route: s.route, shot: s.shot, wire: s.wire, ...(s.screen_key && { href: stateIn(s.state, IN_LOOSE) }) }));
  const pick = { tickLabel: 'In the new process', ticked: (k: string) => ticked.includes(k), step: (k: string) => (ticked.includes(k) ? ticked.indexOf(k) + 1 : null), onTick: (k: string) => tick(k, false), addEntries: (k: string) => menu([k]) };
  return (
    <Stack>
      {view}
      <Split>
        <Segmented label="Show as" selected={layout} onSelect={(v) => setLayout(v === 'list' ? 'list' : 'grid')} items={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]} />
        <Field label="Sort">
          <Select value={sort} onChange={(e) => setSort(SORTS.find(([v]) => v === e.target.value)?.[0] ?? 'seen')}>
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </Split>
      <ScreenBrowser portal={d.portal} items={items} label="in no process" index={browser.index} onIndex={browser.open} onClose={browser.close} pick={pick} screenOf={(k) => byState.get(k)?.screen_key ?? null} />
      <Columns
        main={
          layout === 'grid' ? (
            <SortGrid label="Screens in no process" items={rows.map((s) => ({ key: s.state, title: s.title || s.route, route: s.route, meta: meta(s), src: s.thumb ?? s.shot ?? s.wire, ticked: ticked.includes(s.state), step: pick.step(s.state) }))} onTick={tick} onOpen={open} menuFor={(k) => menu([k])} />
          ) : (
            <ListView rows={rows} open={open} />
          )
        }
        side={
          <Plate title="New process from these">
            <NewProcess portal={d.portal} loose={d.loose} persona={d.default_persona} picked={ticked} setPicked={setTicked} ask={ask} />
          </Plate>
        }
      />
      {ticked.length > 0 && (
        <SelectionBar count={`${String(ticked.length)} ticked`}>
          <Menu label="Add to process" button="Add to process ▾" entries={menu(ticked)} align="up" searchAfter={8} searchLabel="Find a process" />
          <Button size="sm" variant="quiet" onClick={() => setTicked([])}>
            Clear
          </Button>
        </SelectionBar>
      )}
    </Stack>
  );
}

/** Processes ▸ In no process (designer T-05, v2-18): sort the loose screens into processes without dragging. */
export function LooseScreens() {
  const portal = useParams().portal ?? '';
  const q = useProcesses(portal, false, 1);
  const base = `/app/portals/${encodeURIComponent(portal)}`;
  return (
    <Shell current="processes">
      <PageHead
        crumbs={[
          { label: 'Portals', href: '/app/' },
          { label: portal, href: base },
          { label: 'Processes', href: `${base}/processes` },
          { label: 'In no process' },
        ]}
        title="In no process"
        meta={headMeta(q, (d) => `${String(d.loose.length)} screens no process includes yet · tick them into a new process, or add them to one`)}
      />
      <ViewNav
        label="Processes views"
        items={[
          { href: `${base}/processes`, label: 'Processes', count: q.data?.total },
          { href: looseHref(portal), label: 'In no process', count: q.data?.loose.length, current: true },
        ]}
      />
      <QueryState query={q} what="the screens in no process" skeleton={<Skeleton.Block height={480} />}>
        {(d) =>
          d.loose.length === 0 ? (
            <Text muted block>
              Every recorded screen is in a process.
            </Text>
          ) : (
            <Body d={d} />
          )
        }
      </QueryState>
    </Shell>
  );
}
