/** Seeded capabilities, screens, processes and use cases (`seedDocRecords`). */
import type { DocContent } from '@mudpuppy/docs-model';
import type { LinkSpec, Seed, SeedContext } from './types.js';

// ---- capabilities, screens ----------------------------------------------------------------------
export function capabilities({ st, stateLink, confirm }: SeedContext): Seed[] {
  return [
    [
      'capability',
      [
        {
          content: {
            kind: 'capability',
            title: 'Car insurance quote',
            description: 'A guest finds car insurance and calculates an OC/AC premium.',
          },
          confidence: 'observed',
          status: 'confirmed',
          evidence: [stateLink(st.car), stateLink(st.vehicle)],
          relations: [
            { type: 'contains', to: 'SCR-001' },
            { type: 'contains', to: 'SCR-002' },
            { type: 'contains', to: 'PROC-001' },
            { type: 'contains', to: 'PROC-002' },
          ],
          reviews: confirm,
        },
      ],
    ],
    [
      'capability',
      [
        {
          content: {
            kind: 'capability',
            title: 'Contact the insurer',
            description: 'A guest sends a message through the contact form.',
          },
          confidence: 'observed',
          status: 'draft',
          evidence: [stateLink(st.contact)],
          relations: [{ type: 'contains', to: 'SCR-003' }],
        },
      ],
    ],
  ];
}

const vehicleScreen = (purpose: string): DocContent => ({
  kind: 'screen',
  title: 'Vehicle calculator',
  purpose,
  route_templates: ['/kalkulator/pojazd'],
  elements: [
    { role: 'heading', label_verbatim: 'Kalkulator OC/AC — dane pojazdu' },
    { role: 'combobox', label_verbatim: 'Marka' },
    { role: 'textbox', label_verbatim: 'Model' },
    { role: 'spinbutton', label_verbatim: 'Rok produkcji' },
    { role: 'button', label_verbatim: 'Dalej' },
  ],
  entry_points: ['Link "Oblicz składkę" on the car insurance page'],
});

/** The car insurance page and the vehicle calculator (a draft over a confirmed revision). */
export function calculatorScreens({ fx, st, map, stateLink, confirm }: SeedContext): Seed[] {
  const vehicleEvidence = (): LinkSpec[] => [
    stateLink(st.vehicle),
    { kind: 'form', id: fx.forms.vehicle, run: map },
  ];
  return [
    [
      'screen',
      [
        {
          content: {
            kind: 'screen',
            title: 'Car insurance page',
            purpose: 'Presents OC and Autocasco (AC) and links to the premium calculator.',
            route_templates: ['/ubezpieczenia/samochod'],
            elements: [
              { role: 'heading', label_verbatim: 'Ubezpieczenie samochodu' },
              { role: 'link', label_verbatim: 'Oblicz składkę' },
              { role: 'button', label_verbatim: 'Kup polisę' },
            ],
            entry_points: ['Main menu link "Samochód"'],
          },
          confidence: 'observed',
          status: 'confirmed',
          evidence: [stateLink(st.car)],
          relations: [{ type: 'uses_term', to: 'GL-001' }],
          reviews: confirm,
        },
      ],
    ],
    [
      'screen',
      [
        {
          content: vehicleScreen('First step of the premium calculator: vehicle data.'),
          confidence: 'observed',
          status: 'confirmed',
          evidence: vehicleEvidence(),
          reviews: confirm,
        },
        {
          content: vehicleScreen(
            'First step of the premium calculator: vehicle data, sent with "Dalej".',
          ),
          confidence: 'observed',
          status: 'draft',
          evidence: vehicleEvidence(),
        },
      ],
    ],
  ];
}

/** The contact page and the home page (a rejected record). */
export function otherScreens({ st, stateLink }: SeedContext): Seed[] {
  return [
    [
      'screen',
      [
        {
          content: {
            kind: 'screen',
            title: 'Contact page',
            purpose: 'Contact form for questions to the insurer.',
            route_templates: ['/kontakt'],
            elements: [
              { role: 'heading', label_verbatim: 'Kontakt' },
              { role: 'button', label_verbatim: 'Wyślij' },
            ],
            entry_points: ['Main menu link "Kontakt"'],
          },
          confidence: 'observed',
          status: 'draft',
          evidence: [stateLink(st.contact)],
        },
      ],
    ],
    [
      'screen',
      [
        {
          content: {
            kind: 'screen',
            title: 'Home page',
            purpose: 'Landing page.',
            route_templates: ['/'],
            elements: [],
            entry_points: [],
          },
          confidence: 'observed',
          status: 'rejected',
          evidence: [stateLink(st.home)],
          reviews: [{ action: 'reject', text: 'Purpose is too thin; list the product links.' }],
        },
      ],
    ],
  ];
}

// ---- processes, use cases -----------------------------------------------------------------------
export function processes({ trace, boundary, confirm }: SeedContext): Seed[] {
  return [
    [
      'process',
      [
        {
          content: {
            kind: 'process',
            title: 'Calculate a car premium',
            goal: 'See an OC/AC premium for a car',
            persona: 'guest',
            trigger: 'The guest opens "Oblicz składkę".',
            outcome: 'The vehicle data form is shown.',
            observed_extent: 'full',
          },
          confidence: 'observed',
          status: 'confirmed',
          evidence: [
            { kind: 'process', id: trace.processId, run: trace.runId },
            { kind: 'process_step', id: trace.stepIds[1]!, run: trace.runId },
          ],
          reviews: confirm,
        },
      ],
    ],
    [
      'process',
      [
        {
          content: {
            kind: 'process',
            title: 'Buy a car policy',
            goal: 'Reach the purchase confirmation',
            persona: 'guest',
            trigger: 'The guest starts the calculator.',
            outcome: 'Stops before "Dalej"; what follows is not observable under the read limit.',
            observed_extent: 'until_boundary',
          },
          confidence: 'observed',
          status: 'draft',
          evidence: [
            { kind: 'process', id: boundary.processId, run: boundary.runId },
            { kind: 'process_step', id: boundary.stepIds[0]!, run: boundary.runId },
          ],
        },
      ],
    ],
    [
      'use_case',
      [
        {
          content: {
            kind: 'use_case',
            title: 'Calculate a premium',
            primary_actor: 'Guest',
            preconditions: ['The guest is on the car insurance page.'],
            trigger: 'The guest selects "Oblicz składkę".',
            main_flow: [
              { n: 1, actor_or_system: 'Guest', text: 'Selects "Oblicz składkę".' },
              { n: 2, actor_or_system: 'System', text: 'Shows the form "Dane pojazdu".' },
              { n: 3, actor_or_system: 'Guest', text: 'Enters the vehicle model.' },
            ],
            alternate_flows: [],
            exception_flows: [
              [{ n: 1, actor_or_system: 'System', text: 'Marks an empty required field.' }],
            ],
            postconditions: ['The vehicle data is entered.'],
          },
          confidence: 'inferred',
          status: 'draft',
          evidence: [{ kind: 'process', id: trace.processId, run: trace.runId }],
          relations: [{ type: 'describes', to: 'PROC-001' }],
        },
      ],
    ],
  ];
}
