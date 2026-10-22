import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STALE_SESSION_MS, sweepStaleSessions } from '../src/index.js';
import { CONTENT, startBa } from './ba-harness.js';

const status = (h: Awaited<ReturnType<typeof startBa>>, id: string) =>
  (
    h.fx.raw.prepare('SELECT status FROM analysis_sessions WHERE id = ?').get(id) as {
      status: string;
    }
  ).status;

describe('start_session', () => {
  it('creates a running session over runs of the portal', async () => {
    const h = await startBa();
    const out = await h.must('start_session', { portal_id: h.fx.portalId, run_ids: [h.fx.runId] });
    expect(out).toMatchObject({
      portal_id: h.fx.portalId,
      status: 'running',
      run_ids: [h.fx.runId],
      passes: [],
      resumed: false,
      pending_feedback: { rejections: 0, comments: 0, confirmations: 0, followups_changed: 0 },
    });
    expect(status(h, out.session_id)).toBe('running');
    expect(
      h.fx.raw
        .prepare('SELECT run_id FROM analysis_session_runs WHERE session_id = ?')
        .all(out.session_id),
    ).toEqual([{ run_id: h.fx.runId }]);
  });

  it('refuses a run of another portal (PORTAL_MISMATCH) and an unknown run (RUN_NOT_FOUND)', async () => {
    const h = await startBa();
    const mismatch = await h.refused('start_session', {
      portal_id: h.fx.portalId,
      run_ids: [h.fx.runId, h.fx.otherRunId],
    });
    expect(mismatch).toMatchObject({ code: 'PORTAL_MISMATCH', run_id: h.fx.otherRunId });
    const unknown = await h.refused('start_session', {
      portal_id: h.fx.portalId,
      run_ids: ['no-such-run'],
    });
    expect(unknown.code).toBe('RUN_NOT_FOUND');
    expect(h.fx.raw.prepare('SELECT COUNT(*) AS n FROM analysis_sessions').get()).toEqual({ n: 0 });
  });

  it('needs at least one run', async () => {
    const h = await startBa();
    expect((await h.refused('start_session', { portal_id: h.fx.portalId, run_ids: [] })).code).toBe(
      'SCHEMA_INVALID',
    );
  });

  it('resumes an interrupted session, keeps its passes and may add runs', async () => {
    const h = await startBa();
    const id = await h.session();
    await h.must('record_pass', { session_id: id, pass: 'inventory', summary: '4 screens.' });
    h.fx.raw.prepare("UPDATE analysis_sessions SET status = 'interrupted' WHERE id = ?").run(id);

    // Writes are refused until it is resumed.
    expect(
      (await h.refused('record_pass', { session_id: id, pass: 'capabilities', summary: 'x' })).code,
    ).toBe('SESSION_NOT_ACTIVE');

    const later = h.fx.addRun();
    const out = await h.must('start_session', {
      portal_id: h.fx.portalId,
      run_ids: [later.runId],
      resume_session_id: id,
    });
    expect(out).toMatchObject({ session_id: id, resumed: true, passes: ['inventory'] });
    expect(out.run_ids.sort()).toEqual([h.fx.runId, later.runId].sort());
    expect(status(h, id)).toBe('running');
  });

  it('does not resume a completed or unknown session, or one of another portal', async () => {
    const h = await startBa();
    const id = await h.session();
    await h.must('record_pass', { session_id: id, pass: 'synthesis', summary: 'Done.' });
    await h.must('finish_session', { session_id: id, summary: 'Documented 0 records.', gaps: [] });
    const args = { portal_id: h.fx.portalId, run_ids: [h.fx.runId] };
    expect((await h.refused('start_session', { ...args, resume_session_id: id })).code).toBe(
      'SESSION_NOT_ACTIVE',
    );
    expect((await h.refused('start_session', { ...args, resume_session_id: 'nope' })).code).toBe(
      'SESSION_NOT_ACTIVE',
    );

    const open = await h.session();
    expect(
      (
        await h.refused('start_session', {
          portal_id: h.fx.otherPortalId,
          run_ids: [h.fx.otherRunId],
          resume_session_id: open,
        })
      ).code,
    ).toBe('PORTAL_MISMATCH');
  });
});

describe('record_pass and finish_session', () => {
  it('appends passes in the order they are recorded', async () => {
    const h = await startBa();
    const id = await h.session();
    await h.must('record_pass', { session_id: id, pass: 'inventory', summary: '4 screens.' });
    const out = await h.must('record_pass', {
      session_id: id,
      pass: 'capabilities',
      summary: '2 capabilities.',
    });
    expect(out.passes).toEqual(['inventory', 'capabilities']);
    const stored = JSON.parse(
      (
        h.fx.raw.prepare('SELECT passes_json FROM analysis_sessions WHERE id = ?').get(id) as {
          passes_json: string;
        }
      ).passes_json,
    );
    expect(stored.map((p: { pass: string }) => p.pass)).toEqual(['inventory', 'capabilities']);
    expect(stored[0]).toMatchObject({ summary: '4 screens.' });
    expect(stored[0].completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('lists the form fields no data item names when the data pass is recorded (F-21@034)', async () => {
    const h = await startBa();
    const id = await h.session();
    h.fx.raw.prepare('UPDATE forms SET fields_json = ? WHERE id = ?').run(
      JSON.stringify([
        { name: 'kod_pocztowy', type: 'text', label: 'Kod pocztowy' },
        { name: 'zakres', type: 'radio', label: 'Tylko OC' },
        { name: 'zakres', type: 'radio', label: 'OC + AC' },
        { name: 'token', type: 'hidden', label: 'token' },
        { name: 'go', type: 'submit', label: 'Dalej' },
      ]),
      h.fx.forms.vehicle,
    );
    const data = () => h.must('record_pass', { session_id: id, pass: 'data', summary: 'Data.' });
    const first = await data();
    expect(first.warnings).toHaveLength(1);
    expect(first.warnings[0]).toContain('2 form field(s)');
    expect(first.warnings[0]).toContain('"Kod pocztowy"');
    expect(first.warnings[0]).toContain('the radio group with "Tylko OC", "OC + AC"');
    const item = (name: string, allowed?: string[]) =>
      h.must('create_record', {
        session_id: id,
        kind: 'data_item',
        confidence: 'observed',
        content: {
          title: name,
          name_verbatim: name,
          lang: 'pl',
          name_en: name,
          data_type: 'string',
          constraints: allowed ? { allowed_values: allowed } : {},
          seen_in: [{ kind: 'form', target_id: h.fx.forms.vehicle }],
        },
        evidence: [{ target_kind: 'form', target_id: h.fx.forms.vehicle }],
      });
    await item('Kod pocztowy');
    await item('Zakres', ['Tylko OC', 'OC + AC']);
    expect((await data()).warnings).toBeUndefined();
    // other passes are not checked
    const other = await h.must('record_pass', { session_id: id, pass: 'nfr', summary: 'x' });
    expect(other.warnings).toBeUndefined();
  });

  it('lists the limits the pages state that no business rule states, after rules and synthesis (spec 045)', async () => {
    const h = await startBa();
    const id = await h.session();
    const form = h.fx.raw
      .prepare('SELECT state_id, evidence_ref FROM forms WHERE id = ?')
      .get(h.fx.forms.vehicle) as { state_id: string; evidence_ref: string };
    h.fx.raw
      .prepare('UPDATE forms SET fields_json = ? WHERE id = ?')
      .run(
        JSON.stringify([{ name: 'rok', type: 'number', label: 'Rok produkcji' }]),
        h.fx.forms.vehicle,
      );
    writeFileSync(
      h.fx.evidence.resolve(form.evidence_ref),
      [
        '- banner:',
        '  - paragraph: Not in main.',
        '- main:',
        '  - form "Pojazd":',
        '    - paragraph:',
        '      - text: Rok produkcji',
        '      - spinbutton "Rok produkcji"',
        '      - text: Od 1990 do bieżącego roku.',
        '  - paragraph: Wybierz dwa różne produkty.',
      ].join('\n'),
    );
    const probe = (text: string) =>
      h.fx.raw
        .prepare(
          `INSERT INTO probe_outcomes (id, run_id, from_state_id, probe_id, probe_group, target,
             inputs_json, path_json, outcome_kind, messages_json, evidence_ref, created_at)
           VALUES (?, ?, ?, 'range-below', 'validation', 'Rok produkcji', '[]', '{}', 'validation', ?, ?, ?)`,
        )
        .run(
          `po-${text.length}`,
          h.fx.runId,
          form.state_id,
          JSON.stringify([{ field: 'Rok produkcji', text, source: 'native' }]),
          form.evidence_ref,
          '2026-10-22T00:00:00.000Z',
        );
    probe('Value must be greater than or equal to 1990.');
    probe('Please fill out this field.'); // required only: the data item says it
    const pass = async (p: string) => {
      const out = await h.must('record_pass', { session_id: id, pass: p, summary: 'x' });
      return (out.warnings as string[] | undefined)?.find((w) => w.includes('business_rule'));
    };
    const first = await pass('rules');
    expect(first).toContain('4 limit(s)');
    expect(first).toContain('give its ears form');
    expect(first).toContain('"Podaj telefon lub e-mail." (E-mail) on /kontakt'); // the fixture's contact form
    expect(first).toContain('"Value must be greater than or equal to 1990." (Rok produkcji)');
    expect(first).toContain('"Od 1990 do bieżącego roku." (Rok produkcji)');
    expect(first).toContain('"Wybierz dwa różne produkty."');
    expect(first).not.toContain('fill out');
    expect(first).not.toContain('Not in main');
    const rule = (statement: string) =>
      h.must('create_record', {
        session_id: id,
        kind: 'business_rule',
        confidence: 'observed',
        content: { title: 'Rule', statement, rule_type: 'constraint' },
        evidence: [{ target_kind: 'form', target_id: h.fx.forms.vehicle }],
      });
    // the field and every number of both texts: both are stated
    await rule('"Rok produkcji" must be 1990 or later.');
    const left = await pass('synthesis');
    expect(left).toContain('2 limit(s)');
    // a hint tied to no control needs the text and one of the form's controls
    await rule('Wybierz dwa różne produkty: the two products must differ.');
    expect(await pass('synthesis')).toContain('(about one of: "Rok produkcji")');
    await rule('"Rok produkcji" page: "Wybierz dwa różne produkty."');
    await rule('A contact request needs one of them: "Podaj telefon lub e-mail."');
    expect(await pass('synthesis')).toBeUndefined();
    expect(await pass('nfr')).toBeUndefined();
  });

  it('lists the terms the pages define that no glossary term names (F-21@034)', async () => {
    const h = await startBa();
    const id = await h.session();
    const { evidence_ref } = h.fx.raw
      .prepare('SELECT evidence_ref FROM state_observations WHERE run_id = ? LIMIT 1')
      .get(h.fx.runId) as { evidence_ref: string };
    writeFileSync(
      h.fx.evidence.resolve(evidence_ref),
      '- main:\n  - term: Autocasco (AC)\n  - definition: Dobrowolne.\n  - term: Składka\n  - definition: Kwota.\n',
    );
    const data = async () => {
      const out = await h.must('record_pass', { session_id: id, pass: 'data', summary: 'Data.' });
      return (out.warnings as string[]).find((w) => w.includes('glossary_term'));
    };
    expect(await data()).toContain('2 term(s) the pages define');
    await h.must('create_record', {
      session_id: id,
      kind: 'glossary_term',
      confidence: 'observed',
      content: CONTENT.glossary_term, // "Autocasco (AC)"
      evidence: [{ target_kind: 'form', target_id: h.fx.forms.vehicle }],
    });
    const left = await data();
    expect(left).toContain('1 term(s)');
    expect(left).toContain('"Składka"');
    expect(left).not.toContain('Autocasco');
  });

  it('refuses an unknown pass and a summary carrying personal data', async () => {
    const h = await startBa();
    const id = await h.session();
    expect(
      (await h.refused('record_pass', { session_id: id, pass: 'review', summary: 'x' })).code,
    ).toBe('SCHEMA_INVALID');
    expect(
      (
        await h.refused('record_pass', {
          session_id: id,
          pass: 'inventory',
          summary: 'Asked jan.kowalski@example.com about it.',
        })
      ).code,
    ).toBe('PII_SUSPECTED');
  });

  it('refuses finish_session before the synthesis pass (SESSION_INCOMPLETE)', async () => {
    const h = await startBa();
    const id = await h.session();
    await h.must('record_pass', { session_id: id, pass: 'inventory', summary: '4 screens.' });
    const error = await h.refused('finish_session', { session_id: id, summary: 's', gaps: [] });
    expect(error.code).toBe('SESSION_INCOMPLETE');
    expect(error.missing).toContain('synthesis');
    expect(status(h, id)).toBe('running');
  });

  it('completes the session with its summary and gaps', async () => {
    const h = await startBa();
    const id = await h.session();
    await h.must('record_pass', { session_id: id, pass: 'synthesis', summary: 'Checked links.' });
    const out = await h.must('finish_session', {
      session_id: id,
      summary: 'Documented the guest screens.',
      gaps: ['Calculator steps after "Dalej" were not mapped.'],
    });
    expect(out).toMatchObject({ session_id: id, status: 'completed', records_written: 0 });
    expect(
      h.fx.raw
        .prepare(
          'SELECT status, summary, gaps_json, ended_at IS NOT NULL AS ended FROM analysis_sessions WHERE id = ?',
        )
        .get(id),
    ).toEqual({
      status: 'completed',
      summary: 'Documented the guest screens.',
      gaps_json: '["Calculator steps after \\"Dalej\\" were not mapped."]',
      ended: 1,
    });
  });

  it('refuses every write to a completed or unknown session (SESSION_NOT_ACTIVE)', async () => {
    const h = await startBa();
    const id = await h.session();
    await h.must('record_pass', { session_id: id, pass: 'synthesis', summary: 'Done.' });
    await h.must('finish_session', { session_id: id, summary: 'Done.', gaps: [] });
    const evidence = [{ target_kind: 'state', target_id: h.fx.states.vehicle }];
    for (const session_id of [id, 'no-such-session']) {
      for (const [name, args] of [
        ['record_pass', { pass: 'nfr', summary: 'x' }],
        ['finish_session', { summary: 'x', gaps: [] }],
        [
          'create_record',
          { kind: 'screen', content: CONTENT.screen, confidence: 'observed', evidence },
        ],
        [
          'revise_record',
          {
            key: 'SCR-001',
            base_rev: 1,
            content: CONTENT.screen,
            confidence: 'observed',
            evidence,
            change_note: 'x',
          },
        ],
        ['withdraw_record', { key: 'SCR-001', base_rev: 1, change_note: 'x', evidence }],
        ['address_crawler_question', { open_question_id: h.fx.openQuestions[0], by_key: 'OQ-001' }],
      ] as const) {
        const error = await h.refused(name, { session_id, ...args });
        expect(error.code, `${name} on ${session_id}`).toBe('SESSION_NOT_ACTIVE');
      }
    }
  });
});

describe('stale session sweep (server start)', () => {
  it('interrupts running sessions idle for more than 24 h and leaves the rest', async () => {
    const h = await startBa();
    const idle = await h.session();
    const active = await h.session();
    const done = await h.session();
    await h.must('record_pass', { session_id: done, pass: 'synthesis', summary: 'Done.' });
    await h.must('finish_session', { session_id: done, summary: 'Done.', gaps: [] });

    const old = new Date(Date.now() - STALE_SESSION_MS - 60_000).toISOString();
    h.fx.raw
      .prepare('UPDATE analysis_sessions SET started_at = ? WHERE id IN (?, ?, ?)')
      .run(old, idle, active, done);
    // `active` started long ago but wrote a pass just now.
    await h.must('record_pass', { session_id: active, pass: 'inventory', summary: '4 screens.' });

    expect(sweepStaleSessions(h.ctx)).toEqual([idle]);
    expect(status(h, idle)).toBe('interrupted');
    expect(status(h, active)).toBe('running');
    expect(status(h, done)).toBe('completed');
    expect(sweepStaleSessions(h.ctx)).toEqual([]);
  });

  it('counts a record write as activity', async () => {
    const h = await startBa();
    const id = await h.session();
    await h.must('create_record', {
      session_id: id,
      kind: 'screen',
      content: CONTENT.screen,
      confidence: 'observed',
      evidence: [{ target_kind: 'state', target_id: h.fx.states.vehicle }],
    });
    const old = new Date(Date.now() - STALE_SESSION_MS - 60_000).toISOString();
    h.fx.raw.prepare('UPDATE analysis_sessions SET started_at = ? WHERE id = ?').run(old, id);
    expect(sweepStaleSessions(h.ctx)).toEqual([]);
    // A day after that write it is stale.
    expect(sweepStaleSessions(h.ctx, new Date(Date.now() + STALE_SESSION_MS + 60_000))).toEqual([
      id,
    ]);
  });
});

describe('start_session: the narrow step (spec 030 R-65, field SQ-8)', () => {
  /** Two more runs of the portal, recorded as traces. */
  const traceRuns = (h: Awaited<ReturnType<typeof startBa>>): string[] => {
    const ids = ['trace-a', 'trace-b'];
    for (const id of ids)
      h.fx.raw.exec(
        `CREATE TEMP TABLE t AS SELECT * FROM runs WHERE id = '${h.fx.runId}';
         UPDATE t SET id = '${id}', mode = 'trace';
         INSERT INTO runs SELECT * FROM t; DROP TABLE t;`,
      );
    return ids;
  };

  it('warns when several trace runs are documented with no grouping or scope', async () => {
    const h = await startBa();
    const runs = traceRuns(h);
    const out = await h.must('start_session', { portal_id: h.fx.portalId, run_ids: runs });
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toContain('2 trace runs are not grouped');
  });

  it('says nothing for map runs only', async () => {
    const h = await startBa();
    const out = await h.must('start_session', { portal_id: h.fx.portalId, run_ids: [h.fx.runId] });
    expect(out.warnings).toBeUndefined();
  });
});
