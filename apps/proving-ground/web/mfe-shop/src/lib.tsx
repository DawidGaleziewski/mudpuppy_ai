import { createContext, useContext, useEffect, useState } from "react";
import type { MountContext } from "./context";

export const Ctx = createContext<MountContext>(null as unknown as MountContext);
export const useCtx = () => useContext(Ctx);

// CMS texts (LO-07): until the file has loaded, every label is its own key.
let texts: Record<string, string> | null = null;
let pending: Promise<void> | null = null;

export function useCms(): (key: string) => string {
  const ctx = useCtx();
  const [, bump] = useState(0);
  useEffect(() => {
    if (texts) return;
    pending ??= ctx
      .api("/cms/shop/pl.json")
      .then((r) => r.json())
      .then((j: Record<string, string>) => {
        texts = j;
      })
      .catch(() => {
        pending = null;
      });
    let alive = true;
    void pending.then(() => alive && bump((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [ctx]);
  // A key missing from the file stays visible as the raw key (LO-08).
  return (key) => texts?.[key] ?? key;
}

export function money(grosze: number): string {
  const [zl, gr] = (grosze / 100).toFixed(2).split(".");
  return `${(zl ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${gr} zł`;
}

export interface Product {
  id: number;
  slug: string;
  name: string;
  category: number;
  price: number;
  description: string;
  hue: number;
}
export interface Category {
  id: number;
  slug: string;
  name: string;
}
export interface CartItem {
  slug: string;
  name: string;
  price: number;
  qty: number;
  line_total: number;
  hue: number;
}
export interface Cart {
  items: CartItem[];
  count: number;
  total: number;
  free_delivery: boolean;
  delivery_cost: number;
  grand_total: number;
}
export interface GqlError {
  message: string;
  extensions?: { code?: string; field?: string };
}

export async function gql<T>(
  ctx: MountContext,
  operationName: string,
  variables: Record<string, unknown> = {},
): Promise<{ data: T | null; errors: GqlError[] }> {
  const r = await ctx.api("/api/shop/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationName, variables }),
  });
  return (await r.json()) as { data: T | null; errors: GqlError[] };
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/** A real link that navigates client-side. */
export function Link(props: { to: string; className?: string; children: React.ReactNode }) {
  const ctx = useCtx();
  return (
    <a
      href={props.to}
      className={props.className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        ctx.navigate(props.to);
      }}
    >
      {props.children}
    </a>
  );
}

/** CSS-drawn product picture, no external assets. */
export function Art({ hue, category, big }: { hue: number; category: number; big?: boolean }) {
  const a = `hsl(${hue} 55% 78%)`;
  const b = `hsl(${(hue + 40) % 360} 60% 52%)`;
  const shapes = [
    <path key="1" d="M30 20h18v40c14 4 24 10 24 20H30z M62 80h22v8H62z" />,
    <path key="2" d="M26 40q24-30 48 0l-6 40H32z M44 24h12v8H44z" />,
    <path key="3" d="M28 50h44l-6 34H34z M34 50q16-26 32 0" />,
    <path key="4" d="M30 84l14-50h12l14 50z M42 26h16v10H42z" />,
  ];
  return (
    <svg viewBox="0 0 100 100" width="100%" height={big ? 360 : 180} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`g${hue}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#g${hue})`} />
      <g fill={b}>{shapes[(category - 1) % 4]}</g>
    </svg>
  );
}

export function Captcha({ onToken }: { onToken: (t: string) => void }) {
  const ctx = useCtx();
  useEffect(() => {
    const h = (e: MessageEvent) => {
      const d = e.data as { type?: string; token?: string } | null;
      if (e.origin === ctx.widgetOrigin && d?.type === "pg-captcha" && d.token) onToken(d.token);
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [ctx, onToken]);
  return (
    <div className="g-recaptcha" data-sitekey="pg-test-key">
      <iframe
        title="reCAPTCHA"
        src={`${ctx.widgetOrigin}/widget/recaptcha/api2/anchor?k=pg-test-key`}
        width="304"
        height="78"
      />
    </div>
  );
}
