import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Kbd } from './Choice.js';

export interface SearchBoxProps {
  /** What a search is now (the search page's `q`); typing starts from it. */
  value?: string;
  /** A search asked for: the app moves to its results. */
  onSearch: (q: string) => void;
  placeholder?: string;
}

/** The header's search (`.sy-search`): Ctrl K focuses it from anywhere, Enter searches. */
export function SearchBox({ value = '', onSearch, placeholder = 'Search parts: screens, processes, records' }: SearchBoxProps) {
  const [q, setQ] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(q.trim());
  };
  return (
    <form className="sy-search" role="search" onSubmit={submit}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input ref={input} type="search" name="q" aria-label="Search" aria-keyshortcuts="Control+K" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      <Kbd>Ctrl K</Kbd>
    </form>
  );
}
