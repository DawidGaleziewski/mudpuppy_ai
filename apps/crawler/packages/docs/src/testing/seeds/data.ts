/** Seeded data items, assumptions, questions and follow-ups (`seedDocRecords`). */
import type { DocContent } from '@mudpuppy/docs-model';
import type { LinkSpec, Seed, SeedContext } from './types.js';

export function vehicleItems({ fx, map, confirm }: SeedContext): Seed[] {
  const vehicleForm = [{ kind: 'form' as const, target_id: fx.forms.vehicle }];
  const formLink = (): LinkSpec[] => [{ kind: 'form', id: fx.forms.vehicle, run: map }];
  return [
    [
      'data_item',
      [
        {
          content: {
            kind: 'data_item',
            title: 'Vehicle make',
            name_verbatim: 'Marka',
            lang: 'pl',
            name_en: 'Make',
            data_type: 'enum',
            constraints: { required: true, allowed_values: ['Toyota', 'Skoda', 'Inna'] },
            seen_in: vehicleForm,
          },
          confidence: 'observed',
          status: 'confirmed',
          evidence: formLink(),
          relations: [{ type: 'appears_on', to: 'SCR-002' }],
          reviews: confirm,
        },
      ],
    ],
    [
      'data_item',
      [
        {
          content: {
            kind: 'data_item',
            title: 'Vehicle model',
            name_verbatim: 'Model',
            lang: 'pl',
            name_en: 'Model',
            data_type: 'text',
            constraints: { required: true, max_length: 40 },
            seen_in: vehicleForm,
          },
          confidence: 'observed',
          status: 'draft',
          evidence: formLink(),
          relations: [{ type: 'appears_on', to: 'SCR-002' }],
        },
      ],
    ],
    [
      'data_item',
      [
        {
          content: {
            kind: 'data_item',
            title: 'Postcode',
            name_verbatim: 'Kod pocztowy',
            lang: 'pl',
            name_en: 'Postcode',
            data_type: 'text',
            constraints: {
              required: true,
              format: 'NN-NNN',
              pattern_observed: '[0-9]{2}-[0-9]{3}',
            },
            seen_in: vehicleForm,
          },
          confidence: 'observed',
          status: 'draft',
          evidence: formLink(),
        },
      ],
    ],
  ];
}

export function contactItems({ fx, map }: SeedContext): Seed[] {
  const email: DocContent = {
    kind: 'data_item',
    title: 'E-mail',
    name_verbatim: 'E-mail',
    lang: 'pl',
    name_en: 'E-mail',
    data_type: 'email',
    constraints: { required: false },
    seen_in: [{ kind: 'form', target_id: fx.forms.contact }],
  };
  return [
    [
      'data_item',
      [
        {
          content: email,
          confidence: 'observed',
          status: 'superseded',
          evidence: [{ kind: 'form', id: fx.forms.contact, run: map }],
        },
        {
          change: 'withdraw',
          note: 'Duplicate of the contact requirement',
          content: email,
          confidence: 'observed',
          status: 'draft',
          evidence: [{ kind: 'form', id: fx.forms.contact, run: map }],
        },
      ],
    ],
  ];
}

// ---- assumptions, questions, follow-ups ---------------------------------------------------------
export function questions({ fx, map }: SeedContext): Seed[] {
  return [
    [
      'assumption',
      [
        {
          content: {
            kind: 'assumption',
            title: 'Same calculator for every make',
            statement: 'The calculator steps are the same whatever make is chosen.',
            impact_if_wrong: 'Processes per make would be missing.',
          },
          confidence: 'inferred',
          status: 'draft',
          evidence: [{ kind: 'form', id: fx.forms.vehicle, run: map }],
          relations: [{ type: 'answers', to: 'OQ-001' }],
        },
      ],
    ],
    [
      'open_question',
      [
        {
          content: {
            kind: 'open_question',
            title: 'Does the make change the calculator?',
            question: 'Do some makes show extra calculator steps?',
            why_it_matters: 'Decides whether the process has variants.',
            answer_needed_from: 'either',
          },
          confidence: 'needs_confirmation',
          status: 'draft',
          evidence: [{ kind: 'form', id: fx.forms.vehicle, run: map }],
        },
      ],
    ],
  ];
}

/** The two follow-ups, the open one first. */
export function followups({ fx, map, confirm }: SeedContext): Seed[] {
  return [
    [
      'followup',
      [
        {
          content: {
            kind: 'followup',
            title: 'Trace the contact form',
            question: 'What happens after "Wyślij"?',
            suggested_mode: 'trace',
            target: { process_name: 'Send a contact message', goal: 'See the confirmation' },
            persona: 'guest',
            reason: 'The submit was refused as mutating in the map run.',
          },
          confidence: 'needs_confirmation',
          status: 'draft',
          evidence: [{ kind: 'action', id: fx.actions.send, run: map }],
        },
      ],
    ],
    [
      'followup',
      [
        {
          content: {
            kind: 'followup',
            title: 'Trace the purchase',
            question: 'What follows "Kup polisę"?',
            suggested_mode: 'trace',
            target: { process_name: 'Buy a car policy', goal: 'Reach the purchase confirmation' },
            persona: 'guest',
            reason: 'The purchase was refused as mutating.',
          },
          confidence: 'needs_confirmation',
          status: 'confirmed',
          evidence: [{ kind: 'decision', id: fx.decision, run: map }],
          reviews: confirm,
        },
      ],
    ],
  ];
}
