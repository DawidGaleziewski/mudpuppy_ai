import { DocKind, type RelationType } from '@pathfinder/core';

/** `any`: every kind may be the source. `same`: the target must be of the source's kind. */
interface Rule {
  from: readonly DocKind[] | 'any';
  to: readonly DocKind[] | 'same';
}

/** The allowed (from kind, type, to kind) triples (tasks.md T013, data-model.md "Relation"). */
export const RELATION_RULES: Record<RelationType, readonly Rule[]> = {
  contains: [{ from: ['capability'], to: ['process', 'screen'] }],
  describes: [{ from: ['use_case'], to: ['process'] }],
  refines: [{ from: ['requirement'], to: ['use_case', 'capability'] }],
  enforces: [{ from: ['requirement'], to: ['business_rule'] }],
  appears_on: [{ from: ['data_item'], to: ['screen'] }],
  uses_term: [{ from: 'any', to: ['glossary_term'] }],
  synonym_of: [{ from: ['glossary_term'], to: ['glossary_term'] }],
  answers: [{ from: ['assumption', 'requirement', 'business_rule'], to: ['open_question'] }],
  depends_on: [{ from: 'any', to: 'same' }],
};

export type RelationCheck =
  | { ok: true }
  | {
      ok: false;
      code: 'RELATION_NOT_ALLOWED';
      message: string;
      details: {
        from_kind: DocKind;
        type: RelationType;
        to_kind: DocKind;
        /** What `type` does allow, as `from type to` phrases. */
        allowed: string[];
      };
    };

const describeRule = (type: RelationType, r: Rule): string =>
  `${r.from === 'any' ? 'any kind' : r.from.join('|')} ${type} ${r.to === 'same' ? 'a record of the same kind' : r.to.join('|')}`;

/** Whether a record of `fromKind` may assert `type` towards a record of `toKind`. */
export function isAllowed(fromKind: DocKind, type: RelationType, toKind: DocKind): RelationCheck {
  const rules = RELATION_RULES[type];
  const ok = rules.some(
    (r) =>
      (r.from === 'any' || r.from.includes(fromKind)) &&
      (r.to === 'same' ? toKind === fromKind : r.to.includes(toKind)),
  );
  if (ok) return { ok: true };
  const allowed = rules.map((r) => describeRule(type, r));
  return {
    ok: false,
    code: 'RELATION_NOT_ALLOWED',
    message: `${fromKind} ${type} ${toKind} is not an allowed relation; allowed: ${allowed.join('; ')}`,
    details: { from_kind: fromKind, type, to_kind: toKind, allowed },
  };
}
