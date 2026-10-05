// The micro-frontend contract (spec 009 research §1). Copied into every micro-frontend on purpose:
// there is no shared package, as in a real estate where teams release separately.

/** What the shell hands an app when it mounts it. */
export interface MountContext {
  /** The app's route prefix, e.g. "/sklep". */
  basePath: string;
  /** Path + search + hash of the current location. */
  path: () => string;
  /** Client-side navigation: pushState, then every app hears `route`. */
  navigate: (path: string) => void;
  /** Fire `pg:<name>` on window (cart-changed, session-expired, …). */
  emit: (name: string, detail?: unknown) => void;
  /** Listen to `pg:<name>`; returns the unsubscribe function. `route` fires on every navigation. */
  on: (name: string, fn: (detail: unknown) => void) => () => void;
  /** Origin of the cross-origin widget host (CAPTCHA, upload), e.g. http://127.0.0.1:4101. */
  widgetOrigin: string;
  /**
   * fetch with credentials. A 401 whose body says `session_expired` makes the shell show the
   * "Sesja wygasła" modal; the promise still resolves with the response.
   */
  api: (path: string, init?: RequestInit) => Promise<Response>;
}

/** Each app exports `mount(el, ctx)` and returns its unmount function. */
export type Mount = (el: HTMLElement, ctx: MountContext) => () => void;
