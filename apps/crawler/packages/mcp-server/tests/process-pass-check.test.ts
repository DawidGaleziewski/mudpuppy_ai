import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isLoginWall, triggerName } from '../src/services/ba/process-pass-check.js';
import { startBa } from './ba-harness.js';

const WALL = [
  '- banner:',
  '  - link "Strona główna"',
  '  - link "Zaloguj się"',
  '- main:',
  '  - heading "Przedłuż polisę" [level=1]',
  '  - alert: Zaloguj się, aby zobaczyć tę stronę.',
  '  - paragraph:',
  '    - link "Przejdź do logowania"',
  '- contentinfo:',
  '  - link "Kontakt"',
].join('\n');

describe('isLoginWall (spec 080, R-97 (1))', () => {
  it('is a login prompt in main with few controls', () => {
    expect(isLoginWall(WALL)).toBe(true);
  });

  it('is not a page whose login link is only in the banner, or a busy page with one', () => {
    expect(isLoginWall(WALL.replace('link "Przejdź do logowania"', 'link "Wróć"'))).toBe(false);
    const busy = [
      '- main:',
      '  - link "Zaloguj się"',
      ...Array<string>(6).fill('  - link "Produkt"'),
    ];
    expect(isLoginWall(busy.join('\n'))).toBe(false);
  });
});

describe('triggerName', () => {
  const press = (name: string, container?: string) =>
    JSON.stringify({
      role: 'link',
      accessible_name: name,
      locators: container ? [{ kind: 'container', value: container }] : [],
    });
  it('names a body press, not a menu entry or a login link (D-1)', () => {
    expect(triggerName(press('Przedłuż polisę', 'main > list'))).toBe('Przedłuż polisę');
    expect(triggerName(press('Moje polisy', 'navigation "Menu" > list'))).toBeNull();
    expect(triggerName(press('Zaloguj się'))).toBeNull();
    expect(triggerName(press(''))).toBeNull();
  });
});

describe('record_pass processes: login-wall processes', () => {
  it('lists a wall a body link reaches until a process cites it', async () => {
    const h = await startBa();
    const id = await h.session();
    const { evidence_ref } = h.fx.raw
      .prepare('SELECT evidence_ref FROM state_observations WHERE run_id = ? AND state_id = ?')
      .get(h.fx.runId, h.fx.states.contact) as { evidence_ref: string };
    writeFileSync(h.fx.evidence.resolve(evidence_ref), WALL);
    const pass = async (p: string) => {
      const out = await h.must('record_pass', { session_id: id, pass: p, summary: 'x' });
      return (out.warnings as string[] | undefined)?.find((w) => w.includes('login wall'));
    };
    const first = await pass('processes');
    expect(first).toContain('1 screen(s) behind a login wall');
    expect(first).toContain('reached by "Kontakt"'); // the fixture's body link
    expect(await pass('inventory')).toBeUndefined();
    await h.must('create_record', {
      session_id: id,
      kind: 'process',
      confidence: 'observed',
      content: {
        title: 'Kontakt',
        goal: 'Contact the insurer',
        persona: 'guest',
        trigger: 'Link "Kontakt"',
        outcome: 'Stops at the login wall',
        observed_extent: 'until_boundary',
      },
      evidence: [{ target_kind: 'state', target_id: h.fx.states.contact }],
    });
    expect(await pass('synthesis')).toBeUndefined();
  });
});
