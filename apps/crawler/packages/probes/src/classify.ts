// What a probe's try produced, as one outcome kind (spec 032 plan decision 7, design §1). Pure and
// deterministic: the same facts give the same kind, so a form-probing run and the suite built from it
// agree. Rules in order: blocked, technical, validation, temporary, branch, next.

import type { OutcomeKind, ProbeGroup } from '@mudpuppy/core';

export interface FieldMessage {
  /** The field the message belongs to; null when the page did not tie it to one. */
  field: string | null;
  text: string;
  /** `dom`: rendered by the page; `native`: the browser's own constraint message. */
  source: 'dom' | 'native';
}

/** Where the happy path went from this step, the reference a branch is measured against. */
export interface HappyNext {
  stepId: string | null;
  route: string;
}

export interface OutcomeFacts {
  group: ProbeGroup;
  /** Why the try could not run or was stopped (a gate refusal, a CAPTCHA, a one-time code). */
  blocked: string | null;
  /** The browser is still on the step the try started on (same form step, same route). */
  sameStep: boolean;
  /** The form step and route the try landed on. */
  stepAfter: string | null;
  routeAfter: string;
  happyNext: HappyNext | null;
  messages: readonly FieldMessage[];
  /** HTTP status of the page or of the step's request, when one was seen. */
  httpStatus: number | null;
  /** The page shows an error page (transient error detection). */
  errorPage: boolean;
  /** The landing state belongs to a screen first seen by this try. */
  newScreen: boolean;
  /** The page is another state than before the press (a spinner, a message, another step). */
  changed: boolean;
}

export interface Classified {
  kind: OutcomeKind;
  /** A validation try the form let through: a finding for the BA. */
  accepted: boolean;
  possibleNewProcess: boolean;
  /** One line explaining the kind. */
  why: string;
}

const isError = (f: OutcomeFacts): boolean =>
  f.errorPage || (f.httpStatus !== null && f.httpStatus >= 500);

function technicalWhy(f: OutcomeFacts): string {
  const silent = f.messages.length === 0;
  if (!f.changed && silent && !isError(f)) return 'no visible reaction to the fault';
  if (f.sameStep && silent)
    return 'the step shows a waiting or changed state while the request fails';
  return 'what the user sees when the request fails';
}

function leftHappyPath(f: OutcomeFacts): boolean {
  if (f.happyNext === null) return f.newScreen;
  return f.routeAfter !== f.happyNext.route || f.stepAfter !== f.happyNext.stepId;
}

export function classifyOutcome(f: OutcomeFacts): Classified {
  const out = (kind: OutcomeKind, why: string, extra: Partial<Classified> = {}): Classified => ({
    kind,
    accepted: false,
    possibleNewProcess: false,
    why,
    ...extra,
  });
  if (f.blocked !== null) return out('blocked', f.blocked);
  if (f.group === 'technical') return out('technical', technicalWhy(f));
  if (f.sameStep)
    return out(
      'validation',
      f.messages.length > 0
        ? `the form refused it: ${f.messages.map((m) => m.text).join(' | ')}`
        : 'the form stayed on the step without a message',
    );
  if (isError(f)) return out('temporary', 'an error page after a non-technical try: recheck later');
  if (f.group === 'branch' && leftHappyPath(f))
    return out('branch', 'this option leads somewhere other than the happy path', {
      possibleNewProcess: f.newScreen,
    });
  return out(
    'next',
    f.group === 'validation' ? 'the form accepted it' : 'same next step as the happy path',
    {
      accepted: f.group === 'validation',
    },
  );
}
