import type { Frame, Page, Request } from 'playwright';
import type { NavigationHop } from '@pathfinder/core';

/** A request the gate aborted shows this error text (`route.abort('blockedbyclient')`). */
const BLOCKED = 'net::ERR_BLOCKED_BY_CLIENT';

/** Same URL apart from the fragment: what a reload or a refresh target is compared by. */
function sameDocumentUrl(a: string, b: string): boolean {
  return a.split('#')[0] === b.split('#')[0];
}

/**
 * Every URL the main frame passes through during one step, in order (spec 019 R4, R-38): the step's
 * own document load, each HTTP 3xx hop with its status, meta-refresh and script redirects, reloads,
 * history-API and hash changes (`same_document`), and navigations the gate refused (`blocked`).
 * Built on Playwright's own events: no DevTools session, no request of its own.
 *
 * `begin(startUrl)` opens a step, `drain()` hands its hops over. A meta refresh is announced by the
 * client-redirect probe (`expectRefresh`), so the document load that follows it is told apart from a
 * script redirect.
 */
export class NavigationRecorder {
  private hops: NavigationHop[] = [];
  private pending = new Set<Promise<void>>();
  /** A document request has started since the last `framenavigated`. */
  private documentLoading = false;
  /** The step's own document load has happened (the next ones are redirects). */
  private ownLoadSeen = false;
  private refreshTarget: string | null = null;
  private documentUrl: string;
  private readonly listeners: [string, (...a: never[]) => void][] = [];
  /** Resolves once the meta-refresh probe is installed (new documents carry it from then on). */
  readonly ready: Promise<void>;

  constructor(private readonly page: Page) {
    this.documentUrl = page.url();
    this.ready = this.installRefreshProbe();
    this.on('request', (req: Request) => this.onRequest(req));
    this.on('requestfailed', (req: Request) => this.onFailed(req));
    this.on('framenavigated', (frame: Frame) => this.onFrameNavigated(frame));
  }

  private on(event: string, fn: (...a: never[]) => void): void {
    (this.page as unknown as { on(e: string, f: unknown): void }).on(event, fn);
    this.listeners.push([event, fn]);
  }

  private isMainDocument(req: Request): boolean {
    return req.isNavigationRequest() && req.frame() === this.page.mainFrame();
  }

  /** Open a step that starts on `startUrl` (the `navigate` target, or the page before an action). */
  begin(startUrl: string): void {
    this.hops = [{ url: startUrl, kind: 'start' }];
    this.ownLoadSeen = false;
  }

  /** The current document announces a meta refresh to `target` (absolute URL). */
  expectRefresh(target: string): void {
    this.refreshTarget = target;
  }

  /**
   * Each top document reports its meta refresh target as soon as it is parsed, before a refresh with
   * delay 0 can fire, so the load that follows is told apart from a script redirect. Best effort, as
   * the network recorder's submit probe: a binding already installed leaves this one out.
   */
  private async installRefreshProbe(): Promise<void> {
    try {
      await this.page.exposeFunction('__pfMetaRefresh', (target: string) => {
        this.expectRefresh(target);
      });
      await this.page.addInitScript(
        `document.addEventListener('DOMContentLoaded', () => { try {
          if (window.top !== window) return;
          const m = document.querySelector('meta[http-equiv="refresh" i]');
          const c = m && m.getAttribute('content'); if (!c) return;
          const u = /url\\s*=\\s*['"]?([^'"]+)/i.exec(c);
          window.__pfMetaRefresh(new URL(u ? u[1].trim() : location.href, location.href).href);
        } catch (e) {} });`,
      );
    } catch {
      /* binding already installed, or the page is closed: refreshes count as script redirects */
    }
  }

  private onRequest(req: Request): void {
    if (!this.isMainDocument(req)) return;
    this.documentLoading = true;
    const from = req.redirectedFrom();
    if (from) {
      const hop: NavigationHop = { url: req.url(), kind: 'http' };
      this.hops.push(hop);
      // The 3xx status belongs to the response that redirected here; it arrives asynchronously.
      this.track(
        from.response().then(
          (r) => {
            if (r) hop.status = r.status();
          },
          () => undefined,
        ),
      );
      return;
    }
    this.hops.push({ url: req.url(), kind: this.kindOf(req.url()) });
  }

  private kindOf(url: string): NavigationHop['kind'] {
    const reload = sameDocumentUrl(url, this.documentUrl);
    if (!this.ownLoadSeen) {
      this.ownLoadSeen = true;
      // Loading the page the browser is already on is a reload, unless the step asked for that URL.
      return reload && url !== this.hops[0]?.url ? 'reload' : 'navigate';
    }
    if (this.refreshTarget !== null && sameDocumentUrl(url, this.refreshTarget)) {
      this.refreshTarget = null;
      return 'meta_refresh';
    }
    return reload ? 'reload' : 'script';
  }

  private onFailed(req: Request): void {
    if (!this.isMainDocument(req)) return;
    // Any failed document load (aborted by a newer one, a network error) is no longer in flight.
    this.documentLoading = false;
    if (req.failure()?.errorText !== BLOCKED) return;
    // The hop was recorded when the request started; the gate refused it (scope or robots).
    for (let i = this.hops.length - 1; i >= 0; i--) {
      const hop = this.hops[i]!;
      if (hop.url !== req.url() || hop.kind === 'start') continue;
      this.hops[i] = {
        url: hop.url,
        kind: 'blocked',
        reason: 'refused by the request gate (scope or robots.txt)',
      };
      break;
    }
  }

  private onFrameNavigated(frame: Frame): void {
    if (frame !== this.page.mainFrame()) return;
    const url = frame.url();
    if (url === 'about:blank') return;
    if (!this.documentLoading && url !== this.documentUrl)
      this.hops.push({ url, kind: 'same_document' });
    // A request never carries the fragment; the committed document does (`/app#/polisy/7`).
    const last = this.hops.at(-1);
    if (this.documentLoading && last && last.kind !== 'start' && sameDocumentUrl(last.url, url))
      last.url = url;
    if (this.documentLoading) this.refreshTarget = null; // a new document announces its own refresh
    this.documentLoading = false;
    this.documentUrl = url;
  }

  /** A main-frame document load has started and not committed yet (a redirect in flight). */
  navigating(): boolean {
    return this.documentLoading;
  }

  private track(p: Promise<void>): void {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  /**
   * The step's hops, from its start to the page the browser is on now, without repeats of the start
   * URL by the step's own load of that same URL (a `navigate` to the address it was asked for).
   */
  async drain(): Promise<NavigationHop[]> {
    await Promise.allSettled([...this.pending]);
    const [start, ...rest] = this.hops;
    const out =
      start && rest[0]?.kind === 'navigate' && rest[0].url === start.url
        ? [start, ...rest.slice(1)]
        : [...this.hops];
    this.hops = [];
    return out;
  }

  dispose(): void {
    for (const [e, fn] of this.listeners)
      (this.page as unknown as { off(e: string, f: unknown): void }).off(e, fn);
  }
}
