// Choices the live assistant asks (spec 075 FR-008, the R-96 spike): a drop-down for another
// portal, another data store, the persona to scan as, or the assistant's own options. A choice is a
// system message of its conversation (`tool_name` `workbench_choice`, the choice as JSON), so no
// migration is needed for the spike; the person's answer is the event turn that follows it.

import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@mudpuppy/core';
import { z } from 'zod';

export const CHOICE_TOOL = 'workbench_choice';

/** What `ask_choice` takes. Portal, store and persona options come from the server, not the model. */
export const AskChoiceShape = z
  .object({
    kind: z.enum(['portal', 'store', 'persona', 'answer']),
    question: z.string().trim().min(1).max(200),
    /** `answer` only: the assistant's options, 2–6. */
    options: z
      .array(z.object({ value: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(80) }))
      .min(2)
      .max(6)
      .optional(),
  })
  .strict();

export const AskChoiceInput = AskChoiceShape.refine((c) => (c.kind === 'answer') === (c.options !== undefined), {
    message: 'options are given for kind answer, and only for it',
  });
export type AskChoiceInput = z.infer<typeof AskChoiceInput>;

export interface StoredChoice extends AskChoiceInput {
  id: string;
  turn: number;
}

/** Keep the choice as a system message of the conversation (one write, under the write lock). */
export function storeChoice(
  raw: BetterSqlite3.Database,
  conversationId: string,
  turn: number,
  input: AskChoiceInput,
): StoredChoice {
  const choice: StoredChoice = { id: newId(), turn, ...input };
  raw
    .transaction(() => {
      const last = raw
        .prepare(`SELECT max(seq) AS seq FROM chat_messages WHERE conversation_id = ?`)
        .get(conversationId) as { seq: number | null };
      raw
        .prepare(
          `INSERT INTO chat_messages (id, conversation_id, seq, role, content, tool_name, error_ref, created_at)
           VALUES (?, ?, ?, 'system', ?, ?, NULL, ?)`,
        )
        .run(newId(), conversationId, (last.seq ?? -1) + 1, JSON.stringify(choice), CHOICE_TOOL, nowIso());
    })
    .immediate();
  return choice;
}

/** A conversation's choice by id, or null. */
export function choiceOf(raw: BetterSqlite3.Database, conversationId: string, id: string): StoredChoice | null {
  const rows = raw
    .prepare(`SELECT content FROM chat_messages WHERE conversation_id = ? AND tool_name = ?`)
    .all(conversationId, CHOICE_TOOL) as { content: string }[];
  for (const r of rows) {
    const c = JSON.parse(r.content) as StoredChoice;
    if (c.id === id) return c;
  }
  return null;
}

/** The event line of the person's answer. */
export function answerText(choice: StoredChoice, value: string, label: string): string {
  return `[event] The person answered "${choice.question}" (${choice.kind}): ${label} (${value}).`;
}
