// The glossary and the BA wiki (`web/api_glossary.py`), typed as the pydantic models declare them.
// Texts come as HTML the dashboard rendered from markdown without raw HTML (shown with `Prose`).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getJson } from './api';

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

export const useGlossary = (q: string) =>
  useQuery({ queryKey: ['glossary', q], queryFn: () => getJson<GlossaryPage>(`/api/glossary?q=${encodeURIComponent(q)}`), placeholderData: keepPreviousData });

export const useGlossaryArticle = (slug: string) =>
  useQuery({ queryKey: ['glossary', 'pages', slug], queryFn: () => getJson<Article>(`/api/glossary/pages/${encodeURIComponent(slug)}`) });

export const useWiki = () => useQuery({ queryKey: ['glossary', 'wiki'], queryFn: () => getJson<WikiRow[]>('/api/glossary/wiki') });

export const useWikiPage = (slug: string) =>
  useQuery({ queryKey: ['glossary', 'wiki', slug], queryFn: () => getJson<WikiPage>(`/api/glossary/wiki/${encodeURIComponent(slug)}`) });
