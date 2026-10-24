import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Callout, Check, Cluster, Code, Field, Fieldset, Input, PageHead, Plate, Select, Split, Stack, Text } from '../design-system';
import { api, read } from '../app/state/api';
import type { Write } from '../app/state/http';
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

/** The form's values: an environment per row, in the order the API lists them (React Hook Form, spec 076). */
const PortalSchema = z
  .object({
    id: z.string().trim().regex(/^([a-z0-9][a-z0-9_-]*)?$/, 'Lower case letters, digits, _ and -.'),
    robots: z.enum(['ignore', 'respect']),
    envs: z.array(z.object({ name: z.string(), base_url: z.string().trim(), limit: z.string() })),
  })
  .refine((v) => v.envs.some((e) => e.base_url !== ''), { path: ['envs'], message: 'An address for at least one environment.' });
type PortalValues = z.input<typeof PortalSchema>;

function Environment({ form, i, name, limits }: { form: UseFormReturn<PortalValues>; i: number; name: string; limits: NewPortalForm['limits'] }) {
  return (
    <Fieldset legend={name}>
      <Split>
        <Field label="Address">
          <Input
            type="text"
            inputMode="url"
            spellCheck={false}
            autoFocus={i === 0}
            placeholder={i === 0 ? 'https://www.wikipedia.org/' : 'Leave empty if there is none'}
            {...form.register(`envs.${i}.base_url`)}
          />
        </Field>
        <Field label="The most a scan may do here">
          <Select {...form.register(`envs.${i}.limit`)}>
            {limits.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
        </Field>
      </Split>
    </Fieldset>
  );
}

function Form({ f }: { f: NewPortalForm }) {
  const form = useForm<PortalValues, unknown, z.output<typeof PortalSchema>>({
    defaultValues: { id: '', robots: 'ignore', envs: f.environments.map((name) => ({ name, base_url: '', limit: f.limits[0]?.value ?? 'read' })) },
    resolver: zodResolver(PortalSchema),
  });
  const envs = useWatch({ control: form.control, name: 'envs' });
  const idError = form.formState.errors.id?.message;
  const go = useGo();
  const { ask, view } = useConfirmedWrite(['portals']);
  const save = form.handleSubmit(({ id, robots, envs: all }) => {
    const given = all.filter((e) => e.base_url !== '');
    ask({
      title: 'Save the portal?',
      text: `The assistant writes it with ${given.map((e) => e.name).join(', ')} and a guest persona; its Home opens with the assistant.`,
      confirm: 'Save portal',
      write: createPortal({ id, robots, environments: Object.fromEntries(given.map(({ name, base_url, limit }) => [name, { base_url, limit }])) }),
      onDone: (r) => {
        if (r.href) go(r.href);
      },
    });
  });
  return (
    <Plate title="Which site do you want to document?">
      {view}
      <form onSubmit={(e) => void save(e)} aria-label="New portal">
        <Stack>
          <Text block muted>
            Give the address of each environment you have: at least one. The crawler starts there, stays on that domain (and its subdomains) and visits it as a guest. You can add or revoke environments later in Settings. After saving, the assistant opens for it: ask it to scan.
          </Text>
          <Field label="Short name (optional)" help="Proposed from the first address, e.g. wikipedia-org" {...(idError ? { error: idError } : {})}>
            <Input type="text" spellCheck={false} {...form.register('id')} />
          </Field>
          {f.environments.map((e, i) => (
            <Environment key={e} form={form} i={i} name={e} limits={f.limits} />
          ))}
          <Fieldset legend="robots.txt">
            <Check radio value="ignore" label="ignore it (visit every page; your responsibility)" {...form.register('robots')} />
            <Check radio value="respect" label="respect it" {...form.register('robots')} />
          </Fieldset>
          <Text small muted>
            Every scan only looks unless you allow more: before each scan the assistant asks whether it may fill in and submit forms (up to the limit above). On production that really happens on the live site.
          </Text>
          <Cluster>
            <Button type="submit" variant="primary" disabled={!f.service_up || !envs.some((e) => e.base_url.trim())}>
              Save portal
            </Button>
          </Cluster>
        </Stack>
      </form>
    </Plate>
  );
}

const newPortalApi = api.injectEndpoints({
  endpoints: (b) => ({
    newPortalForm: read<NewPortalForm, void>(b, () => '/api/portals/new', () => ['portals', 'new']),
  }),
});

/** "+ New portal" (spec 011 FR-004, FR-005, FR-011): a site to work on, with an address and a limit per environment. */
export function NewPortal() {
  const q = newPortalApi.useNewPortalFormQuery();
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
