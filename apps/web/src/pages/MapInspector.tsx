import {
  Cluster,
  Facts,
  Meter,
  Plate,
  Row,
  Rows,
  Stack,
  SubHead,
  Tag,
  Text,
} from '../design-system';
import { useScreen, type ScreenDetailData } from '../app/api-screens';
import { QueryState } from '../app/QueryState';
import { ShownChip } from '../app/ShownChip';
import { ShownStatus } from '../app/ShownStatus';

/** How many actions inside the inspector lists; the screen page has them all. */
const INSIDE_SHOWN = 12;
const CHANGES_SHOWN = 5;

const screenHref = (portal: string, key: string) =>
  `/app/portals/${encodeURIComponent(portal)}/screens/${encodeURIComponent(key)}`;

function About({ d }: { d: ScreenDetailData }) {
  const s = d.screen;
  return (
    <Stack>
      <Facts
        items={[
          [
            'Screen',
            <Tag size="sm" href={screenHref(d.portal, s.key)}>
              {s.key}
            </Tag>,
          ],
          ['Route', <Text route>{s.route}</Text>],
          ['Status', <ShownStatus status={s.status} />],
          ...(s.parts.length ? [['Part', s.parts.join(', ')] as const] : []),
          ...(s.process ? [['Process', <Text asIs>{s.process.name}</Text>] as const] : []),
          ...(s.last_seen ? [['Last seen (UTC)', <Text mono>{s.last_seen}</Text>] as const] : []),
        ]}
      />
      {s.actions > 0 && (
        <Meter
          label="Actions checked"
          value={s.checked}
          max={s.actions}
          status={s.checked === s.actions ? 'ok' : 'running'}
          detail={`${String(s.checked)} / ${String(s.actions)}`}
        />
      )}
    </Stack>
  );
}

function Variants({ d }: { d: ScreenDetailData }) {
  return (
    <Stack>
      <SubHead>{`Variants · ${String(d.variants.length)}`}</SubHead>
      <Rows label="Variants">
        {d.variants.map((v) => (
          <Row key={v.state_id} aside={<ShownStatus status={v.status} />}>
            <Cluster>
              <Text strong>{`r${String(v.ordinal)}`}</Text>
              <ShownChip chip={{ word: v.reason, variant: v.reason_chip }} />
            </Cluster>
            <Text small muted asIs>
              {[v.releases.join(', '), v.personas.join(', ') || '—', v.first_seen].filter(Boolean).join(' · ')}
            </Text>
          </Row>
        ))}
      </Rows>
    </Stack>
  );
}

function Actions({ d }: { d: ScreenDetailData }) {
  const inside = d.actions.filter((a) => a.place === 'inside');
  const out = d.actions.filter((a) => a.place === 'out');
  const menu = d.actions.filter((a) => a.place === 'menu').length;
  const own = d.screen.key;
  return (
    <Stack>
      <SubHead>{`Actions inside · ${String(inside.length)}`}</SubHead>
      {inside.length === 0 ? (
        <Text small muted>
          None.
        </Text>
      ) : (
        <Rows label="Actions inside">
          {inside.slice(0, INSIDE_SHOWN).map((a) => (
            <Row key={a.element_key} aside={<ShownStatus status={a.status} />}>
              <Text mono small asIs>
                {a.element_key}
              </Text>
            </Row>
          ))}
        </Rows>
      )}
      {inside.length > INSIDE_SHOWN && (
        <Text small muted>{`and ${String(inside.length - INSIDE_SHOWN)} more on the screen page`}</Text>
      )}
      <SubHead>{`Links out · ${String(out.length)}${menu ? ' + menu' : ''}`}</SubHead>
      <Rows label="Links out">
        {out.flatMap((a) =>
          a.leads_to
            .filter((l) => l.key && l.key !== own)
            .map((l) => (
              <Row key={`${a.element_key}-${l.key ?? ''}`} aside={<ShownStatus status={a.status} />}>
                <Text mono small asIs>
                  {a.element_key}
                </Text>{' '}
                → <Text asIs>{l.title}</Text>
              </Row>
            )),
        )}
        {menu > 0 && (
          <Row tone="muted" aside={<Text small>bundled</Text>}>
            {`Menu · ${String(menu)} link${menu === 1 ? '' : 's'}`}
          </Row>
        )}
      </Rows>
    </Stack>
  );
}

function Changes({ d }: { d: ScreenDetailData }) {
  if (d.history.length === 0) return null;
  return (
    <Stack>
      <SubHead>{`Changes · ${String(d.history.length)}`}</SubHead>
      <Rows label="Latest changes">
        {d.history.slice(0, CHANGES_SHOWN).map((ch) => (
          <Row key={ch.id} aside={<ShownStatus status={ch.status} />}>
            <ShownChip chip={ch.chip} /> <Text asIs>{ch.finding}</Text>
          </Row>
        ))}
      </Rows>
    </Stack>
  );
}

function Selected({ portal, screenKey }: { portal: string; screenKey: string }) {
  const q = useScreen(portal, screenKey);
  return (
    <Plate
      title={<Text asIs>{q.data ? q.data.screen.title || '(untitled page)' : screenKey}</Text>}
      actions={<Text small href={screenHref(portal, screenKey)}>Open screen</Text>}
    >
      <QueryState query={q} what="the screen">
        {(d) => (
          <Stack>
            <About d={d} />
            <Variants d={d} />
            <Actions d={d} />
            <Changes d={d} />
          </Stack>
        )}
      </QueryState>
    </Plate>
  );
}

/** The map's side column (v2-08): the selected screen's facts, variants, actions, links out and latest changes. */
export function MapInspector({ portal, screenKey }: { portal: string; screenKey: string }) {
  if (screenKey) return <Selected portal={portal} screenKey={screenKey} />;
  return (
    <Plate title="Inspector">
      <Text small muted block>
        Select a screen to see its variants, actions, links and changes.
      </Text>
    </Plate>
  );
}
