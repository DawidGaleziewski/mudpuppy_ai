import { useParams, useSearchParams } from 'react-router';
import { Callout, Cluster, Code, Count, Facts, Field, Input, PageHead, Plate, Prose, Row, Rows, Stack, SubHead, Table, Text } from '../design-system';
import { GLOSSARY, useGlossary, useGlossaryArticle, useWiki, useWikiPage, type GlossaryPage, type GlossaryRef, type GlossaryTerm } from '../app/api-glossary';
import { QueryState } from '../app/QueryState';
import { useGo } from '../app/RouterAnchor';
import { Shell } from '../app/Shell';

const termHref = (id: string) => `${GLOSSARY}#${id}`;
const refs = (list: GlossaryRef[]) =>
  list.map((r, i) => (
    <Text key={r.id} small href={termHref(r.id)}>{`${r.title}${i < list.length - 1 ? ' ·' : ''}`}</Text>
  ));

function Term({ t }: { t: GlossaryTerm }) {
  const go = useGo();
  const facts = [
    ...(t.example ? [['Example', t.example] as const] : []),
    ...(t.appears_in.length ? [['Seen in', t.appears_in.join(' · ')] as const] : []),
    ...(t.related.length ? [['Related', <Cluster key="r">{refs(t.related)}</Cluster>] as const] : []),
    ...(t.page || t.wiki
      ? [['Read more', <Cluster key="m">{t.page && <Text small href={`${GLOSSARY}/pages/${t.page.id}`}>{t.page.title}</Text>}{t.wiki && <Text small href={`${GLOSSARY}/wiki/${t.wiki.id}`}>{`BA wiki: ${t.wiki.title}`}</Text>}</Cluster>] as const]
      : []),
    ...(t.retired ? [[`Retired ${t.retired.since}`, `${t.retired.note}${t.retired.replaced_by ? ` Replaced by ${t.retired.replaced_by.title}.` : ''}`] as const] : []),
  ];
  return (
    <Plate anchor={t.id} title={<Text asIs>{`${t.term}${t.retired ? ' (retired)' : ''}`}</Text>} actions={<Text small muted>{`${t.category === 'mudpuppy' ? 'MudPuppy term' : 'BA term'} · #${t.id}`}</Text>}>
      <Stack>
        <Text block strong>{t.short}</Text>
        <Prose html={t.html} onLink={go} />
        {facts.length > 0 && <Facts items={facts} />}
        <Text small muted>{`Last changed in ${t.changed_in}, ${t.changed_on}.`}</Text>
      </Stack>
    </Plate>
  );
}

function Terms({ g }: { g: GlossaryPage }) {
  if (g.problems.length)
    return (
      <Callout tone="failure" title="The glossary could not be loaded">
        <Stack>
          <Text block>Labels show without explanations until docs/glossary/glossary.yaml is fixed. Run uv run mudpuppy-glossary in apps/dashboard for the full list.</Text>
          <Code>{g.problems.join('\n')}</Code>
        </Stack>
      </Callout>
    );
  if (!g.groups.length) return <Callout title={`No term matches “${g.q}”`}>Try a shorter word, or clear the filter to see all terms.</Callout>;
  return (
    <Stack>
      {g.groups.map((grp) => (
        <Stack key={`${grp.category}-${grp.group}`}>
          <SubHead section>{`${grp.group} · ${grp.category === 'mudpuppy' ? 'MudPuppy terms' : 'Business-analysis terms'}`}</SubHead>
          {grp.terms.map((t) => (
            <Term key={t.id} t={t} />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

/** The glossary (spec 006): MudPuppy and business-analysis terms by group, filtered as you type. */
export function Glossary() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const query = useGlossary(q);
  return (
    <Shell current="glossary">
      <PageHead title="Glossary" meta={<>MudPuppy and business-analysis terms · <Text href={`${GLOSSARY}/wiki`}>BA wiki</Text></>} />
      <Field label="Filter terms">
        <Input type="search" value={q} placeholder="e.g. frontier" autoComplete="off" onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} />
      </Field>
      <QueryState query={query} what="the glossary">
        {(g) => (
          <Stack>
            {g.scope && <Text block muted>{g.scope}</Text>}
            {g.groups.length > 0 && (
              <Plate label="Glossary groups" flush>
                <Rows label="Glossary groups">
                  {g.groups.map((grp) => (
                    <Row key={`${grp.category}-${grp.group}`} aside={<Count muted>{grp.terms.length}</Count>}>
                      {grp.group}
                    </Row>
                  ))}
                </Rows>
              </Plate>
            )}
            <Terms g={g} />
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}

/** A longer glossary page (spec 006): one concept explained. */
export function GlossaryArticle() {
  const { slug = '' } = useParams();
  const q = useGlossaryArticle(slug);
  const go = useGo();
  return (
    <Shell current="glossary">
      <QueryState query={q} what="the glossary page">
        {(a) => (
          <Stack>
            <PageHead crumbs={[{ label: 'Glossary', href: GLOSSARY }, { label: 'page' }]} title={a.title} />
            <Plate>
              <Prose html={a.html} onLink={go} />
            </Plate>
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}

/** The BA wiki (spec 006): business-analysis concepts behind the documentation, with cited sources. */
export function Wiki() {
  const q = useWiki();
  return (
    <Shell current="glossary">
      <PageHead crumbs={[{ label: 'Glossary', href: GLOSSARY }, { label: 'BA wiki' }]} title="BA wiki" meta="Business-analysis concepts behind the documentation · cited sources" />
      <Text block muted>
        Short explanations in our own words, how MudPuppy applies each concept, and citations to recognised sources (IREB CPRE glossary, IIBA BABOK Guide, ISO/IEC/IEEE 29148). Pages are local, so they stay readable when a source link breaks.
      </Text>
      <QueryState query={q} what="the BA wiki">
        {(rows) => (
          <Plate flush>
            <Table
              caption="BA wiki pages"
              flush
              rows={rows}
              rowKey={(r) => r.slug}
              columns={[
                { header: 'Page', rowHeader: true, cell: (r) => <Text href={`${GLOSSARY}/wiki/${r.slug}`}>{r.title}</Text> },
                { header: 'Glossary terms', cell: (r) => <Cluster>{refs(r.terms)}</Cluster> },
                { header: 'Sources', numeric: true, cell: (r) => r.sources },
              ]}
            />
          </Plate>
        )}
      </QueryState>
    </Shell>
  );
}

/** One BA wiki page with its sources and the glossary terms it explains. */
export function WikiArticle() {
  const { slug = '' } = useParams();
  const q = useWikiPage(slug);
  const go = useGo();
  return (
    <Shell current="glossary">
      <QueryState query={q} what="the wiki page">
        {(p) => (
          <Stack>
            <PageHead crumbs={[{ label: 'Glossary', href: GLOSSARY }, { label: 'BA wiki', href: `${GLOSSARY}/wiki` }, { label: 'page' }]} title={p.title} meta={`Last changed in ${p.changed_in}, ${p.changed_on}`} />
            <Plate>
              <Stack>
                <Prose html={p.html} onLink={go} />
                <SubHead section>Sources</SubHead>
                {p.citations.map((c) => (
                  <Stack key={c.url}>
                    <Text block small>
                      {`${c.source}, ${c.edition}${c.section ? `, ${c.section}` : ''}. `}
                      <Text small href={c.url}>{c.url}</Text>
                      {` · checked ${c.checked_on}`}
                    </Text>
                    {c.quote && <Text block small muted>{`“${c.quote}”`}</Text>}
                  </Stack>
                ))}
                <Cluster>
                  <Text small muted>Glossary</Text>
                  {refs(p.terms)}
                </Cluster>
              </Stack>
            </Plate>
          </Stack>
        )}
      </QueryState>
    </Shell>
  );
}
