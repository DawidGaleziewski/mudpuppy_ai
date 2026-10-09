import type { Page, Request, Response } from 'playwright';
import { inferRouteTemplates } from '@pathfinder/fingerprint';
import { maskText } from '@pathfinder/core';
import { shapeOfBody, shapeOfFormBody, type Shape } from './shape.js';

/** `res_schema` of a form-submit call: no body is read; the redirect hops (URLs as templates) follow it. */
export interface DocumentResSchema {
  kind: 'document';
  redirects?: { status: number; url_template: string }[];
}

export interface ObservedCall {
  method: string;
  url_template: string;
  status: number;
  req_schema: Shape;
  res_schema: Shape | DocumentResSchema;
}

export interface Observation {
  calls: ObservedCall[];
  console_errors: string[];
}

const MAX_BODY = 1_000_000;
/**
 * Playwright can leave `response.text()` pending forever when the page navigates away mid-read
 * (seen with a polling page); without a bound, `drain()` would hang the tool call.
 */
const BODY_TIMEOUT_MS = 2000;

class BodyTimeout extends Error {}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BodyTimeout()), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Path-only template (same rules as page routes, FR-012); PII in a path segment is masked. */
export function apiUrlTemplate(url: string): string {
  return maskText(inferRouteTemplates([url]).templateFor(url));
}

/**
 * Records ONLY calls the page itself makes (xhr/fetch), reduced to shape, plus console errors and
 * failed requests. It never issues a request of its own (FR-025).
 */
export class NetworkRecorder {
  private calls: ObservedCall[] = [];
  private errors: string[] = [];
  private pending = new Set<Promise<void>>();
  /** Resolves once the form-submit probe is installed (new documents carry it from then on). */
  readonly ready: Promise<void>;
  private submitted = new Map<string, Record<string, Shape>>();
  private readonly listeners: [string, (...a: never[]) => void][] = [];

  constructor(
    private readonly page: Page,
    private readonly opts: { bodyTimeoutMs?: number } = {},
  ) {
    this.ready = this.installSubmitProbe();
    this.on('response', (res: Response) => this.track(this.onResponse(res)));
    this.on('requestfailed', (req: Request) => {
      if (this.isApi(req))
        this.errors.push(
          maskText(
            `${req.method()} ${apiUrlTemplate(req.url())} failed: ${req.failure()?.errorText ?? 'unknown'}`,
          ),
        );
    });
    this.on('console', (msg: { type(): string; text(): string }) => {
      if (msg.type() === 'error') this.errors.push(maskText(msg.text()).slice(0, 500));
    });
    this.on('pageerror', (err: Error) => this.errors.push(maskText(err.message).slice(0, 500)));
  }

  private on(event: string, fn: (...a: never[]) => void): void {
    (this.page as unknown as { on(e: string, f: unknown): void }).on(event, fn);
    this.listeners.push([event, fn]);
  }

  private isApi(req: Request): boolean {
    const t = req.resourceType();
    return t === 'xhr' || t === 'fetch';
  }

  private track(p: Promise<void>): void {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  private async onResponse(res: Response): Promise<void> {
    const req = res.request();
    if (req.resourceType() === 'document') return this.onDocumentResponse(res);
    if (!this.isApi(req)) return;
    let resBody: string | null = null;
    try {
      const ct = res.headers()['content-type'] ?? '';
      if (/json|text|xml/i.test(ct)) {
        const text = await withTimeout(res.text(), this.opts.bodyTimeoutMs ?? BODY_TIMEOUT_MS);
        resBody = text.length <= MAX_BODY ? text : null;
      }
    } catch {
      /* body unavailable (redirect, aborted, never delivered): shape unknown */
    }
    this.calls.push({
      method: req.method().toUpperCase(),
      url_template: apiUrlTemplate(req.url()),
      status: res.status(),
      req_schema: shapeOfBody(req.postData(), req.headers()['content-type']),
      res_schema: shapeOfBody(resBody, res.headers()['content-type']),
    });
  }

  /**
   * Chromium hands Playwright no `postData` for a multipart body that carries a file, so the field
   * names (and `<file>`/`string` tags, never values) come from the submitting form in the page.
   * A capture-phase `submit` listener (every document, via init script) reports the form's field
   * names to the recorder BEFORE the navigation starts; the page is gone by the time the request
   * event fires. Best effort: a recorder created after the page loaded misses that first document.
   */
  private async installSubmitProbe(): Promise<void> {
    try {
      await this.page.exposeFunction(
        '__pfFormSubmit',
        (path: string, fields: Record<string, Shape>) => {
          this.submitted.set(path, fields);
        },
      );
      await this.page.addInitScript(
        `document.addEventListener('submit', (ev) => { try {
          const f = ev.target; if (!f || !/multipart/i.test(f.enctype)) return;
          const out = {};
          for (const e of f.elements) if (e.name) out[e.name] = e.type === 'file' ? '<file>' : 'string';
          window.__pfFormSubmit(new URL(f.action, location.href).pathname, out);
        } catch (e) {} }, true);`,
      );
    } catch {
      /* binding already installed by another recorder, or the page is closed: no upload fields */
    }
  }

  /**
   * A classic form submit (document request that is not GET/HEAD, FR-009) is one call with the redirect
   * chain after it. The POST's own 3xx response and the redirected GET are not calls of their own: the
   * call is recorded once, when the final response arrives. Plain GET navigations stay out (AS7.2).
   * A document response body is never read.
   */
  private async onDocumentResponse(res: Response): Promise<void> {
    let root = res.request();
    while (root.redirectedFrom()) root = root.redirectedFrom()!;
    const method = root.method().toUpperCase();
    if (method === 'GET' || method === 'HEAD') return;
    if (res.status() >= 300 && res.status() < 400 && res.headers()['location']) return;
    const redirects: { status: number; url_template: string }[] = [];
    for (let r: Request | null = root, next = r.redirectedTo(); next; next = r.redirectedTo()) {
      redirects.push({
        status: (await r.response())?.status() ?? 0,
        url_template: apiUrlTemplate(next.url()),
      });
      r = next;
    }
    const fields =
      root.postData() === null && /multipart\/form-data/i.test(root.headers()['content-type'] ?? '')
        ? this.submitted.get(new URL(root.url()).pathname)
        : undefined;
    this.calls.push({
      method,
      url_template: apiUrlTemplate(root.url()),
      status: res.status(),
      req_schema: fields
        ? { ...fields, content_type: 'multipart/form-data' }
        : shapeOfFormBody(root.postData(), root.headers()['content-type']),
      res_schema: redirects.length > 0 ? { kind: 'document', redirects } : { kind: 'document' },
    });
  }

  /** Wait for in-flight body reads, then hand over and clear what was seen since the last drain. */
  async drain(): Promise<Observation> {
    await Promise.allSettled([...this.pending]);
    const out = { calls: this.calls, console_errors: this.errors };
    this.calls = [];
    this.errors = [];
    return out;
  }

  dispose(): void {
    for (const [e, fn] of this.listeners)
      (this.page as unknown as { off(e: string, f: unknown): void }).off(e, fn);
  }
}
