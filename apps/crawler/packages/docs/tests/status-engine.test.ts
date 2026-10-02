import { describe, expect, it } from 'vitest';
import { DocsError } from '../src/errors.js';
import {
  applyStatusEvent,
  type RevisionState,
  type StatusEvent,
  type StatusResult,
} from '../src/status-engine.js';

const rev = (
  rev_no: number,
  status: RevisionState['status'],
  over: Partial<RevisionState> = {},
): RevisionState => ({
  rev_no,
  status,
  change: rev_no === 1 ? 'create' : 'revise',
  title: `title ${rev_no}`,
  ...over,
});
const revise = (rev_no: number, title = `title ${rev_no}`): StatusEvent => ({
  type: 'revision',
  rev_no,
  change: rev_no === 1 ? 'create' : 'revise',
  title,
});
const statuses = (r: StatusResult) => r.revisions.map((x) => x.status);
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof DocsError) return e.code;
    throw e;
  }
  return 'no error';
};

describe('status engine: new revisions', () => {
  it('makes the first revision a draft', () => {
    const r = applyStatusEvent([], revise(1, 'Reject invalid postcode'));
    expect(statuses(r)).toEqual(['draft']);
    expect(r.changes).toEqual([]);
    expect(r.record).toEqual({
      latest_rev: 1,
      confirmed_rev: null,
      title: 'Reject invalid postcode',
      withdrawn: 0,
    });
  });

  it('supersedes the previous latest draft', () => {
    const r = applyStatusEvent([rev(1, 'draft')], revise(2));
    expect(statuses(r)).toEqual(['superseded', 'draft']);
    expect(r.changes).toEqual([{ rev_no: 1, status: 'superseded' }]);
    expect(r.record).toMatchObject({ latest_rev: 2, confirmed_rev: null, title: 'title 2' });
  });

  it('leaves a confirmed revision confirmed while a newer draft exists', () => {
    const r = applyStatusEvent([rev(1, 'confirmed')], revise(2));
    expect(statuses(r)).toEqual(['confirmed', 'draft']);
    expect(r.changes).toEqual([]);
    expect(r.record).toMatchObject({ latest_rev: 2, confirmed_rev: 1 });
  });

  it('leaves a rejected revision rejected', () => {
    const r = applyStatusEvent([rev(1, 'rejected')], revise(2));
    expect(statuses(r)).toEqual(['rejected', 'draft']);
    expect(r.changes).toEqual([]);
  });

  it('refuses a revision number that does not follow the latest', () => {
    expect(code(() => applyStatusEvent([rev(1, 'draft'), rev(2, 'draft')], revise(2)))).toBe(
      'STALE_REVISION',
    );
    expect(code(() => applyStatusEvent([rev(1, 'draft')], revise(3)))).toBe('STALE_REVISION');
  });

  it('marks the record withdrawn when the latest revision is a withdraw, and not after a later revise', () => {
    const withdrawn = applyStatusEvent([rev(1, 'confirmed')], {
      type: 'revision',
      rev_no: 2,
      change: 'withdraw',
      title: 'title 1',
    });
    expect(withdrawn.record).toMatchObject({ withdrawn: 1, latest_rev: 2, confirmed_rev: 1 });
    const back = applyStatusEvent(withdrawn.revisions, revise(3));
    expect(back.record.withdrawn).toBe(0);
  });
});

describe('status engine: reviews', () => {
  it('confirms the latest draft and supersedes the older confirmed revision', () => {
    const r = applyStatusEvent([rev(1, 'confirmed'), rev(2, 'superseded'), rev(3, 'draft')], {
      type: 'review',
      action: 'confirm',
      rev_no: 3,
    });
    expect(statuses(r)).toEqual(['superseded', 'superseded', 'confirmed']);
    expect(r.changes).toEqual([
      { rev_no: 1, status: 'superseded' },
      { rev_no: 3, status: 'confirmed' },
    ]);
    expect(r.record).toMatchObject({ latest_rev: 3, confirmed_rev: 3 });
  });

  it('rejects the latest draft when a reason is given; the confirmed baseline stays', () => {
    const r = applyStatusEvent([rev(1, 'confirmed'), rev(2, 'draft')], {
      type: 'review',
      action: 'reject',
      rev_no: 2,
      text: 'The limit is 75, not 70.',
    });
    expect(statuses(r)).toEqual(['confirmed', 'rejected']);
    expect(r.record).toMatchObject({ latest_rev: 2, confirmed_rev: 1 });
  });

  it('refuses a reject without text', () => {
    for (const text of [undefined, null, '', '   '])
      expect(
        code(() =>
          applyStatusEvent([rev(1, 'draft')], {
            type: 'review',
            action: 'reject',
            rev_no: 1,
            text,
          }),
        ),
      ).toBe('SCHEMA_INVALID');
  });

  it('refuses confirm and reject on anything but the latest draft', () => {
    const revs = [rev(1, 'superseded'), rev(2, 'draft')];
    expect(
      code(() => applyStatusEvent(revs, { type: 'review', action: 'confirm', rev_no: 1 })),
    ).toBe('STALE_REVISION');
    expect(
      code(() =>
        applyStatusEvent(revs, { type: 'review', action: 'reject', rev_no: 1, text: 'no' }),
      ),
    ).toBe('STALE_REVISION');
    // The latest revision was already decided.
    expect(
      code(() =>
        applyStatusEvent([rev(1, 'confirmed')], { type: 'review', action: 'confirm', rev_no: 1 }),
      ),
    ).toBe('STALE_REVISION');
    expect(
      code(() =>
        applyStatusEvent([rev(1, 'rejected')], { type: 'review', action: 'confirm', rev_no: 1 }),
      ),
    ).toBe('STALE_REVISION');
  });

  it('reports the latest revision and its status with STALE_REVISION', () => {
    try {
      applyStatusEvent([rev(1, 'superseded'), rev(2, 'draft')], {
        type: 'review',
        action: 'confirm',
        rev_no: 1,
      });
      expect.unreachable();
    } catch (e) {
      expect((e as DocsError).details).toEqual({ latest_rev: 2, status: 'draft' });
    }
  });

  it('a comment changes nothing, on any revision', () => {
    const revs = [rev(1, 'confirmed'), rev(2, 'draft')];
    for (const rev_no of [1, 2]) {
      const r = applyStatusEvent(revs, {
        type: 'review',
        action: 'comment',
        rev_no,
        text: 'See the FAQ page.',
      });
      expect(r.changes).toEqual([]);
      expect(statuses(r)).toEqual(['confirmed', 'draft']);
      expect(r.record).toEqual({ latest_rev: 2, confirmed_rev: 1, title: 'title 2', withdrawn: 0 });
    }
  });

  it('refuses a comment without text and a review of an unknown revision', () => {
    expect(
      code(() =>
        applyStatusEvent([rev(1, 'draft')], { type: 'review', action: 'comment', rev_no: 1 }),
      ),
    ).toBe('SCHEMA_INVALID');
    expect(
      code(() =>
        applyStatusEvent([rev(1, 'draft')], { type: 'review', action: 'confirm', rev_no: 4 }),
      ),
    ).toBe('UNKNOWN_REF');
  });

  it('does not mutate its input', () => {
    const revs = [rev(1, 'draft')];
    applyStatusEvent(revs, revise(2));
    expect(revs[0]!.status).toBe('draft');
  });
});
