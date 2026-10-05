import { useEffect, useState } from "react";

const cache = new Map<string, Promise<Record<string, string>>>();

function load(domain: string): Promise<Record<string, string>> {
  let p = cache.get(domain);
  if (!p) {
    p = fetch(`/cms/${domain}/pl.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    cache.set(domain, p);
  }
  return p;
}

/**
 * CMS texts fetched at runtime (LO-07). Until the file arrives `t(key)` returns the key itself,
 * exactly as legacy CMS-driven portals flash `login.title` before the text.
 */
export function useCms(domain: string): (key: string) => string {
  const [texts, setTexts] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    load(domain).then((t) => live && setTexts(t));
    return () => {
      live = false;
    };
  }, [domain]);
  return (key) => texts?.[key] ?? key;
}
