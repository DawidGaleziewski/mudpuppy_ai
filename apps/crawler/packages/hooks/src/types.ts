// What a portal hook gets and may return (spec 023 FR-003, FR-004). A hook is trusted code the
// owner writes in `portals/<id>/hooks.ts`; it runs with full power (spec 021), and every run is
// traced. The browser parts are a narrow interface the MCP server fills from Playwright.

import type { HookPoint, PortalConfig } from '@pathfinder/config';
import { z } from 'zod';

export type { HookPoint } from '@pathfinder/config';

/** A cookie as Playwright takes it (`url` or `domain` + `path`). */
export interface HookCookie {
  name: string;
  value: string;
  url?: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/** The browser side a hook may touch: the run's browser context and its current page. */
export interface HookBrowser {
  getCookies(): Promise<HookCookie[]>;
  addCookies(cookies: HookCookie[]): Promise<void>;
  clearCookies(): Promise<void>;
  /** Playwright `context.route`: the handler gets Playwright's route and request. */
  route(pattern: string | RegExp, handler: (...args: never[]) => unknown): Promise<void>;
  /** Playwright `context.addInitScript`: a function, source text, or `{ path }`. */
  addInitScript(script: string | (() => void) | { path: string }): Promise<void>;
  /** Playwright `page.evaluate` on the current page; arguments are passed, never closed over. */
  evaluate<R, A extends unknown[]>(fn: (...args: A) => R, ...args: A): Promise<R>;
}

/** The action `onBeforeClickAction` is about to perform. */
export interface HookAction {
  role: string;
  name: string;
  /** The locators the crawler recorded for it, e.g. `{ kind: 'path', value: '…' }`. */
  locators: readonly { kind: string; value: string }[];
}

export interface HookContext {
  point: HookPoint;
  /** The page URL (the target for `onBeforePageLoad`; empty at run start and end). */
  url: string;
  persona: { id: string; attributes: Readonly<Record<string, unknown>> };
  environment: string;
  run: { id: string; mode: string };
  /** The portal's effective config, read-only. */
  config: Readonly<PortalConfig>;
  cookies: {
    get(): Promise<HookCookie[]>;
    add(cookies: HookCookie[]): Promise<void>;
    clear(): Promise<void>;
  };
  route: HookBrowser['route'];
  addInitScript: HookBrowser['addInitScript'];
  /** Run `fn` in the page with `args` (it cannot see the hook's variables). */
  inPage<R, A extends unknown[]>(fn: (...args: A) => R, ...args: A): Promise<R>;
  /** A line in the hook's trace span. */
  log(message: string): void;
  /** Only for `onBeforeClickAction`. */
  action?: HookAction;
}

const Void = z.union([z.undefined(), z.null()]);
const Skip = z.object({ skip: z.literal(true), reason: z.string().min(1) }).strict();

/** What each point may return; anything else is a hook failure (FR-004). */
export const HookResult = {
  onRunStart: Void,
  onBeforePageLoad: z.union([Void, z.object({ url: z.url() }).strict(), Skip]),
  onPageLoad: Void,
  onBeforeClickAction: z.union([Void, Skip, z.object({ waitFor: z.string().min(1) }).strict()]),
  onRunEnd: Void,
} as const satisfies Record<HookPoint, z.ZodType>;

export type HookReturn<P extends HookPoint> = z.infer<(typeof HookResult)[P]>;

/** The type a `hooks.ts` export has: `export const fix: Hook<'onPageLoad'> = async (ctx) => {…}`. */
export type Hook<P extends HookPoint = HookPoint> = (
  ctx: HookContext,
) => HookReturn<P> | void | Promise<HookReturn<P> | void>;
