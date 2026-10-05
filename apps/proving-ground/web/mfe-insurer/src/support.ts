import { createContext, useContext, useEffect, useState } from "react";
import type { MountContext } from "./context";

export const Ctx = createContext<MountContext | null>(null);

export function useMount(): MountContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("no mount context");
  return c;
}

// CMS texts arrive after a delay; until then every label shows its raw key (LO-07).
let cmsPromise: Promise<Record<string, string>> | null = null;

export function useCms(): (key: string) => string {
  const ctx = useMount();
  const [texts, setTexts] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    cmsPromise ??= ctx
      .api("/cms/insurer/pl.json")
      .then((r) => r.json() as Promise<Record<string, string>>)
      .catch(() => {
        cmsPromise = null;
        return {};
      });
    void cmsPromise.then((t) => alive && setTexts(t));
    return () => {
      alive = false;
    };
  }, [ctx]);
  return (key) => texts?.[key] ?? key;
}

export interface Policy {
  nr: string;
  typ: string;
  nazwa: string;
  suma: number;
  skladka: number;
  od: string;
  do: string;
}

export interface Addon {
  id: string;
  nazwa: string;
  cena: number;
  dostepny: boolean;
  powod?: string;
}

export interface WizardState {
  step: number;
  data: Record<string, unknown>;
}

export const zl = (n: number) =>
  `${n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

export const sum = (n: number) => `${n.toLocaleString("pl-PL")} zł`;

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export class Unauthorized extends Error {}

/** JSON helper: throws Unauthorized on 401 so screens can show the login link. */
export async function getJson<T>(ctx: MountContext, path: string): Promise<T> {
  const r = await ctx.api(path);
  if (r.status === 401) throw new Unauthorized();
  return (await r.json()) as T;
}

export function post(ctx: MountContext, path: string, body?: unknown): Promise<Response> {
  return ctx.api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function loginHref(): string {
  return `/logowanie?marka=insurer&next=${encodeURIComponent("/ubezpieczenia" + window.location.hash)}`;
}
