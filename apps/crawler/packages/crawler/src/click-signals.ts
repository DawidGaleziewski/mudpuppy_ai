/// <reference lib="dom" />
import type { BrowserContext } from 'playwright';
import { NAME_SHIM } from './in-page.js';

/**
 * Where the init script keeps the elements that registered a click-like listener: a `WeakSet` under
 * a registered symbol on `window`, non-enumerable, so the page neither sees a new attribute nor a
 * new global name and its DOM (and fingerprint) stay as they were (spec 015 R1).
 */
export const CLICK_SIGNALS_KEY = 'mudpuppy.click-signals';

/**
 * Runs in every document before the page's own scripts: wraps `addEventListener` to note elements
 * that listen for clicks, the only way to see a listener-only `div` button without the DevTools
 * protocol (spec 015 R1, LO-10). Defensive: any failure leaves the page's own behaviour untouched.
 */
function clickSignalsInit(key: string): void {
  try {
    const store = Symbol.for(key);
    const w = window as unknown as Record<symbol, WeakSet<Element> | undefined>;
    if (w[store]) return;
    const seen = new WeakSet<Element>();
    Object.defineProperty(window, store, { value: seen, enumerable: false });
    const TYPES = new Set([
      'click',
      'mousedown',
      'mouseup',
      'pointerdown',
      'pointerup',
      'touchstart',
    ]);
    // Read through the descriptor: the original is called with the page's own `this` below.
    const original = Object.getOwnPropertyDescriptor(EventTarget.prototype, 'addEventListener')!
      .value as EventTarget['addEventListener'];
    const wrapped = function (
      this: EventTarget,
      type: string,
      ...rest: [EventListenerOrEventListenerObject | null, (boolean | AddEventListenerOptions)?]
    ): void {
      try {
        if (TYPES.has(type) && this instanceof Element) seen.add(this);
      } catch {
        // a hostile `this` (proxy, cross-realm object) must never break the page's own call
      }
      original.call(this, type, ...rest);
    };
    EventTarget.prototype.addEventListener = wrapped;
  } catch {
    // a frozen prototype: the other click signals (cursor, inline, framework) still work
  }
}

/**
 * Install the click-signal init script on a context, before its first page loads. Passed as source
 * with the `__name` shim for the same reason as `evalInPage`: under tsx the function's named locals
 * call a helper the page does not have, and the `try` would swallow that silently.
 */
export async function installClickSignals(context: BrowserContext): Promise<void> {
  await context.addInitScript({
    content: `${NAME_SHIM} (${clickSignalsInit.toString()})(${JSON.stringify(CLICK_SIGNALS_KEY)});`,
  });
}
