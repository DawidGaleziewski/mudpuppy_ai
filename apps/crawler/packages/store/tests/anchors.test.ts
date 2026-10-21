import { describe, expect, it } from 'vitest';
import { anchorReviewsOf } from '../src/index.js';
import { SUBMIT, T, withRule } from './seed-threshold.js';

// Spec 039 T074 (design § 15): which anchored amendments need a person after a reconcile.

describe('anchorReviewsOf', () => {
  it('flags an element no longer seen and a retired screen; leaves the rest', async () => {
    const o = withRule(18);
    const r = o.raw;
    const screenOf = (state: string) =>
      (
        r
          .prepare(
            'SELECT screen_id FROM screen_members WHERE state_id = ? AND to_model_version IS NULL',
          )
          .get(state) as { screen_id: string }
      ).screen_id;
    const amend = (n: number, state: string, element: string | null) => {
      r.prepare('INSERT INTO entity_refs (id, screen_id, element_key) VALUES (?, ?, ?)').run(
        `ref${n}`,
        screenOf(state),
        element,
      );
      r.prepare('INSERT INTO entity_refs (id, state_id) VALUES (?, ?)').run(`target${n}`, state);
      r.prepare(
        `INSERT INTO amendments (id, key, portal_id, ref_id, kind, text, author, status,
           created_at, anchor_ref_id) VALUES (?, ?, 'ins', ?, 'note', 'n', 'Anna', 'active', ?, ?)`,
      ).run(`a${n}`, `AMD-00${n}`, `target${n}`, T(700), `ref${n}`);
    };
    amend(1, 'form', SUBMIT); // the submit button
    amend(2, 'price', null); // the whole price page
    amend(3, 'exit', null); // the refusal page, untouched
    expect(anchorReviewsOf(r, 'ins')).toEqual([]);

    r.prepare("UPDATE action_classes SET status = 'not_seen_since' WHERE element_key = ?").run(
      SUBMIT,
    );
    const version = (
      r
        .prepare("SELECT id FROM model_versions WHERE portal_id = 'ins' ORDER BY seq DESC")
        .get() as {
        id: string;
      }
    ).id;
    r.prepare(
      `INSERT INTO screen_lineage (id, model_version_id, kind, from_screen_id, to_screen_id, members_moved)
       VALUES ('l1', ?, 'retire', ?, NULL, 0)`,
    ).run(version, screenOf('price'));
    expect(anchorReviewsOf(r, 'ins').map((x) => [x.id, x.reason])).toEqual([
      ['a1', 'element_gone'],
      ['a2', 'screen_moved'],
    ]);
    await o.close();
  });
});
