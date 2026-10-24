import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Cluster, Count, Disclosure, Facts, Field, Input, Plate, Row, Rows, Stack, Text, Textarea } from '../design-system';
import { settingsWrites, type SettingsHints, type SettingsPage } from '../app/api-settings';
import type { Ask } from '../app/ConfirmedWrite';
import { argsOf, emptyDraft, PersonaFields, usePersonaForm } from '../app/PersonaForm';

const list = (items: readonly string[], none: string, mono = true) =>
  items.length ? <Text mono={mono}>{items.join(', ')}</Text> : <Text muted>{none}</Text>;

/** The personas of this portal, as written: kind, credential references, attributes. */
export function Personas({ s, ask }: { s: SettingsPage; ask: (a: Ask) => void }) {
  const remove = (id: string) =>
    ask({
      title: `Remove persona ${id}?`,
      text: 'Only a persona no scan used can be removed; a used one stays, because its scans cite it.',
      confirm: 'Remove',
      write: settingsWrites.removePersona(s.portal, id),
    });
  return (
    <Plate title="Personas" actions={<Count muted>{s.personas.length}</Count>}>
      <Stack>
        {s.personas.length ? (
          <Rows label="Personas">
            {s.personas.map((p) => (
              <Row
                key={p.id}
                aside={
                  <Cluster>
                    <Text small muted>{p.kind}</Text>
                    <Button size="sm" variant="quiet" aria-label={`Remove ${p.id}`} onClick={() => remove(p.id)}>
                      Remove
                    </Button>
                  </Cluster>
                }
              >
                <Text mono>{p.id}</Text>
                {p.refs.length > 0 && <Text small muted>{`needs ${p.refs.join(', ')}`}</Text>}
                {p.attributes.length > 0 && <Text small>{p.attributes.map((a) => `${a.value} ${a.label}`).join('; ')}</Text>}
              </Row>
            ))}
          </Rows>
        ) : (
          <Text small muted>{`No persona files for ${s.portal}. Add one below, or ask the assistant to build one.`}</Text>
        )}
        <AddPersona s={s} ask={ask} />
      </Stack>
    </Plate>
  );
}

/** Settings ▸ Personas ▸ Add persona (spec 072): the same fields as the Workbench's persona card. */
function AddPersona({ s, ask }: { s: SettingsPage; ask: (a: Ask) => void }) {
  const form = usePersonaForm(emptyDraft, s.personas.map((p) => p.id));
  const add = form.handleSubmit((draft) =>
    ask({
      title: `Add persona ${draft.name.trim()}?`,
      text: 'The chat service writes the persona file; scans you start can then use it. Nothing is saved before this.',
      confirm: 'Add persona',
      write: settingsWrites.addPersona(s.portal, argsOf(draft)),
      onDone: () => form.reset(emptyDraft),
    }),
  );
  return (
    <Disclosure summary="Add persona">
      <form onSubmit={(e) => void add(e)} aria-label="Add persona">
        <Stack>
          <PersonaFields form={form} signIns={s.sign_ins} />
          <Cluster>
            <Button size="md" type="submit" disabled={!form.formState.isValid}>
              Add persona
            </Button>
          </Cluster>
        </Stack>
      </form>
    </Disclosure>
  );
}

/** Crawl rules, read from the portal file; changing them goes through the assistant. */
export function CrawlRules({ s }: { s: SettingsPage }) {
  const r = s.rules;
  return (
    <Plate title="Crawl rules">
      {r ? (
        <Stack>
          <Facts
            items={[
              ['robots.txt', r.robots === 'respect' ? 'respect it' : 'ignore it (visit every page; your responsibility)'],
              ['Allowed domains', list(r.domains, 'none listed')],
              ['Allowed URLs', r.allowed_urls === null ? <Text muted>everything on the allowed domains</Text> : list(r.allowed_urls, 'none listed')],
              ['Disallowed URLs', list(r.disallowed_urls, 'none listed')],
            ]}
          />
          <Text small muted>
            Read from the portal file. Ask the assistant to change a rule.
          </Text>
        </Stack>
      ) : (
        <Text small muted>{`The portal file for ${s.portal} could not be read, so no rules are shown.`}</Text>
      )}
    </Plate>
  );
}

const HintsSchema = z.object({ marker_header: z.string().max(200), marker_meta: z.string().max(200), ab_flags: z.string(), refusals: z.string() });

function HintsForm({ portal, h, ask }: { portal: string; h: SettingsHints; ask: (a: Ask) => void }) {
  const form = useForm<z.infer<typeof HintsSchema>>({
    defaultValues: { marker_header: h.marker_header, marker_meta: h.marker_meta, ab_flags: h.ab_flags.join('\n'), refusals: h.refusals.join('\n') },
    resolver: zodResolver(HintsSchema),
  });
  const save = form.handleSubmit((fields) =>
    ask({
      title: 'Save the hints?',
      text: 'The chat service writes them into the portal file; the file is put back when it would not load.',
      confirm: 'Save the hints',
      write: settingsWrites.hints(portal, fields),
    }),
  );
  return (
    <Disclosure summary="Change the hints">
      <form onSubmit={(e) => void save(e)} aria-label="Change the hints">
        <Stack>
          <Cluster>
            <Field label="Release marker: response header">
              <Input maxLength={200} placeholder="x-app-version" {...form.register('marker_header')} />
            </Field>
            <Field label="or meta name">
              <Input maxLength={200} placeholder="app-version" {...form.register('marker_meta')} />
            </Field>
          </Cluster>
          <Text small muted>
            Where the page names its release. With one, a change is told apart by release at once; without, by comparing pages, which is slower.
          </Text>
          <Field label="A/B cookies, one per line" help='"cookie NAME" or "storage NAME". Scans read the A/B arm from these, so a variant per arm is not a finding.'>
            <Textarea rows={3} placeholder={'cookie ab_calc\nstorage exp.hero'} {...form.register('ab_flags')} />
          </Field>
          <Field label="Business refusals, one per line" help="A page showing one of these texts is a business refusal, not a technical error.">
            <Textarea rows={3} placeholder="Nie możemy Cię ubezpieczyć" {...form.register('refusals')} />
          </Field>
          <Cluster>
            <Button size="md" type="submit">
              Save the hints
            </Button>
          </Cluster>
        </Stack>
      </form>
    </Disclosure>
  );
}

/** Hints (spec 039 G11): what the portal model is told about the portal. */
export function Hints({ s, ask }: { s: SettingsPage; ask: (a: Ask) => void }) {
  const h = s.hints;
  return (
    <Plate title="Hints">
      {h ? (
        <Stack>
          <Facts
            items={[
              ['Release marker', h.release_marker ? <Text mono>{h.release_marker}</Text> : <Text muted>none: releases are told apart by the names of the page&apos;s files</Text>],
              ['A/B cookies', list(h.ab_flags, 'none yet: confirming an A/B test in Review adds its cookie')],
              ['Business refusals', list(h.refusals.map((t) => `"${t}"`), 'none listed', false)],
            ]}
          />
          <HintsForm portal={s.portal} h={h} ask={ask} />
        </Stack>
      ) : (
        <Text small muted>{`The portal file for ${s.portal} could not be read, so no hints are shown.`}</Text>
      )}
    </Plate>
  );
}

/** A whole number from 0 to `max`, as the field holds it (a string). */
const count = (max: number) => z.string().regex(/^\d+$/, 'A whole number.').refine((v) => Number(v) <= max, `At most ${String(max)}.`);

const BudgetsSchema = z.object({ checks_per_scan: count(1000), probes_per_step: count(1000), probes_per_scan: count(10000) });
type BudgetValues = z.infer<typeof BudgetsSchema>;

/** Budgets (spec 040 T021): replays after a scan and form probes. */
export function Budgets({ s, ask }: { s: SettingsPage; ask: (a: Ask) => void }) {
  const h = s.hints;
  const form = useForm<BudgetValues>({
    defaultValues: { checks_per_scan: String(h?.checks_per_scan ?? 20), probes_per_step: String(h?.probes_per_step ?? 24), probes_per_scan: String(h?.probes_per_scan ?? 120) },
    resolver: zodResolver(BudgetsSchema),
  });
  const errors = form.formState.errors;
  const save = form.handleSubmit((b) =>
    ask({
      title: 'Save the budgets?',
      text: `Checks per scan ${b.checks_per_scan}, probes per form step ${b.probes_per_step}, probes per scan ${b.probes_per_scan}.`,
      confirm: 'Save the budgets',
      write: settingsWrites.budgets(s.portal, b),
    }),
  );
  if (!h) return null;
  const error = (k: keyof BudgetValues) => (errors[k]?.message ? { error: errors[k].message } : {});
  return (
    <Plate title="Budgets">
      <form onSubmit={(e) => void save(e)} aria-label="Budgets">
        <Stack>
          <Cluster>
            <Field label="Checks per scan" help="Replays on the headless driver after a scan (rules R1, R4, R5)." {...error('checks_per_scan')}>
              <Input type="number" min={0} max={1000} {...form.register('checks_per_scan')} />
            </Field>
            <Field label="Probes per form step" {...error('probes_per_step')}>
              <Input type="number" min={0} max={1000} {...form.register('probes_per_step')} />
            </Field>
            <Field label="Probes per scan" help="0 turns form probing off." {...error('probes_per_scan')}>
              <Input type="number" min={0} max={10000} {...form.register('probes_per_scan')} />
            </Field>
          </Cluster>
          <Cluster>
            <Button size="md" type="submit">
              Save the budgets
            </Button>
          </Cluster>
        </Stack>
      </form>
    </Plate>
  );
}

/** Screen identity (owner answers 5 and 14): when two recorded pages are one screen. */
export function ScreenIdentity({ s, ask }: { s: SettingsPage; ask: (a: Ask) => void }) {
  const i = s.identity;
  const accept = (what: 'tau' | 'classifier', label: string) =>
    ask({
      title: `${label}?`,
      text: 'It is in force from the next rebuild of the portal model, signed with your name.',
      confirm: label,
      write: settingsWrites.accept(s.portal, what),
    });
  return (
    <Plate title="Screen identity" actions={i.profile ? <Text small muted>{`fingerprint profile ${i.profile}`}</Text> : undefined}>
      <Stack>
        <Text small muted>
          Two recorded pages are one screen when they are similar enough. The threshold τ says how similar; labelled pairs (same screen or not) calibrate it, and a classifier trained on them can replace it when it tells pairs apart better.
        </Text>
        <Facts
          items={[
            ['Threshold τ', i.tau ?? 'the built-in default; none accepted yet'],
            ['Pair labels', `${String(i.same_labels)} same screen · ${String(i.distinct_labels)} different screens`],
            ['Classifier', i.classifier ?? 'none trained yet'],
          ]}
        />
        <Cluster>
          <Button size="sm" disabled={!s.reviewer} onClick={() => accept('tau', 'Accept the calibrated τ')}>
            Accept the calibrated τ
          </Button>
          <Button size="sm" disabled={!s.reviewer || !i.can_accept_classifier} onClick={() => accept('classifier', 'Accept the classifier')}>
            Accept the classifier
          </Button>
          {!s.reviewer && <Text small muted>Set MUDPUPPY_REVIEWER to your name to accept.</Text>}
        </Cluster>
      </Stack>
    </Plate>
  );
}
