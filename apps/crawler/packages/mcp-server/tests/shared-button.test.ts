import { describe, expect, it } from 'vitest';
import { newId, nowIso } from '@pathfinder/core';
import type { ServerContext } from '../src/context.js';
import { inferSharedButton, sharedButtonKey } from '../src/services/shared-button.js';
import { makeCtx, REF, seedRun } from './helpers.js';

// spec 038, R-58 (3): the bank's banner "Wyloguj" was clicked from 14 states, all to one page.
const button = (container: string, extra: object = {}) =>
  JSON.stringify({
    role: 'button',
    accessible_name: 'Wyloguj',
    locators: [
      { kind: 'role', value: 'role=button[name="Wyloguj"]', rank: 0 },
      { kind: 'container', value: container, rank: 2 },
    ],
    page_url: 'https://bank.test/konto',
    ...extra,
  });
const BANNER = 'banner > button "Wyloguj"';

describe('sharedButtonKey', () => {
  it('is the container path of a plain button in the banner, navigation or footer', () => {
    expect(sharedButtonKey(button(BANNER))).toBe(BANNER);
    expect(sharedButtonKey(button('navigation "Menu" > button "Wyloguj"'))).not.toBeNull();
    expect(sharedButtonKey(button('contentinfo > button "Wyloguj"'))).not.toBeNull();
  });

  it('is null in the page body, for links, form buttons, inputs and bad JSON', () => {
    expect(sharedButtonKey(button('main > button "Wyloguj"'))).toBeNull();
    expect(sharedButtonKey(button(BANNER, { role: 'link' }))).toBeNull();
    expect(sharedButtonKey(button(BANNER, { form: { method: 'post' } }))).toBeNull();
    expect(sharedButtonKey(button(BANNER, { input: 'fill' }))).toBeNull();
    expect(sharedButtonKey('{nope')).toBeNull();
  });
});

function state(ctx: ServerContext, run: string, tag: string): string {
  const id = newId();
  ctx.raw
    .prepare(
      `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title,
         evidence_ref, confidence, stabilization, first_seen_run, created_at)
       VALUES (?, 'shop', ?, ?, '/', ?, ?, 'observed', 'settled', ?, ?)`,
    )
    .run(id, tag.repeat(64).slice(0, 64), id, tag, REF, run, nowIso());
  return id;
}

function click(ctx: ServerContext, run: string, from: string, to: string | null): void {
  ctx.raw
    .prepare(
      `INSERT INTO transitions (id, run_id, from_state, to_state, action_json, safety_class, status,
         evidence_ref, confidence, error, stabilization, created_at)
       VALUES (?, ?, ?, ?, ?, 'destructive', 'executed', ?, 'observed', NULL, 'settled', ?)`,
    )
    .run(newId(), run, from, to, button(BANNER), REF, nowIso());
}

function item(ctx: ServerContext, run: string, at: string) {
  const id = newId();
  const actionId = newId();
  const action_json = button(BANNER);
  ctx.raw
    .prepare(
      `INSERT INTO actions (id, run_id, state_id, role, accessible_name, action_json, safety_class,
         allowed, skip_reason, created_at) VALUES (?, ?, ?, 'button', 'Wyloguj', ?, 'destructive', 1, NULL, ?)`,
    )
    .run(actionId, run, at, action_json, nowIso());
  ctx.raw
    .prepare(
      `INSERT INTO frontier (id, run_id, state_id, action_id, action_json, safety_class, status,
         priority, depth, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'destructive', 'pending', 0, 1, NULL, ?, ?)`,
    )
    .run(id, run, at, actionId, action_json, nowIso(), nowIso());
  return {
    id,
    run_id: run,
    state_id: at,
    action_id: actionId,
    action_json,
    safety_class: 'destructive',
  };
}

const frontier = (ctx: ServerContext, id: string) =>
  ctx.raw.prepare('SELECT status, reason FROM frontier WHERE id = ?').get(id) as {
    status: string;
    reason: string | null;
  };

describe('inferSharedButton', () => {
  it('settles the button on a new page from earlier clicks that all landed on one page', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const [home, a, b, c] = ['h', 'a', 'b', 'c'].map((t) => state(ctx, run, t));
    click(ctx, run, a!, home!);
    click(ctx, run, b!, home!);
    const row = item(ctx, run, c!);
    expect(await inferSharedButton(ctx, row)).toBe(true);
    expect(frontier(ctx, row.id)).toMatchObject({ status: 'done' });
    expect(frontier(ctx, row.id).reason).toMatch(/^shared_button: /);
    const edge = ctx.raw
      .prepare(
        "SELECT to_state, confidence FROM transitions WHERE from_state = ? AND confidence = 'inferred'",
      )
      .get(c) as { to_state: string; confidence: string };
    expect(edge).toEqual({ to_state: home, confidence: 'inferred' });
  });

  it('infers nothing before a first click, or when clicks disagree or stay on their page', async () => {
    const ctx = await makeCtx();
    const run = await seedRun(ctx);
    const [home, other, a, b, c] = ['h', 'o', 'a', 'b', 'c'].map((t) => state(ctx, run, t));
    const first = item(ctx, run, c!);
    expect(await inferSharedButton(ctx, first)).toBe(false);
    click(ctx, run, a!, home!);
    click(ctx, run, b!, other!);
    expect(await inferSharedButton(ctx, first)).toBe(false);

    const ctx2 = await makeCtx();
    const run2 = await seedRun(ctx2);
    const [x, y] = ['x', 'y'].map((t) => state(ctx2, run2, t));
    click(ctx2, run2, x!, x!); // a menu toggle: the page stays
    expect(await inferSharedButton(ctx2, item(ctx2, run2, y!))).toBe(false);
    expect(frontier(ctx, first.id)).toMatchObject({ status: 'pending' });
  });
});
