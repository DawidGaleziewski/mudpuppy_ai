// Amendment commands (R-30 T030; spec 022 M2, contracts/amendments-api.md): create, withdraw,
// re-anchor, dismiss, edit, restore. Every row passes the core Zod `Amendment` schema, and every
// change is a revision (amendment-revisions.ts): nothing is deleted or overwritten. The anchor
// (fingerprint, route template, screen and, for wireframe elements, `{key, role, name, roleIndex}`)
// is captured at write time so a later scan can tell what changed.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import {
  Layout,
  SECRETS,
  newId,
  nowIso,
  isEvidenceRef,
  type EvidenceStore,
} from '@mudpuppy/core';
import {
  Amendment,
  AmendmentAnchorElement,
  AmendmentKind,
  AmendmentTargetKind,
  type AmendmentRevision,
} from '@mudpuppy/chat-model';
import { type MudPuppyDb } from '@mudpuppy/store';
import { z } from 'zod';
import {
  checkBase,
  insertCreated,
  listRevisions,
  loadHead,
  writeRevision,
} from './amendment-revisions.js';
import { HttpError } from './http-error.js';

/** Largest attachment accepted, in bytes of file content. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const Author = z.string().trim().min(1).max(200).default('BA');
const BaseRev = z.number().int().min(1).optional();

export const AmendmentBody = z.object({
  kind: AmendmentKind,
  target_kind: AmendmentTargetKind,
  target_id: z.string().min(1).max(2_000),
  text: z.string().trim().min(1).max(50_000).optional(),
  scope_id: z.string().min(1).optional(),
  author: Author,
  attachment: z
    .object({
      name: z.string().trim().min(1).max(255),
      content_base64: z.string().min(1),
    })
    .optional(),
});
export type AmendmentBody = z.infer<typeof AmendmentBody>;

/** Re-anchor an amendment that needs it to a current target (FE-S02; was "re-apply", T033). */
export const ReapplyBody = z.object({
  target_kind: AmendmentTargetKind,
  target_id: z.string().min(1).max(2_000),
  /** Optional new wording; default keeps the text. */
  text: z.string().trim().min(1).max(50_000).optional(),
  author: Author,
  base_rev: BaseRev,
});
export type ReapplyBody = z.infer<typeof ReapplyBody>;

/** Withdraw or dismiss: who, and on which revision. */
export const DecideBody = z.object({ author: Author, base_rev: BaseRev });
export type DecideBody = z.infer<typeof DecideBody>;

export const EditBody = z.object({
  text: z.string().trim().min(1).max(50_000),
  author: Author,
  base_rev: z.number().int().min(1),
});
export type EditBody = z.infer<typeof EditBody>;

export const RestoreBody = z.object({
  rev: z.number().int().min(1),
  author: Author,
  base_rev: z.number().int().min(1),
});
export type RestoreBody = z.infer<typeof RestoreBody>;

export interface AmendmentService {
  create(portal: string, body: AmendmentBody): Promise<Amendment>;
  withdraw(portal: string, id: string, body?: DecideBody): Promise<Amendment>;
  /** Re-anchor in place: same id and key, a new revision on the chosen target. */
  reapply(portal: string, id: string, body: ReapplyBody): Promise<Amendment>;
  dismiss(portal: string, id: string, body?: DecideBody): Promise<Amendment>;
  edit(portal: string, id: string, body: EditBody): Promise<Amendment>;
  /** Make an earlier revision's text, target and status the newest revision. */
  restore(portal: string, id: string, body: RestoreBody): Promise<Amendment>;
  revisions(portal: string, id: string): Promise<AmendmentRevision[]>;
}

/** Next `AMD-nnn` of the portal: highest number so far plus one, at least three digits. */
function nextKey(keys: readonly string[]): string {
  let max = 0;
  for (const k of keys) {
    const n = Number(k.slice('AMD-'.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `AMD-${String(max + 1).padStart(3, '0')}`;
}

function extensionOf(name: string): string {
  const ext = extname(name).slice(1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
}

interface Anchor {
  fingerprint: string | null;
  routeTemplate: string | null;
  element: AmendmentAnchorElement | null;
  screenId: string | null;
}

export function createAmendmentService(opts: {
  db: MudPuppyDb;
  evidence: EvidenceStore;
}): AmendmentService {
  const { db, evidence } = opts;

  async function loadState(portal: string, id: string) {
    const state = await db
      .selectFrom('states')
      .select(['id', 'fingerprint', 'route_template', 'layout_ref', 'screen_id'])
      .where('portal_id', '=', portal)
      .where('id', '=', id)
      .executeTakeFirst();
    if (state === undefined) throw new HttpError(404, `This portal has no state ${id}.`);
    return state;
  }

  async function loadLayout(ref: string): Promise<Layout> {
    try {
      return Layout.parse(JSON.parse(await readFile(evidence.resolve(ref), 'utf8')));
    } catch {
      throw new HttpError(409, 'The layout of this state could not be read.');
    }
  }

  /** Resolve the target; returns the anchor to store (state fields, screen and the element). */
  async function resolveAnchor(
    portal: string,
    body: { target_kind: AmendmentTargetKind; target_id: string },
  ): Promise<Anchor> {
    if (body.target_kind === 'evidence') {
      if (!isEvidenceRef(body.target_id) || !existsSync(evidence.resolve(body.target_id)))
        throw new HttpError(404, 'This evidence item does not exist.');
      return { fingerprint: null, routeTemplate: null, element: null, screenId: null };
    }
    if (body.target_kind === 'state') {
      const state = await loadState(portal, body.target_id);
      return {
        fingerprint: state.fingerprint,
        routeTemplate: state.route_template,
        element: null,
        screenId: state.screen_id,
      };
    }
    const hash = body.target_id.indexOf('#');
    if (hash <= 0 || hash === body.target_id.length - 1)
      throw new HttpError(400, 'An element target must look like <state id>#<element key>.');
    const state = await loadState(portal, body.target_id.slice(0, hash));
    const key = body.target_id.slice(hash + 1);
    if (state.layout_ref === null)
      throw new HttpError(
        409,
        'This state has no wireframe layout, so no element can be targeted.',
      );
    const layout = await loadLayout(state.layout_ref);
    const el = layout.elements.find((e) => e.key === key);
    if (el === undefined) throw new HttpError(404, `This state has no element ${key}.`);
    const roleIndex = layout.elements.filter((e) => e.role === el.role).indexOf(el);
    return {
      fingerprint: state.fingerprint,
      routeTemplate: state.route_template,
      element: AmendmentAnchorElement.parse({ key, role: el.role, name: el.name, roleIndex }),
      screenId: state.screen_id,
    };
  }

  /** Load, check the base, and write one revision in a transaction. */
  async function change(
    portal: string,
    id: string,
    baseRev: number | undefined,
    apply: (head: Amendment, trx: MudPuppyDb) => Promise<Amendment>,
  ): Promise<Amendment> {
    return db.transaction().execute(async (trx) => {
      const head = await loadHead(trx, portal, id);
      checkBase(head, baseRev);
      return apply(head, trx);
    });
  }

  const mustBe = (head: Amendment, status: Amendment['status'], what: string): void => {
    if (head.status !== status)
      throw new HttpError(409, `Only ${what} (this one is ${head.status.replace('_', ' ')}).`);
  };

  return {
    async create(portal, body) {
      if (body.kind === 'element_ref' && body.target_kind !== 'wireframe_element')
        throw new HttpError(400, 'An element reference must target a wireframe element.');
      if ((body.kind === 'note' || body.kind === 'element_ref') && body.text === undefined)
        throw new HttpError(400, 'The amendment needs text.');
      if (body.kind === 'attachment' && body.attachment === undefined)
        throw new HttpError(400, 'The attachment needs a file name and content.');

      const anchor = await resolveAnchor(portal, body);

      let sha: string | null = null;
      let fileName: string | null = null;
      if (body.kind === 'attachment' && body.attachment !== undefined) {
        const bytes = Buffer.from(body.attachment.content_base64, 'base64');
        if (bytes.length === 0) throw new HttpError(400, 'The attachment is empty.');
        if (bytes.length > MAX_ATTACHMENT_BYTES)
          throw new HttpError(400, 'The attachment is too large.');
        const ref = await evidence.storeBinary(bytes, extensionOf(body.attachment.name));
        sha = ref.slice(0, 64);
        fileName = body.attachment.name;
      }

      return db.transaction().execute(async (trx) => {
        const keys = await trx
          .selectFrom('amendments')
          .select('key')
          .where('portal_id', '=', portal)
          .execute();
        const row = Amendment.parse({
          id: newId(),
          key: nextKey(keys.map((k) => k.key)),
          portal_id: portal,
          scope_id: body.scope_id ?? null,
          target_kind: body.target_kind,
          target_id: body.target_id,
          kind: body.kind,
          text: body.text === undefined ? null : SECRETS.redact(body.text),
          attachment_sha256: sha,
          attachment_name: fileName,
          author: body.author,
          status: 'active',
          anchor_fingerprint: anchor.fingerprint,
          anchor_route_template: anchor.routeTemplate,
          anchor_element: anchor.element,
          superseded_by_run: null,
          superseded_reason: null,
          superseded_detail: null,
          superseded_at: null,
          dismissed_at: null,
          reapplied_as: null,
          reapplies: null,
          created_at: nowIso(),
          withdrawn_at: null,
          rev: 1,
          screen_id: anchor.screenId,
        });
        await insertCreated(trx, row, body.author);
        return row;
      });
    },

    async withdraw(portal, id, body = { author: 'BA' }) {
      return change(portal, id, body.base_rev, async (head, trx) => {
        mustBe(head, 'active', 'an active amendment can be withdrawn');
        return writeRevision(trx, head, {
          change: 'withdraw',
          author: body.author,
          changes: { status: 'withdrawn', withdrawn_at: nowIso() },
        });
      });
    },

    async reapply(portal, id, body) {
      const before = await loadHead(db, portal, id);
      if (before.kind === 'element_ref' && body.target_kind !== 'wireframe_element')
        throw new HttpError(
          400,
          'An element reference must be re-anchored to a wireframe element.',
        );
      const anchor = await resolveAnchor(portal, body);
      return change(portal, id, body.base_rev, async (head, trx) => {
        mustBe(head, 'needs_reanchor', 'an amendment that needs re-anchoring can be re-anchored');
        return writeRevision(trx, head, {
          change: 'reanchor',
          author: body.author,
          changes: {
            status: 'active',
            target_kind: body.target_kind,
            target_id: body.target_id,
            text: body.text === undefined ? head.text : SECRETS.redact(body.text),
            anchor_fingerprint: anchor.fingerprint,
            anchor_route_template: anchor.routeTemplate,
            anchor_element: anchor.element,
            screen_id: anchor.screenId ?? head.screen_id,
          },
        });
      });
    },

    async dismiss(portal, id, body = { author: 'BA' }) {
      return change(portal, id, body.base_rev, async (head, trx) => {
        mustBe(head, 'needs_reanchor', 'an amendment that needs re-anchoring can be dismissed');
        return writeRevision(trx, head, {
          change: 'dismiss',
          author: body.author,
          changes: { status: 'dismissed', dismissed_at: nowIso() },
        });
      });
    },

    async edit(portal, id, body) {
      return change(portal, id, body.base_rev, async (head, trx) => {
        mustBe(head, 'active', 'an active amendment can be edited');
        return writeRevision(trx, head, {
          change: 'edit',
          author: body.author,
          changes: { text: SECRETS.redact(body.text) },
        });
      });
    },

    async restore(portal, id, body) {
      return change(portal, id, body.base_rev, async (head, trx) => {
        const old = (await listRevisions(trx, id)).find((r) => r.rev === body.rev);
        if (old === undefined)
          throw new HttpError(404, `${head.key} has no revision ${String(body.rev)}.`);
        const now = nowIso();
        return writeRevision(trx, head, {
          change: 'restore',
          author: body.author,
          changes: {
            status: old.status,
            target_kind: old.target_kind,
            target_id: old.target_id,
            text: old.text,
            anchor_fingerprint: old.anchor_fingerprint,
            anchor_route_template: old.anchor_route_template,
            anchor_element: old.anchor_element,
            withdrawn_at: old.status === 'withdrawn' ? (head.withdrawn_at ?? now) : null,
            dismissed_at: old.status === 'dismissed' ? (head.dismissed_at ?? now) : null,
          },
          meta: { reason: `restored revision ${String(body.rev)}` },
        });
      });
    },

    async revisions(portal, id) {
      await loadHead(db, portal, id);
      return listRevisions(db, id);
    },
  };
}
