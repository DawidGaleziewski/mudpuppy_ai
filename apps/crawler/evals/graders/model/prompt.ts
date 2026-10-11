/**
 * The two texts of one judge call (spec 017 FR-003, FR-004, research R4): the system prompt (the
 * judge's whole instructions, replacing Claude Code's) and the user message with exactly one item
 * and one record. Nothing else reaches the judge: no code score, no transcript.
 */
import type { JudgeDefinition, JudgeExample, Pair } from './definition.js';

const block = (tag: string, text: string) => `<${tag}>\n${text.trim()}\n</${tag}>`;

function example(e: JudgeExample, n: number): string {
  return block(
    `example_${n}`,
    [
      block('item', e.item),
      block('record', e.record),
      `Reason: ${e.reason}`,
      `Verdict: ${e.verdict}`,
    ].join('\n'),
  );
}

export function systemPrompt(def: JudgeDefinition): string {
  const parts = [
    'You are a strict grader. You compare one documentation record, written by an analyst about ' +
      'a web portal, with one ground-truth item about that portal, and answer one question.',
    `Question: ${def.question}`,
    `Answer pass when: ${def.pass}`,
    `Answer fail when: ${def.fail}`,
    'If the record does not clearly state it, answer fail. Answer unknown only when the record ' +
      'lacks the information needed to decide at all.',
    'Judge only what the record says; do not use outside knowledge to fill gaps.',
    'Give a one-sentence reason first, then the verdict.',
  ];
  if (def.examples.length > 0)
    parts.push('Examples, with the reason and verdict expected:', ...def.examples.map(example));
  return parts.join('\n\n');
}

export function userMessage(pair: Pair): string {
  return [block('item', pair.item), block('record', pair.record.text)].join('\n\n');
}
