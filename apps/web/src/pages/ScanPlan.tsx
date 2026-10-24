import { useForm, useWatch } from 'react-hook-form';
import { useParams } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Choice, Cluster, Columns, Count, Field, Fieldset, Grid, Input, PageHead, Plate, Row, Rows, Select, Stack, SubHead, Text } from '../design-system';
import { planKey, startScan, usePlan, type PlanPage } from '../app/api-plan';
import { stateHref } from '../app/api-state';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';

function Marks({ p }: { p: PlanPage }) {
  const mapHref = `/app/portals/${encodeURIComponent(p.portal)}/screens/map?view=path`;
  return (
    <Fieldset legend="2 · Where it starts and what it leaves out">
      <Stack>
        {p.groups.map((g) => (
          <Stack key={g.kind}>
            <SubHead>
              {g.label} <Count muted>{g.marks.length}</Count>
            </SubHead>
            {g.marks.length ? (
              <Rows label={g.label}>
                {g.marks.map((m) => (
                  <Row key={`${m.title}-${m.route}`} aside={<Text small muted={m.reach !== null}>{m.reach ?? 'no recorded way there for a replay'}</Text>}>
                    <Cluster>
                      <Text asIs {...(m.state ? { href: stateHref(m.state) } : {})}>{m.title}</Text>
                      <Text route>{m.route}</Text>
                    </Cluster>
                  </Row>
                ))}
              </Rows>
            ) : (
              <Text small muted>
                {'None. Mark screens on the map’s '}
                <Text small href={mapHref}>One scan&apos;s path</Text>.
              </Text>
            )}
          </Stack>
        ))}
      </Stack>
    </Fieldset>
  );
}

const PlanSchema = z.object({
  run_type: z.string(),
  persona: z.string().min(1, 'A persona first.'),
  environment: z.string(),
  depth: z.number({ invalid_type_error: 'A whole number.' }).int('A whole number.').min(0).max(10),
  variation: z.string(),
});
type PlanValues = z.infer<typeof PlanSchema>;

function PlanForm({ p, ask }: { p: PlanPage; ask: (a: Ask) => void }) {
  const form = useForm<PlanValues>({
    defaultValues: { run_type: p.types[0]?.value ?? 'focused', persona: p.personas[0] ?? '', environment: p.environments[0] ?? '', depth: 2, variation: p.variations[0]?.value ?? 'none' },
    resolver: zodResolver(PlanSchema),
  });
  const [type, persona] = useWatch({ control: form.control, name: ['run_type', 'persona'] });
  const depthError = form.formState.errors.depth?.message;
  const start = form.handleSubmit((plan) => {
    const label = p.types.find((t) => t.value === plan.run_type)?.label ?? plan.run_type;
    ask({
      title: `Start a ${label.toLowerCase()} scan?`,
      text: `The assistant starts it in ${p.portal}'s conversation as ${plan.persona}${plan.environment ? ` on ${plan.environment}` : ''}; follow it there.`,
      confirm: 'Start scan',
      write: startScan(p.portal, plan),
      follow: 'Open the assistant',
    });
  });
  return (
    <form onSubmit={(e) => void start(e)} aria-label="Plan next scan">
      <Stack>
        <Fieldset legend="1 · Scan type">
          <Grid min="210px">
            {p.types.map((t) => (
              <Choice key={t.value} name="run_type" value={t.value} checked={type === t.value} onChange={(v) => form.setValue('run_type', v)} label={t.label} what={t.hint} />
            ))}
          </Grid>
          <Text small muted>To continue a stopped scan, open it from Scans and choose Resume.</Text>
        </Fieldset>
        <Marks p={p} />
        <Fieldset legend="3 · Persona, environment, limits">
          <Cluster>
            <Field label="Persona">
              <Select {...form.register('persona')}>
                {p.personas.length ? p.personas.map((x) => <option key={x}>{x}</option>) : <option value="">no scan yet</option>}
              </Select>
            </Field>
            <Field label="Environment">
              <Select {...form.register('environment')}>
                {p.environments.map((x) => <option key={x}>{x}</option>)}
              </Select>
            </Field>
            <Field label="Depth from the start (focused)" {...(depthError ? { error: depthError } : {})}>
              <Input type="number" min={0} max={10} {...form.register('depth', { valueAsNumber: true })} />
            </Field>
            <Field label="Variation (retry)">
              <Select {...form.register('variation')}>
                {p.variations.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </Select>
            </Field>
          </Cluster>
          <Text small muted>A replay logs in first when the persona logs in. Skip marks apply to every scan while they are open; the other marks close when a scan uses them.</Text>
        </Fieldset>
        <Cluster>
          <Button type="submit" variant="primary" disabled={!persona}>Start scan</Button>
          <Text small muted>Asks the assistant in this portal&apos;s chat; follow the scan there.</Text>
        </Cluster>
      </Stack>
    </form>
  );
}

function WhatHappens() {
  return (
    <Plate variant="intent" title="What will happen">
      <Stack>
        {[
          'The crawler starts a new run of the type you chose.',
          'It reaches each marked screen by replaying the recorded path (one step per recorded click), or by its address where a scan opened it directly.',
          'If a page on the way looks different, it stops that start point and says where.',
          'Focused: it explores from there, only as deep as you set. Recheck: it only records what the screen shows now. Retry: it presses the failed action once more.',
        ].map((s, i) => (
          <Text key={i} small block>{`${String(i + 1)}. ${s}`}</Text>
        ))}
      </Stack>
    </Plate>
  );
}

/** Plan next scan (screen 14, spec 034 R-66): the marks set on the map pre-fill it; nothing runs until Start scan. */
export function ScanPlan() {
  const { portal = '' } = useParams();
  const q = usePlan(portal);
  const { ask, view } = useConfirmedWrite(planKey(portal));
  return (
    <Shell current="scans">
      <QueryState query={q} what="the scan plan">
        {(p) => (
          <Stack>
            <PageHead
              crumbs={[{ label: 'Scans', href: `/app/portals/${encodeURIComponent(portal)}/scans` }, { label: 'Plan next scan' }]}
              title="Plan next scan"
              meta={`${p.portal} · ${String(p.total)} open mark${p.total === 1 ? '' : 's'} from the map · nothing runs until you start it`}
            />
            {view}
            <Columns main={<PlanForm p={p} ask={ask} />} side={<WhatHappens />} />
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
