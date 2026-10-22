/** Seeded requirements, NFRs, rules and glossary terms (`seedDocRecords`). */
import type { Seed, SeedContext } from './types.js';

// ---- requirements, NFRs, rules ------------------------------------------------------------------
export function requirements({ fx, st, map, stateLink, confirm }: SeedContext): Seed[] {
  return [
    [
      'requirement',
      [
        {
          content: {
            kind: 'requirement',
            title: 'Vehicle make is required',
            statement: 'The calculator requires a vehicle make ("Marka") before "Dalej".',
            acceptance_criteria: [
              {
                given: ['the form "Dane pojazdu" is shown'],
                when: ['the guest leaves "Marka" empty', 'selects "Dalej"'],
                then: ['the field is marked required'],
              },
            ],
            priority: 'must',
          },
          confidence: 'observed',
          status: 'confirmed',
          evidence: [
            { kind: 'form', id: fx.forms.vehicle, run: map, note: 'field "Marka" marked required' },
          ],
          relations: [
            { type: 'refines', to: 'UC-001' },
            { type: 'enforces', to: 'BR-001' },
          ],
          reviews: confirm,
        },
      ],
    ],
    [
      'requirement',
      [
        {
          content: {
            kind: 'requirement',
            title: 'Contact form needs a phone or an e-mail',
            statement: 'The contact form asks for a phone number or an e-mail address.',
            rationale: 'So the insurer can answer.',
            rationale_confidence: 'needs_confirmation',
            acceptance_criteria: [],
            priority: 'unset',
          },
          confidence: 'needs_confirmation',
          status: 'draft',
          evidence: [
            {
              kind: 'form',
              id: fx.forms.contact,
              run: map,
              note: 'hint "Podaj telefon lub e-mail."',
            },
          ],
          reviews: [{ action: 'comment', text: 'Is either field enough on its own?' }],
        },
      ],
    ],
    [
      'nfr',
      [
        {
          content: {
            kind: 'nfr',
            title: 'Polish user interface',
            category: 'localisation',
            statement: 'All observed pages are in Polish.',
            measured: { value: 'pl', unit: 'language', how: 'page text of every observed state' },
          },
          confidence: 'observed',
          status: 'confirmed',
          evidence: [stateLink(st.home), stateLink(st.car)],
          reviews: confirm,
        },
      ],
    ],
  ];
}

export function rules({ fx, st, map, stateLink }: SeedContext): Seed[] {
  return [
    [
      'business_rule',
      [
        {
          content: {
            kind: 'business_rule',
            title: 'Autocasco only for young vehicles',
            statement: 'Autocasco (AC) is offered only for vehicles up to 15 years old.',
            rule_type: 'constraint',
            decision_table: {
              conditions: ['Vehicle age'],
              actions: ['AC offered'],
              rows: [
                ['≤ 15 years', 'yes'],
                ['> 15 years', 'no'],
              ],
            },
          },
          confidence: 'inferred',
          status: 'draft',
          evidence: [stateLink(st.car)],
          relations: [{ type: 'uses_term', to: 'GL-001' }],
        },
      ],
    ],
    [
      'business_rule',
      [
        {
          content: {
            kind: 'business_rule',
            title: 'Purchase issues a policy',
            statement: 'Selecting "Kup polisę" issues a policy for the calculated premium.',
            rule_type: 'action_enabler',
          },
          confidence: 'needs_confirmation',
          notObservable: true,
          status: 'draft',
          evidence: [
            { kind: 'action', id: fx.actions.buy, run: map },
            { kind: 'open_question', id: fx.openQuestions[1], run: map },
          ],
        },
      ],
    ],
  ];
}

// ---- glossary, data items -----------------------------------------------------------------------
export function glossary({ st, stateLink, confirm }: SeedContext): Seed[] {
  return [
    [
      'glossary_term',
      [
        {
          content: {
            kind: 'glossary_term',
            title: 'Autocasco',
            term_verbatim: 'Autocasco',
            lang: 'pl',
            definition: 'Voluntary insurance covering damage to the insured vehicle.',
            synonyms_verbatim: ['AC'],
          },
          confidence: 'observed',
          status: 'confirmed',
          evidence: [stateLink(st.car)],
          reviews: confirm,
        },
      ],
    ],
    [
      'glossary_term',
      [
        {
          content: {
            kind: 'glossary_term',
            title: 'Third-party liability',
            term_verbatim: 'OC',
            lang: 'pl',
            definition: 'Compulsory third-party liability insurance for vehicle owners.',
            synonyms_verbatim: [],
          },
          confidence: 'inferred',
          status: 'draft',
          evidence: [stateLink(st.car, 'paragraph "OC jest obowiązkowe."')],
        },
      ],
    ],
  ];
}
