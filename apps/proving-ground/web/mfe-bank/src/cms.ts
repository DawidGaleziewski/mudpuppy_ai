import { useEffect, useState } from "react";

type Texts = Record<string, string>;

let texts: Texts | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(): void {
  if (texts || pending) return;
  pending = fetch("/cms/bank/pl.json")
    .then((r) => r.json() as Promise<Texts>)
    .then((json) => {
      texts = json;
      listeners.forEach((fn) => fn());
    })
    .catch(() => {
      pending = null;
    });
}

/** Returns t(key): the text once the CMS file has loaded, the KEY itself before (LO-07). */
export function useCms(): (key: string) => string {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    load();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return (key) => texts?.[key] ?? key;
}
