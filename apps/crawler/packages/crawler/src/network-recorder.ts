import type { Page, Request, Response } from 'playwright';
import { inferRouteTemplates } from '@pathfinder/fingerprint';
import { maskText } from '@pathfinder/core';
import { shapeOfBody, type Shape } from './shape.js';

export interface ObservedCall {
  method: string;
  url_template: string;
  status: number;
  req_schema: Shape;
  res_schema: Shape;
}

export interface Observation {
  calls: ObservedCall[];
  console_errors: string[];
}

const MAX_BODY = 1_000_000;

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
  private readonly listeners: [string, (...a: never[]) => void][] = [];

  constructor(private readonly page: Page) {
    this.on('response', ((res: Response) => this.track(this.onResponse(res))) as never);
    this.on('requestfailed', ((req: Request) => {
      if (this.isApi(req))
        this.errors.push(
          maskText(
            `${req.method()} ${apiUrlTemplate(req.url())} failed: ${req.failure()?.errorText ?? 'unknown'}`,
          ),
        );
    }) as never);
    this.on('console', ((msg: { type(): string; text(): string }) => {
      if (msg.type() === 'error') this.errors.push(maskText(msg.text()).slice(0, 500));
    }) as never);
    this.on('pageerror', ((err: Error) =>
      this.errors.push(maskText(err.message).slice(0, 500))) as never);
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
    if (!this.isApi(req)) return;
    let resBody: string | null = null;
    try {
      const ct = res.headers()['content-type'] ?? '';
      if (/json|text|xml/i.test(ct)) {
        const text = await res.text();
        resBody = text.length <= MAX_BODY ? text : null;
      }
    } catch {
      /* body unavailable (redirect, aborted): shape unknown */
    }
    this.calls.push({
      method: req.method().toUpperCase(),
      url_template: apiUrlTemplate(req.url()),
      status: res.status(),
      req_schema: shapeOfBody(req.postData(), req.headers()['content-type']),
      res_schema: shapeOfBody(resBody, res.headers()['content-type']),
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
