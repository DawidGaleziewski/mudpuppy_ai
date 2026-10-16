// SC-18 (owner, 2026-10-15): a three-step application form. Each step has several validators
// (required, format, length, a rule across fields), its Next button stays disabled until the step is
// valid, every step but the first has Back, and the final submit leads to a success page or an
// error page. The server validates again (a step posted with errors comes back with the messages).

import { esc, html, page, redirect } from '../page.js';
import type { Handler, Scar, ScarContext } from '../types.js';
import { FIELDS, validate, type Step, type Values } from './sc18-validators.js';
import { VALIDATION_SCRIPT } from './sc18-script.js';

const SESSION = 'sc18';

/** The wizard's values for this visitor, kept server-side under a cookie (a legacy session). */
function session(ctx: ScarContext): { id: string; values: Values } {
  const id = ctx.cookies[SESSION] ?? `s${Math.random().toString(36).slice(2, 10)}`;
  const key = `sc18:${id}`;
  if (!ctx.memory.has(key)) ctx.memory.set(key, {});
  return { id, values: ctx.memory.get(key) as Values };
}

const cookie = (id: string) => ({ 'set-cookie': `${SESSION}=${id}; Path=/sc18; HttpOnly` });

function field(step: Step, name: string, values: Values, errors: Record<string, string>): string {
  const f = FIELDS[step].find((x) => x.name === name)!;
  const v = esc(values[name] ?? '');
  const err = errors[name]
    ? `<p class="error" role="alert" id="${name}-error">${esc(errors[name])}</p>`
    : `<p class="error" role="alert" id="${name}-error" hidden></p>`;
  if (f.kind === 'select')
    return `<label for="${name}">${f.label}</label><select id="${name}" name="${name}">
<option value="">Please choose</option>
${f.options!.map((o) => `<option${o === values[name] ? ' selected' : ''}>${o}</option>`).join('')}
</select>${err}`;
  if (f.kind === 'checkbox')
    return `<label><input type="checkbox" id="${name}" name="${name}" value="yes"${values[name] === 'yes' ? ' checked' : ''}> ${f.label}</label>${err}`;
  return `<label for="${name}">${f.label}</label><input id="${name}" name="${name}" value="${v}" placeholder="${f.placeholder ?? ''}">${err}`;
}

const TITLES: Record<Step, string> = {
  1: 'Application, step 1 of 3: personal data',
  2: 'Application, step 2 of 3: contract',
  3: 'Application, step 3 of 3: summary',
};

function stepPage(step: Step, values: Values, errors: Record<string, string> = {}): string {
  const fields = FIELDS[step].map((f) => field(step, f.name, values, errors)).join('\n');
  const summary =
    step === 3
      ? `<dl>${FIELDS[1]
          .concat(FIELDS[2])
          .map((f) => `<dt>${f.label}</dt><dd>${esc(values[f.name] ?? '')}</dd>`)
          .join('')}</dl>`
      : '';
  const back = step > 1 ? `<a href="/sc18/step-${step - 1}">Back</a>` : '';
  const button = step === 3 ? 'Submit application' : 'Next';
  const action = step === 3 ? '/sc18/submit' : `/sc18/step-${step}`;
  return page(
    TITLES[step],
    `${summary}<form method="post" action="${action}" aria-label="Application step ${step}" novalidate>
${fields}
<p>${back} <button type="submit" id="next" disabled>${button}</button></p>
</form>
<script>window.__sc18prev = ${JSON.stringify(values).replace(/</g, '\\u003c')};</script>
<script>${VALIDATION_SCRIPT(step)}</script>`,
  );
}

function stepRoute(step: Step): Handler {
  return (req, res, ctx) => {
    const s = session(ctx);
    if (req.method !== 'POST') return html(res, stepPage(step, s.values), 200, cookie(s.id));
    const posted = Object.fromEntries(new URLSearchParams(ctx.body));
    for (const f of FIELDS[step]) s.values[f.name] = posted[f.name] ?? '';
    const errors = validate(step, s.values);
    if (Object.keys(errors).length > 0)
      return html(res, stepPage(step, s.values, errors), 200, cookie(s.id));
    redirect(res, `/sc18/step-${step + 1}`, 303, cookie(s.id));
  };
}

const submit: Handler = (req, res, ctx) => {
  const s = session(ctx);
  if (req.method !== 'POST') return redirect(res, '/sc18/step-3');
  s.values.confirm = new URLSearchParams(ctx.body).get('confirm') ?? '';
  const errors = { ...validate(1, s.values), ...validate(2, s.values), ...validate(3, s.values) };
  if (Object.keys(errors).length > 0) return html(res, stepPage(3, s.values, errors));
  // A back-end refusal the form cannot see: the reserved customer number fails (the error path).
  if (s.values.customer === 'KD-000000') return redirect(res, '/sc18/error', 303);
  const n = ((ctx.memory.get('sc18:submitted') as number | undefined) ?? 0) + 1;
  ctx.memory.set('sc18:submitted', n);
  redirect(res, `/sc18/success?ref=AP-${String(1000 + n)}`, 303);
};

export const sc18: Scar = {
  id: 'SC-18',
  entry: '/sc18/',
  routes: {
    '/sc18/': (_req, res) =>
      html(
        res,
        page(
          'Apply for a contract',
          '<p>Three steps. Have your customer number ready.</p><a href="/sc18/step-1">Start the application</a>',
        ),
      ),
    '/sc18/step-1': stepRoute(1),
    '/sc18/step-2': stepRoute(2),
    '/sc18/step-3': stepRoute(3),
    '/sc18/submit': submit,
    '/sc18/success': (_req, res, ctx) =>
      html(
        res,
        page(
          'Application received',
          `<p>Thank you. Your reference: <strong>${esc(ctx.query.get('ref') ?? '')}</strong></p><a href="/sc18/">Done</a>`,
        ),
      ),
    '/sc18/error': (_req, res) =>
      html(
        res,
        page(
          'Application could not be processed',
          '<p role="alert">Error E-17: your application could not be processed. Please try again later.</p><a href="/sc18/step-3">Back to the summary</a>',
        ),
      ),
  },
};
