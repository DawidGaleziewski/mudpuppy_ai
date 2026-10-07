import type { LoginSpec } from '@pathfinder/config';
import { shapeUrl } from '@pathfinder/core';
import { settle } from '@pathfinder/crawler';
import type { ServerContext } from '../context.js';
import { ToolError } from '../errors.js';
import { runSecrets } from '../services/credentials.js';
import { captchaInDom } from './handoff.js';
import type { RunState } from './run-state.js';

type Page = RunState['session']['page'];
type Locator = ReturnType<Page['locator']>;

export type LoginReason = 'rejected' | 'locked' | 'captcha' | 'control_not_found' | 'unknown';
export interface LoginOutcome {
  outcome: 'logged_in' | 'failed';
  reason?: LoginReason;
  /** Shaped URL the browser ended on, when the outcome could not be told. */
  at?: string;
}

const IDLE_MS = 2500;

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

async function loginSteps(
  rs: RunState,
  creds: { spec: LoginSpec; username: string; password: string },
): Promise<LoginOutcome> {
  const { spec, username, password } = creds;
  const page = rs.session.page;
  const typed: Locator[] = [];
  try {
    await rs.session.goto(new URL(spec.url, rs.effective.portal.base_url).toString());
    // The crawler's stabilizer, not `networkidle` (live SSE tickers never idle, F-06), with a short
    // ceiling: a long wait would let a short session time out before the next step.
    const idle = () => settle(page, rs.session.net, { timeoutMs: IDLE_MS });
    await idle();
    if (await captchaInDom(page)) return { outcome: 'failed', reason: 'captcha' };
    const user = control(page, spec.username);
    const pass = control(page, spec.password);
    const submit = control(page, spec.submit);
    if (!user || !pass || !submit) return { outcome: 'failed', reason: 'control_not_found' };
    typed.push(user, pass);
    try {
      await user.waitFor({ state: 'visible', timeout: 5000 });
      await user.fill(username, { timeout: 5000 });
      await pass.fill(password, { timeout: 5000 });
      await submit.click({ timeout: 5000 });
    } catch {
      return { outcome: 'failed', reason: 'control_not_found' };
    }
    await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
    await idle();
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
    if (urlOk && textOk) return { outcome: 'logged_in' };
    if (await captchaInDom(page)) return { outcome: 'failed', reason: 'captcha' };
    return { outcome: 'failed', reason: 'unknown', at: shapeUrl(page.url()).route };
  } finally {
    // A login that stays on the form (rejected, or a page that does not navigate) still holds the
    // typed values; the next trace snapshot would record them.
    for (const field of typed)
      if (await field.count().catch(() => 0))
        await field.fill('', { timeout: 1000 }).catch(() => undefined);
  }
}
