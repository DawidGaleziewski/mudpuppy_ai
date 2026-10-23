import { useState } from 'react';
import { useParams } from 'react-router';
import { Button, Callout, Cluster, Code, Disclosure, Field, Grid, Input, PageHead, Plate, Select, Stack, Table, Text } from '../design-system';
import { PORTAL_ENVS, settingsKey, settingsWrites, useSettings, type SettingsPage } from '../app/api-settings';
import { useConfirmedWrite, type Ask } from '../app/ConfirmedWrite';
import { QueryState } from '../app/QueryState';
import { Shell } from '../app/Shell';
import { ShownStatus } from '../app/ShownStatus';
import { Budgets, CrawlRules, Hints, Personas, ScreenIdentity } from './SettingsModel';

/** Add an environment or change one: its address and how far the crawler may go there. */
function EnvironmentForm({ s, ask }: { s: SettingsPage; ask: (a: Ask) => void }) {
  const first = s.missing[0] ?? s.environments[0]?.name ?? 'production';
  const [name, setName] = useState(first);
  const current = s.environments.find((e) => e.name === name);
  const [url, setUrl] = useState(current?.base_url ?? '');
  const [limit, setLimit] = useState(current?.limit ?? 'external-side-effect');
  const pick = (next: string) => {
    const e = s.environments.find((x) => x.name === next);
    setName(next);
    setUrl(e?.base_url ?? '');
    setLimit(e?.limit ?? 'external-side-effect');
  };
  return (
    <Cluster>
      <Field label="Environment">
        <Select value={name} onChange={(e) => pick(e.target.value)}>
          {PORTAL_ENVS.map((e) => (
            <option key={e} value={e}>
              {s.missing.includes(e) ? e : `${e} (change)`}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Address">
        <Input type="text" inputMode="url" spellCheck={false} placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="How far the crawler may go">
        <Select value={limit} onChange={(e) => setLimit(e.target.value)}>
          {s.limits.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        variant="primary"
        disabled={!s.service_up || !url.trim()}
        onClick={() =>
          ask({
            title: `Save ${name}?`,
            text: `${url.trim()} · ${s.limits.find((l) => l.value === limit)?.label ?? limit}. The chat service writes it into the portal file.`,
            confirm: 'Save environment',
            write: settingsWrites.saveEnvironment(s.portal, name, url.trim(), limit),
          })
        }
      >
        Save environment
      </Button>
    </Cluster>
  );
}

function Environments({ s, ask }: { s: SettingsPage; ask: (a: Ask) => void }) {
  const rows = [...s.environments.map((e) => ({ ...e, configured: true })), ...s.missing.map((name) => ({ name, base_url: '', limit: '', limit_word: '', robots: null, can_revoke: false, configured: false }))];
  return (
    <Plate title="Environments" actions={<Text small muted>A scan names one; the assistant asks when there are several.</Text>}>
      <Stack>
        <Table
          caption={`Environments of ${s.portal}`}
          columns={[
            { header: 'Environment', rowHeader: true, cell: (e) => e.name },
            { header: 'Address', cell: (e) => (e.configured ? <Text mono>{e.base_url}</Text> : <ShownStatus status={s.not_configured} />) },
            { header: 'How far the crawler may go', cell: (e) => e.limit_word },
            { header: 'robots.txt', cell: (e) => (e.configured ? (e.robots ?? <Text muted>unknown</Text>) : '') },
            {
              header: 'Revoke',
              cell: (e) => {
                if (!e.configured) return null;
                if (!e.can_revoke) return <Text small muted>The only one</Text>;
                return (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => ask({ title: `Revoke ${e.name}?`, text: 'Runs already recorded are kept.', confirm: `Revoke ${e.name}`, write: settingsWrites.revokeEnvironment(s.portal, e.name) })}
                  >
                    {`Revoke ${e.name}`}
                  </Button>
                );
              },
            },
          ]}
          rows={rows}
          rowKey={(e) => e.name}
          dense
        />
        <EnvironmentForm s={s} ask={ask} />
      </Stack>
    </Plate>
  );
}

function Credentials({ s }: { s: SettingsPage }) {
  return (
    <Disclosure summary={`Credentials · ${String(s.credentials.length)} stored · values are never shown`}>
      {s.credentials.length ? (
        <Table
          caption={`Credentials stored for ${s.portal}`}
          columns={[
            { header: 'Name', rowHeader: true, cell: (c) => <Text mono>{c.value}</Text> },
            { header: 'Environment · saved', cell: (c) => <Text mono small>{c.label}</Text> },
          ]}
          rows={s.credentials}
          rowKey={(c) => `${c.value}|${c.label}`}
          dense
        />
      ) : (
        <Text small muted>{`Nothing stored for ${s.portal}. The assistant asks in chat when a scan reaches a login it can't pass.`}</Text>
      )}
    </Disclosure>
  );
}

function Store({ s }: { s: SettingsPage }) {
  return (
    <Plate title="Data store" actions={<Text small muted>{`${s.store.environment} · read-only`}</Text>}>
      <Stack>
        <Text route>{s.store.path}</Text>
        <Text small muted>{s.store.exists ? `${s.store.size_kb.toLocaleString('en')} KB` : 'No store file here yet. A scan creates it.'}</Text>
      </Stack>
    </Plate>
  );
}

function Body({ s, ask }: { s: SettingsPage; ask: (a: Ask) => void }) {
  return (
    <Stack>
      {!s.service_up && (
        <Callout tone="failure" title="Assistant not running">
          <Stack>
            <Text>It reads and saves portal settings. Start it in a terminal, then reload this page. Read-only parts keep working.</Text>
            <Code label="Command that starts the chat service">{s.start_hint ?? ''}</Code>
          </Stack>
        </Callout>
      )}
      {s.error && <Callout tone="failure" title="Not read">{s.error}</Callout>}
      <Environments s={s} ask={ask} />
      <Credentials s={s} />
      {s.workbench && (
        <Plate title="Assistant · Workbench">
          <Text>{s.workbench}</Text>
        </Plate>
      )}
      <Grid min="22rem">
        <Personas s={s} ask={ask} />
        <CrawlRules s={s} />
        <Hints s={s} ask={ask} />
        <Budgets s={s} ask={ask} />
        <ScreenIdentity s={s} ask={ask} />
        <Store s={s} />
      </Grid>
    </Stack>
  );
}

/** A portal's settings (screen 11): environments, credentials, personas, crawl rules, hints, screen identity, store. */
export function Settings() {
  const portal = useParams().portal ?? '';
  const q = useSettings(portal);
  const { ask, view } = useConfirmedWrite(settingsKey(portal));
  return (
    <Shell current="settings">
      <PageHead crumbs={[{ label: 'Portals', href: '/app/' }, { label: portal, href: `/app/portals/${encodeURIComponent(portal)}` }, { label: 'Settings' }]} title="Settings" meta={portal} />
      {view}
      <QueryState query={q} what="the settings">
        {(s) => <Body s={s} ask={ask} />}
      </QueryState>
    </Shell>
  );
}
