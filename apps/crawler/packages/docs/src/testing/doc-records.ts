import type { Confidence } from '@pathfinder/core';
import type {
  DocContent,
  DocKind,
  EvidenceTargetKind,
  RelationType,
  ReviewAction,
  RevisionChange,
  RevisionStatus,
} from '@pathfinder/docs-model';
import { EVIDENCE_COLUMN } from '@pathfinder/store';
import { formatKey } from '../keys.js';
import type { FixtureStore, TraceFixture } from './fixture-store.js';

/** `FIXTURE_TS` plus `m` minutes: revisions and reviews get distinct, ordered times. */
export const seedTs = (m: number): string => new Date(Date.UTC(2026, 0, 15, 10, m)).toISOString();

interface LinkSpec {
  kind: EvidenceTargetKind;
  id: string;
  run: string | null;
  note?: string;
}
interface RevSpec {
  change?: RevisionChange;
  content: DocContent;
  confidence: Confidence;
  notObservable?: boolean;
  status: RevisionStatus;
  note?: string;
  evidence: LinkSpec[];
  relations?: { type: RelationType; to: string }[];
  reviews?: { action: ReviewAction; text?: string }[];
}

export interface SeededDocs {
  /** Record key → record id. */
  ids: Record<string, string>;
  sessionId: string;
  trace: TraceFixture;
  boundary: TraceFixture;
}

/**
 * A fixed Layer B record set over the fixture store's map run and two trace runs (tasks.md T072):
 * all 12 kinds; statuses draft, confirmed, rejected, superseded (SCR-002: a draft over a confirmed
 * baseline), a withdrawn record (DI-004); every confidence and one not-observable flag (BR-002);
 * confirm/reject/comment reviews; an open and a blocked follow-up; a BA and two crawler questions.
 * Rows are written directly with the statuses the status engine would have left, so `audit()` reports
 * nothing. Call on a store made with `deterministicIds: true` for byte-stable output.
 */
export function seedDocRecords(fx: FixtureStore): SeededDocs {
  const { raw, portalId, nextId } = fx;
  const trace = fx.addTraceRun();
  const boundary = fx.addBoundaryTrace();
  const map = fx.runId;
  let clock = 0;
  const tick = (): string => seedTs(++clock);

  const sessionId = nextId();
  raw
    .prepare(
      `INSERT INTO analysis_sessions (id, portal_id, status, passes_json, summary, gaps_json, started_at, ended_at)
       VALUES (?, ?, 'completed', '[]', 'Seeded documentation', '[]', ?, ?)`,
    )
    .run(sessionId, portalId, seedTs(0), seedTs(0));
  for (const run of [map, trace.runId, boundary.runId])
    raw
      .prepare('INSERT INTO analysis_session_runs (session_id, run_id) VALUES (?, ?)')
      .run(sessionId, run);

  const ids: Record<string, string> = {};
  const seqs = new Map<DocKind, number>();
  const pending: { from: string; to: string; type: RelationType }[] = [];

  const record = (kind: DocKind, revs: RevSpec[]): string => {
    const seq = (seqs.get(kind) ?? 0) + 1;
    seqs.set(kind, seq);
    const key = formatKey(kind, seq);
    const id = nextId();
    ids[key] = id;
    const latest = revs.at(-1)!;
    const confirmed = revs.map((r, i) => (r.status === 'confirmed' ? i + 1 : 0)).filter(Boolean);
    const created = seedTs(clock + 1);
    // Spec 039 T070: a PROC record documents its own process. Its id is derived from the seq so
    // the fixture's other ids stay as they were.
    const processId =
      kind === 'process' ? `00000000-0000-7000-9000-${String(seq).padStart(12, '0')}` : null;
    if (processId)
      raw
        .prepare(
          `INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, scope_id,
             suggestion_id, created_at, updated_at, archived_at, record_key)
           VALUES (?, ?, ?, ?, 'guest', 'scoped', 1, 'new', NULL, NULL, ?, ?, NULL, ?)`,
        )
        .run(
          processId,
          portalId,
          `PRC-${String(seq).padStart(3, '0')}`,
          latest.content.title,
          created,
          created,
          key,
        );
    raw
      .prepare(
        `INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn,
         created_at, updated_at, process_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        portalId,
        kind,
        key,
        seq,
        latest.content.title,
        revs.length,
        confirmed.at(-1) ?? null,
        latest.change === 'withdraw' ? 1 : 0,
        created,
        created,
        processId,
      );
    let updated = created;
    revs.forEach((rev, i) => {
      const revisionId = nextId();
      updated = tick();
      raw
        .prepare(
          `INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json, confidence,
           not_observable, status, change_note, responds_to_review, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        )
        .run(
          revisionId,
          id,
          i + 1,
          sessionId,
          rev.change ?? (i === 0 ? 'create' : 'revise'),
          JSON.stringify(rev.content),
          rev.confidence,
          rev.notObservable ? 1 : 0,
          rev.status,
          rev.note ?? (i === 0 ? null : 'Revised after a new run'),
          updated,
        );
      for (const link of rev.evidence) {
        // What a link cites is a typed ref (spec 039 § 15, migration 0040).
        const ref = nextId();
        raw
          .prepare(`INSERT INTO entity_refs (id, ${EVIDENCE_COLUMN[link.kind]}) VALUES (?, ?)`)
          .run(ref, link.id);
        raw
          .prepare(
            `INSERT INTO doc_evidence_links (id, revision_id, ref_id, run_id, note)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(nextId(), revisionId, ref, link.run, link.note ?? null);
      }
      for (const rel of rev.relations ?? [])
        pending.push({ from: revisionId, to: rel.to, type: rel.type });
      for (const review of rev.reviews ?? []) {
        updated = tick();
        raw
          .prepare(
            `INSERT INTO doc_reviews (id, revision_id, action, reviewer, text, created_at)
             VALUES (?, ?, ?, 'Test Reviewer', ?, ?)`,
          )
          .run(nextId(), revisionId, review.action, review.text ?? null, updated);
      }
    });
    raw.prepare('UPDATE doc_records SET updated_at = ? WHERE id = ?').run(updated, id);
    return key;
  };

  const st = fx.states;
  const stateLink = (id: string, note?: string): LinkSpec => ({
    kind: 'state',
    id,
    run: map,
    ...(note ? { note } : {}),
  });
  const confirm = [{ action: 'confirm' as const }];

  // ---- capabilities, screens ----------------------------------------------------------------------
  record('capability', [
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
  ]);
  record('capability', [
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
  ]);
  record('screen', [
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
  ]);
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
  record('screen', [
    {
      content: vehicleScreen('First step of the premium calculator: vehicle data.'),
      confidence: 'observed',
      status: 'confirmed',
      evidence: [stateLink(st.vehicle), { kind: 'form', id: fx.forms.vehicle, run: map }],
      reviews: confirm,
    },
    {
      content: vehicleScreen(
        'First step of the premium calculator: vehicle data, sent with "Dalej".',
      ),
      confidence: 'observed',
      status: 'draft',
      evidence: [stateLink(st.vehicle), { kind: 'form', id: fx.forms.vehicle, run: map }],
    },
  ]);
  record('screen', [
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
  ]);
  record('screen', [
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
  ]);

  // ---- processes, use cases -----------------------------------------------------------------------
  record('process', [
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
  ]);
  record('process', [
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
  ]);
  record('use_case', [
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
  ]);

  // ---- requirements, NFRs, rules ------------------------------------------------------------------
  record('requirement', [
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
  ]);
  record('requirement', [
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
        { kind: 'form', id: fx.forms.contact, run: map, note: 'hint "Podaj telefon lub e-mail."' },
      ],
      reviews: [{ action: 'comment', text: 'Is either field enough on its own?' }],
    },
  ]);
  record('nfr', [
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
  ]);
  record('business_rule', [
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
  ]);
  record('business_rule', [
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
  ]);

  // ---- glossary, data items -----------------------------------------------------------------------
  record('glossary_term', [
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
  ]);
  record('glossary_term', [
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
  ]);
  const vehicleForm = [{ kind: 'form' as const, target_id: fx.forms.vehicle }];
  record('data_item', [
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
      evidence: [{ kind: 'form', id: fx.forms.vehicle, run: map }],
      relations: [{ type: 'appears_on', to: 'SCR-002' }],
      reviews: confirm,
    },
  ]);
  record('data_item', [
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
      evidence: [{ kind: 'form', id: fx.forms.vehicle, run: map }],
      relations: [{ type: 'appears_on', to: 'SCR-002' }],
    },
  ]);
  record('data_item', [
    {
      content: {
        kind: 'data_item',
        title: 'Postcode',
        name_verbatim: 'Kod pocztowy',
        lang: 'pl',
        name_en: 'Postcode',
        data_type: 'text',
        constraints: { required: true, format: 'NN-NNN', pattern_observed: '[0-9]{2}-[0-9]{3}' },
        seen_in: vehicleForm,
      },
      confidence: 'observed',
      status: 'draft',
      evidence: [{ kind: 'form', id: fx.forms.vehicle, run: map }],
    },
  ]);
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
  record('data_item', [
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
  ]);

  // ---- assumptions, questions, follow-ups ---------------------------------------------------------
  record('assumption', [
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
  ]);
  record('open_question', [
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
  ]);
  const fup1 = record('followup', [
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
  ]);
  const fup2 = record('followup', [
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
  ]);
  raw
    .prepare(
      `INSERT INTO followup_tasks (record_id, status, run_id, blocked_reason, updated_at) VALUES (?, 'open', NULL, NULL, ?)`,
    )
    .run(ids[fup1], tick());
  raw
    .prepare(
      `INSERT INTO followup_tasks (record_id, status, run_id, blocked_reason, updated_at) VALUES (?, 'blocked', ?, ?, ?)`,
    )
    .run(
      ids[fup2],
      boundary.runId,
      'ceiling:read: "Dalej" is mutating, above the read limit',
      tick(),
    );

  for (const rel of pending)
    raw
      .prepare('INSERT INTO doc_relations (from_revision_id, to_record_id, type) VALUES (?, ?, ?)')
      .run(rel.from, ids[rel.to], rel.type);

  return { ids, sessionId, trace, boundary };
}
