import { useState } from 'react';
import { Button, Cluster, Count, Disclosure, Facts, Field, Input, Plate, Row, Rows, Stack, Text, Textarea } from '../design-system';
import { settingsWrites, type SettingsHints, type SettingsPage } from '../app/api-settings';
import type { Ask } from '../app/ConfirmedWrite';

const list = (items: readonly string[], none: string, mono = true) =>
  items.length ? <Text mono={mono}>{items.join(', ')}</Text> : <Text muted>{none}</Text>;

/** The personas of this portal, as written: kind, credential references, attributes. */
export function Personas({ s }: { s: SettingsPage }) {
  return (
    <Plate title="Personas" actions={<Count muted>{s.personas.length}</Count>} flush={s.personas.length > 0}>
      {s.personas.length ? (
        <Rows label="Personas">
          {s.personas.map((p) => (
            <Row key={p.id} aside={<Text small muted>{p.kind}</Text>}>
              <Text mono>{p.id}</Text>
              {p.refs.length > 0 && <Text small muted>{`needs ${p.refs.join(', ')}`}</Text>}
              {p.attributes.length > 0 && <Text small>{p.attributes.map((a) => `${a.value} ${a.label}`).join('; ')}</Text>}
            </Row>
          ))}
        </Rows>
      ) : (
        <Text small muted>{`No persona files for ${s.portal}. Ask the assistant to build one.`}</Text>
      )}
    </Plate>
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

function HintsForm({ portal, h, ask }: { portal: string; h: SettingsHints; ask: (a: Ask) => void }) {
  const [header, setHeader] = useState(h.marker_header);
  const [meta, setMeta] = useState(h.marker_meta);
  const [flags, setFlags] = useState(h.ab_flags.join('\n'));
  const [refusals, setRefusals] = useState(h.refusals.join('\n'));
  return (
    <Disclosure summary="Change the hints">
      <Stack>
        <Cluster>
          <Field label="Release marker: response header">
            <Input maxLength={200} value={header} placeholder="x-app-version" onChange={(e) => setHeader(e.target.value)} />
          </Field>
          <Field label="or meta name">
            <Input maxLength={200} value={meta} placeholder="app-version" onChange={(e) => setMeta(e.target.value)} />
          </Field>
        </Cluster>
        <Text small muted>
          Where the page names its release. With one, a change is told apart by release at once; without, by comparing pages, which is slower.
        </Text>
        <Field label="A/B cookies, one per line" help='"cookie NAME" or "storage NAME". Scans read the A/B arm from these, so a variant per arm is not a finding.'>
          <Textarea rows={3} value={flags} placeholder={'cookie ab_calc\nstorage exp.hero'} onChange={(e) => setFlags(e.target.value)} />
        </Field>
        <Field label="Business refusals, one per line" help="A page showing one of these texts is a business refusal, not a technical error.">
          <Textarea rows={3} value={refusals} placeholder="Nie możemy Cię ubezpieczyć" onChange={(e) => setRefusals(e.target.value)} />
        </Field>
        <Cluster>
          <Button
            size="md"
            onClick={() =>
              ask({
                title: 'Save the hints?',
                text: 'The chat service writes them into the portal file; the file is put back when it would not load.',
                confirm: 'Save the hints',
                write: settingsWrites.hints(portal, { marker_header: header, marker_meta: meta, ab_flags: flags, refusals }),
              })
            }
          >
            Save the hints
          </Button>
        </Cluster>
      </Stack>
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

/** Budgets (spec 040 T021): replays after a scan and form probes. */
export function Budgets({ s, ask }: { s: SettingsPage; ask: (a: Ask) => void }) {
  const h = s.hints;
  const [checks, setChecks] = useState(String(h?.checks_per_scan ?? 20));
  const [step, setStep] = useState(String(h?.probes_per_step ?? 24));
  const [scan, setScan] = useState(String(h?.probes_per_scan ?? 120));
  if (!h) return null;
  return (
    <Plate title="Budgets">
      <Stack>
        <Cluster>
          <Field label="Checks per scan" help="Replays on the headless driver after a scan (rules R1, R4, R5).">
            <Input type="number" min={0} max={1000} value={checks} onChange={(e) => setChecks(e.target.value)} />
          </Field>
          <Field label="Probes per form step">
            <Input type="number" min={0} max={1000} value={step} onChange={(e) => setStep(e.target.value)} />
          </Field>
          <Field label="Probes per scan" help="0 turns form probing off.">
            <Input type="number" min={0} max={10000} value={scan} onChange={(e) => setScan(e.target.value)} />
          </Field>
        </Cluster>
        <Cluster>
          <Button
            size="md"
            onClick={() =>
              ask({
                title: 'Save the budgets?',
                text: `Checks per scan ${checks}, probes per form step ${step}, probes per scan ${scan}.`,
                confirm: 'Save the budgets',
                write: settingsWrites.budgets(s.portal, { checks_per_scan: checks, probes_per_step: step, probes_per_scan: scan }),
              })
            }
          >
            Save the budgets
          </Button>
        </Cluster>
      </Stack>
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
