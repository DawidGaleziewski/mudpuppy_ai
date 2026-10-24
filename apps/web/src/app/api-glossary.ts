// The glossary and the BA wiki (`web/api_glossary.py`), typed as the pydantic models declare them.
// Texts come as HTML the dashboard rendered from markdown without raw HTML (shown with `Prose`).
import { api, read } from './state/api';

export interface GlossaryRef {
  id: string;
  title: string;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  category: 'mudpuppy' | 'ba';
  short: string;
  html: string;
  example: string | null;
  appears_in: string[];
  related: GlossaryRef[];
  page: GlossaryRef | null;
  wiki: GlossaryRef | null;
  retired: { since: string; note: string; replaced_by: GlossaryRef | null } | null;
  changed_in: string;
  changed_on: string;
}

export interface GlossaryPage {
  scope: string;
  q: string;
  groups: { category: string; group: string; terms: GlossaryTerm[] }[];
  problems: string[];
}

export interface Article {
  title: string;
  html: string;
}

export interface WikiRow {
  slug: string;
  title: string;
  terms: GlossaryRef[];
  sources: number;
}

export interface WikiPage {
  slug: string;
  title: string;
  html: string;
  terms: GlossaryRef[];
  citations: { source: string; edition: string; section: string | null; url: string; checked_on: string; quote: string | null }[];
  changed_in: string;
  changed_on: string;
}

export const GLOSSARY = '/app/glossary';

const glossaryApi = api.injectEndpoints({
  endpoints: (b) => ({
    glossary: read<GlossaryPage, string>(b, (q) => `/api/glossary?q=${encodeURIComponent(q)}`, (q) => ['glossary', q]),
    glossaryArticle: read<Article, string>(b, (slug) => `/api/glossary/pages/${encodeURIComponent(slug)}`, (slug) => ['glossary', 'pages', slug]),
    wiki: read<WikiRow[], void>(b, () => '/api/glossary/wiki', () => ['glossary', 'wiki']),
    wikiPage: read<WikiPage, string>(b, (slug) => `/api/glossary/wiki/${encodeURIComponent(slug)}`, (slug) => ['glossary', 'wiki', slug]),
  }),
});

export const useGlossary = (q: string) => glossaryApi.useGlossaryQuery(q);

export const useGlossaryArticle = (slug: string) => glossaryApi.useGlossaryArticleQuery(slug);

export const useWiki = () => glossaryApi.useWikiQuery();

export const useWikiPage = (slug: string) => glossaryApi.useWikiPageQuery(slug);
