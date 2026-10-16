import type { LoginSpec } from '@pathfinder/config';
import { shapeUrl } from '@pathfinder/trace';
import { settle, waitForCondition, type ProgressSignals } from '@pathfinder/crawler';
import type { ServerContext } from '../context.js';
import { ToolError } from '../errors.js';
import { runSecrets } from '../services/credentials.js';
import { captchaInDom } from './handoff.js';
import type { RunState } from './run-state.js';

type Page = RunState['session']['page'];
type Locator = ReturnType<Page['locator']>;

export type LoginReason = 'rejected' | 'locked' | 'captcha' | 'control_not_found' | 'unknown';
export interface LoginOutcome {
  /**
   * `pending` (spec 030 FR-062, owner D-2 Q2): neither a success nor a failure sign after the page
   * stopped moving and one silent re-check; the agent may wait or log in again.
   */
  outcome: 'logged_in' | 'failed' | 'pending';
  reason?: LoginReason;
  /** Shaped URL the browser ended on, when the outcome could not be told. */
  at?: string;
}

const list = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** The control a login block names: label, then placeholder, then CSS (or role+name for submit). */
function control(
  page: Page,
  loc: { label?: string; placeholder?: string; css?: string; role?: string; name?: string },
): Locator | null {
  const parts: Locator[] = [];
  if (loc.role && loc.name)
    parts.push(page.getByRole(loc.role as Parameters<Page['getByRole']>[0], { name: loc.name }));
  if (loc.label) parts.push(page.getByLabel(loc.label, { exact: true }));
  if (loc.placeholder) parts.push(page.getByPlaceholder(loc.placeholder, { exact: true }));
  if (loc.css) parts.push(page.locator(loc.css));
  if (parts.length === 0) return null;
  return parts
    .slice(1)
    .reduce((a, b) => a.or(b), parts[0]!)
    .first();
}

async function bodyText(page: Page): Promise<string> {
  return page
    .locator('body')
    .innerText({ timeout: 2000 })
    .catch(() => '');
}

/** The portal's expiry signs on the page now (contracts/login-tool.md). */
export async function sessionExpired(page: Page, spec: LoginSpec): Promise<boolean> {
  const exp = spec.expiry;
  if (!exp) return false;
  if (exp.url_matching && page.url().includes(exp.url_matching)) return true;
  const texts = list(exp.text);
  if (texts.length === 0) return false;
  const text = await bodyText(page);
  return texts.some((t) => text.includes(t));
}

/** What `login` needs before it touches the portal; throws the tool error otherwise. */
export function loginPreconditions(rs: RunState): {
  spec: LoginSpec;
  username: string;
  password: string;
} {
  const spec = rs.effective.portal.login;
  if (!spec)
    throw new ToolError(
      'LOGIN_NOT_CONFIGURED',
      `portal ${rs.effective.portal.id} has no login block`,
    );
  if (rs.login === 'blocked')
    throw new ToolError(
      'LOGIN_BLOCKED',
      'an earlier login in this run failed; no further attempt is made (lockout protection)',
    );
  const secrets = runSecrets.get(rs.runId) ?? {};
  const username = secrets[spec.fields.username];
  const password = secrets[spec.fields.password];
  if (username === undefined || password === undefined)
    throw new ToolError(
      'LOGIN_NOT_CONFIGURED',
      `persona ${rs.effective.persona.id} has no credentials for auth keys "${spec.fields.username}" and "${spec.fields.password}"`,
    );
  return { spec, username, password };
}

/**
 * Fill and submit the login form with Playwright directly: no action record, no autofill, no
 * agent-visible value (FR-018). The values were registered with the redactor at `start_run`, so
 * anything the portal echoes is redacted before storage. Leaves the browser on the landing page.
 */
export async function performLogin(
  ctx: ServerContext,
  rs: RunState,
  creds: { spec: LoginSpec; username: string; password: string },
): Promise<LoginOutcome> {
  rs.loggingIn = true;
  try {
    // FR-019a: nothing of the login reaches the Playwright trace (snapshots keep typed values,
    // the network log keeps the POST body); the trace goes on after it.
    return await (rs.pw ? rs.pw.untraced(() => loginSteps(rs, creds)) : loginSteps(rs, creds));
  } finally {
    rs.loggingIn = false;
    ctx.tracer.event('login', { run_id: rs.runId });
  }
}

/** The landing page's settle ceiling after a login (a short session must not time out meanwhile). */
const IDLE_MS = 2500;

/** How long a login waits while the page keeps working (spec 030 FR-061, D-2 Q1). */
const LOGIN_WAIT = { quietMs: 10_000, hardMs: 90_000 };

/** Progress of the login page: network activity, the URL and the size of the DOM. */
function progressOf(rs: RunState): ProgressSignals {
  const page = rs.session.page;
  return {
    lastNetworkActivityAt: () => rs.session.net.lastActivityAt,
    fingerprint: async () =>
      `${page.url()}|${String(await page.evaluate(DOM_SIZE).catch(() => 0))}`,
  };
}
const DOM_SIZE = 'document.getElementsByTagName("*").length';

/** Fill, then the events a data-bound model listens for (spec 030 FR-060, field C-6). */
async function enter(field: Locator, value: string): Promise<void> {
  await field.fill(value, { timeout: 5000 });
  await field.dispatchEvent('change');
  await field.blur();
}

/** The portal's own verdict on the page now: a failure text, the success signs, or none yet. */
async function verdict(page: Page, spec: LoginSpec): Promise<LoginOutcome | null> {
  const text = await bodyText(page);
  const failed = list(spec.failure?.text).find((t) => text.includes(t));
  if (failed !== undefined) {
    // The failure text decides: a portal may show a CAPTCHA next to a plain "wrong password".
    const reason: LoginReason = /zablok|locked|blocked/i.test(failed)
      ? 'locked'
      : /robot|captcha/i.test(failed)
        ? 'captcha'
        : 'rejected';
    return { outcome: 'failed', reason };
  }
  const urlOk =
    spec.success.url_not_matching === undefined ||
    !page.url().includes(spec.success.url_not_matching);
  const successTexts = list(spec.success.text);
  const textOk = successTexts.length === 0 || successTexts.some((t) => text.includes(t));
  return urlOk && textOk ? { outcome: 'logged_in' } : null;
}

/** Wait while the page moves until it gives a verdict; null when it went quiet without one. */
async function awaitVerdict(rs: RunState, spec: LoginSpec): Promise<LoginOutcome | null> {
  let v: LoginOutcome | null = null;
  await waitForCondition(
    async () => (v = await verdict(rs.session.page, spec)) !== null,
    progressOf(rs),
    LOGIN_WAIT,
  );
  return v;
}

async function loginSteps(
  rs: RunState,
  creds: { spec: LoginSpec; username: string; password: string },
): Promise<LoginOutcome> {
  const { spec, username, password } = creds;
  const page = rs.session.page;
  const typed: Locator[] = [];
  try {
    await rs.session.goto(new URL(spec.url, rs.effective.portal.base_url).toString());
    // Let the login page settle before typing (the crawler's stabilizer, short ceiling): filling a
    // shell that is still starting broke the micro-frontends of every later page on the bank
    // estate (spec 030 F-08). A form that renders later still is waited for below.
    await settle(page, rs.session.net, { timeoutMs: IDLE_MS });
    if (await captchaInDom(page)) return { outcome: 'failed', reason: 'captcha' };
    const user = control(page, spec.username);
    const pass = control(page, spec.password);
    const submit = control(page, spec.submit);
    if (!user || !pass || !submit) return { outcome: 'failed', reason: 'control_not_found' };
    // A form that renders late (an SPA loading many chunks at the polite rate, GC-08) is waited
    // for while the page keeps loading, not for a fixed 5 s.
    const form = await waitForCondition(
      () => user.isVisible().catch(() => false),
      progressOf(rs),
      LOGIN_WAIT,
    );
    if (!form.met) {
      // Already logged in (a second `login` after a pending one): the portal skipped the form.
      const already = await verdict(page, spec);
      return already?.outcome === 'logged_in'
        ? already
        : { outcome: 'failed', reason: 'control_not_found' };
    }
    typed.push(user, pass);
    try {
      await enter(user, username);
      await enter(pass, password);
      await submit.click({ timeout: 5000 });
    } catch {
      return { outcome: 'failed', reason: 'control_not_found' };
    }
    // The verdict waits while a redirect chain moves (D-2): checked on the provider's host
    // mid-chain, a successful login used to read as a failure (GC-09). Undecided after the wait:
    // one silent re-check, then `pending` (never a lockout).
    const v = (await awaitVerdict(rs, spec)) ?? (await awaitVerdict(rs, spec));
    if (v) return v;
    if (await captchaInDom(page)) return { outcome: 'failed', reason: 'captcha' };
    return { outcome: 'pending', at: shapeUrl(page.url()).route };
  } finally {
    // A login that stays on the form (rejected, or a page that does not navigate) still holds the
    // typed values; the next trace snapshot would record them.
    for (const field of typed)
      if (await field.count().catch(() => 0))
        await field.fill('', { timeout: 1000 }).catch(() => undefined);
  }
}
