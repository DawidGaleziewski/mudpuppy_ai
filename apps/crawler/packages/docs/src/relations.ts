import { DocKind, type RelationType } from '@pathfinder/docs-model';

/** `any`: every kind may be the source. `same`: the target must be of the source's kind. */
interface Rule {
  from: readonly DocKind[] | 'any';
  to: readonly DocKind[] | 'same';
}

/** The allowed (from kind, type, to kind) triples (tasks.md T013, data-model.md "Relation"). */
export const RELATION_RULES: Record<RelationType, readonly Rule[]> = {
  // R-51 (owner 2026-10-15): a process contains the screens it passes through, a glossary term
  // appears on the screens that show it (spec 025 F-15, F-05). Mirrored by migration 0019.
  contains: [
    { from: ['capability'], to: ['process', 'screen'] },
    { from: ['process'], to: ['screen'] },
  ],
  describes: [{ from: ['use_case'], to: ['process'] }],
  refines: [{ from: ['requirement'], to: ['use_case', 'capability'] }],
  enforces: [{ from: ['requirement'], to: ['business_rule'] }],
  appears_on: [{ from: ['data_item', 'glossary_term'], to: ['screen'] }],
  uses_term: [{ from: 'any', to: ['glossary_term'] }],
  synonym_of: [{ from: ['glossary_term'], to: ['glossary_term'] }],
  answers: [{ from: ['assumption', 'requirement', 'business_rule'], to: ['open_question'] }],
  // + an assumption or a use case resting on a rule (owner 2026-10-15, spec 029; migration 0020)
  depends_on: [
    { from: 'any', to: 'same' },
    { from: ['assumption', 'use_case'], to: ['business_rule'] },
  ],
  // spec 019 F-14: a rule applies on a screen; a question is about any record; a follow-up is
  // for the process, capability, screen or rule it would observe. Mirrored by migration 0014.
  applies_on: [{ from: ['business_rule'], to: ['screen'] }],
  asks_about: [{ from: ['open_question'], to: DocKind.options }],
  // + open_question and use_case: what the BA tried in the next trial (spec 019 F-16)
  follows_up: [
    {
      from: ['followup'],
      to: ['process', 'capability', 'screen', 'business_rule', 'open_question', 'use_case'],
    },
  ],
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
        /** The same type is allowed from `to_kind` to `from_kind`. */
        reverse_allowed?: true;
      };
    };

const describeRule = (type: RelationType, r: Rule): string =>
  `${r.from === 'any' ? 'any kind' : r.from.join('|')} ${type} ${r.to === 'same' ? 'a record of the same kind' : r.to.join('|')}`;

const permits = (type: RelationType, fromKind: DocKind, toKind: DocKind): boolean =>
  RELATION_RULES[type].some(
    (r) =>
      (r.from === 'any' || r.from.includes(fromKind)) &&
      (r.to === 'same' ? toKind === fromKind : r.to.includes(toKind)),
  );

/** Whether a record of `fromKind` may assert `type` towards a record of `toKind`. */
export function isAllowed(fromKind: DocKind, type: RelationType, toKind: DocKind): RelationCheck {
  if (permits(type, fromKind, toKind)) return { ok: true };
  const allowed = RELATION_RULES[type].map((r) => describeRule(type, r));
  // The BA sometimes writes a link from the wrong end (`glossary_term uses_term data_item`);
  // saying so turns the retry into the right relation (spec 019 F-16).
  const reverse = permits(type, toKind, fromKind)
    ? ` The reverse is allowed: write "${toKind} ${type} ${fromKind}" on the ${toKind} record.`
    : '';
  return {
    ok: false,
    code: 'RELATION_NOT_ALLOWED',
    message: `${fromKind} ${type} ${toKind} is not an allowed relation; allowed: ${allowed.join('; ')}.${reverse}`,
    details: {
      from_kind: fromKind,
      type,
      to_kind: toKind,
      allowed,
      ...(reverse ? { reverse_allowed: true } : {}),
    },
  };
}
