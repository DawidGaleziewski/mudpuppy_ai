import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Callout, Check, Cluster, Code, Field, Fieldset, Input, PageHead, Plate, Select, Split, Stack, Text } from '../design-system';
import { getJson } from '../app/api';
import type { Write } from '../app/api-write';
import { useConfirmedWrite } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { useGo } from '../app/RouterAnchor';
import { Shell } from '../app/Shell';

interface NewPortalForm {
  service_up: boolean;
  start_hint: string;
  environments: string[];
  limits: { value: string; label: string }[];
}

type Envs = Record<string, { base_url: string; limit: string }>;

const createPortal = (body: { id: string; robots: string; environments: Envs }): Write => ({ path: '/api/portals', body });

function Environment({ name, value, limits, set, first }: { name: string; value: Envs[string]; limits: NewPortalForm['limits']; set: (v: Envs[string]) => void; first: boolean }) {
  return (
    <Fieldset legend={name}>
      <Split>
        <Field label="Address">
          <Input
            type="text"
            inputMode="url"
            spellCheck={false}
            autoFocus={first}
            placeholder={first ? 'https://www.wikipedia.org/' : 'Leave empty if there is none'}
            value={value.base_url}
            onChange={(e) => set({ ...value, base_url: e.target.value })}
          />
        </Field>
        <Field label="The most a scan may do here">
          <Select value={value.limit} onChange={(e) => set({ ...value, limit: e.target.value })}>
            {limits.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
        </Field>
      </Split>
    </Fieldset>
  );
}

function Form({ f }: { f: NewPortalForm }) {
  const [id, setId] = useState('');
  const [robots, setRobots] = useState('ignore');
  const [envs, setEnvs] = useState<Envs>(() => Object.fromEntries(f.environments.map((e) => [e, { base_url: '', limit: f.limits[0]?.value ?? 'read' }])));
  const go = useGo();
  const { ask, view } = useConfirmedWrite(['portals']);
  const given = Object.entries(envs).filter(([, v]) => v.base_url.trim());
  const save = () =>
    ask({
      title: 'Save the portal?',
      text: `The assistant writes it with ${given.map(([e]) => e).join(', ')} and a guest persona; its Home opens with the assistant.`,
      confirm: 'Save portal',
      write: createPortal({ id: id.trim(), robots, environments: Object.fromEntries(given) }),
      onDone: (r) => {
        if (r.href) go(r.href);
      },
    });
  return (
    <Plate title="Which site do you want to document?">
      <Stack>
        <Text block muted>
          Give the address of each environment you have: at least one. The crawler starts there, stays on that domain (and its subdomains) and visits it as a guest. You can add or revoke environments later in Settings. After saving, the assistant opens for it: ask it to scan.
        </Text>
        {view}
        <Field label="Short name (optional)" help="Proposed from the first address, e.g. wikipedia-org">
          <Input type="text" pattern="[a-z0-9][a-z0-9_\-]*" spellCheck={false} value={id} onChange={(e) => setId(e.target.value)} />
        </Field>
        {f.environments.map((e, i) => (
          <Environment key={e} name={e} first={i === 0} value={envs[e] ?? { base_url: '', limit: 'read' }} limits={f.limits} set={(v) => setEnvs({ ...envs, [e]: v })} />
        ))}
        <Fieldset legend="robots.txt">
          <Check radio name="robots" label="ignore it (visit every page; your responsibility)" checked={robots === 'ignore'} onChange={() => setRobots('ignore')} />
          <Check radio name="robots" label="respect it" checked={robots === 'respect'} onChange={() => setRobots('respect')} />
        </Fieldset>
        <Text small muted>
          Every scan only looks unless you allow more: before each scan the assistant asks whether it may fill in and submit forms (up to the limit above). On production that really happens on the live site.
        </Text>
        <Cluster>
          <Button variant="primary" disabled={!f.service_up || given.length === 0} onClick={save}>Save portal</Button>
        </Cluster>
      </Stack>
    </Plate>
  );
}

/** "+ New portal" (spec 011 FR-004, FR-005, FR-011): a site to work on, with an address and a limit per environment. */
export function NewPortal() {
  const q = useQuery({ queryKey: ['portals', 'new'], queryFn: () => getJson<NewPortalForm>('/api/portals/new') });
  return (
    <Shell current="portals">
      <PageHead crumbs={[{ label: 'Portals', href: '/app/' }, { label: 'New portal' }]} title="New portal" />
      <QueryState query={q} what="the new portal form">
        {(f) => (
          <Stack>
            {!f.service_up && (
              <Callout tone="failure" title="Assistant not running" live>
                <Stack>
                  <Text block>It saves the portal. Start it in a terminal, then reload this page.</Text>
                  <Code>{f.start_hint}</Code>
                </Stack>
              </Callout>
            )}
            <Form f={f} />
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
