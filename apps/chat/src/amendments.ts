// Amendment commands (R-30 T030, data-model.md amendments, research R8/R8b): create and withdraw.
// Every row passes the core Zod `Amendment` schema. The anchor (fingerprint, route template and,
// for wireframe elements, `{key, role, name, roleIndex}`) is captured at write time so a later
// fresh run can tell what changed.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import {
  Amendment,
  AmendmentAnchorElement,
  AmendmentKind,
  AmendmentTargetKind,
  Layout,
  SECRETS,
  newId,
  nowIso,
  isEvidenceRef,
  type EvidenceStore,
  type PathfinderDb,
} from '@pathfinder/core';
import { z } from 'zod';
import { HttpError } from './http-error.js';

/** Largest attachment accepted, in bytes of file content. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export const AmendmentBody = z.object({
  kind: AmendmentKind,
  target_kind: AmendmentTargetKind,
  target_id: z.string().min(1).max(2_000),
  text: z.string().trim().min(1).max(50_000).optional(),
  scope_id: z.string().min(1).optional(),
  author: z.string().trim().min(1).max(200).default('BA'),
  attachment: z
    .object({
      name: z.string().trim().min(1).max(255),
      content_base64: z.string().min(1),
    })
    .optional(),
});
export type AmendmentBody = z.infer<typeof AmendmentBody>;

/** Re-apply a superseded amendment to a current target (T033, FR-022). */
export const ReapplyBody = z.object({
  target_kind: AmendmentTargetKind,
  target_id: z.string().min(1).max(2_000),
  /** Optional new wording; default keeps the original text. */
  text: z.string().trim().min(1).max(50_000).optional(),
  author: z.string().trim().min(1).max(200).default('BA'),
});
export type ReapplyBody = z.infer<typeof ReapplyBody>;

export interface AmendmentService {
  create(portal: string, body: AmendmentBody): Promise<Amendment>;
  withdraw(portal: string, id: string): Promise<Amendment>;
  /** New active copy on the chosen target, linked both ways; the original stays superseded. */
  reapply(portal: string, id: string, body: ReapplyBody): Promise<Amendment>;
  dismiss(portal: string, id: string): Promise<Amendment>;
}

type Row = Omit<Amendment, 'anchor_element'> & { anchor_element: string | null };

function parseRow(row: Row): Amendment {
  return Amendment.parse({
    ...row,
    anchor_element: row.anchor_element === null ? null : JSON.parse(row.anchor_element),
  });
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

export function createAmendmentService(opts: {
  db: PathfinderDb;
  evidence: EvidenceStore;
}): AmendmentService {
  const { db, evidence } = opts;

  async function loadState(portal: string, id: string) {
    const state = await db
      .selectFrom('states')
      .select(['id', 'fingerprint', 'route_template', 'layout_ref'])
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

  /** Resolve the target; returns the anchor to store (state fields and the element, if any). */
  async function resolveAnchor(
    portal: string,
    body: AmendmentBody,
  ): Promise<{
    fingerprint: string | null;
    routeTemplate: string | null;
    element: AmendmentAnchorElement | null;
  }> {
    if (body.target_kind === 'evidence') {
      if (!isEvidenceRef(body.target_id) || !existsSync(evidence.resolve(body.target_id)))
        throw new HttpError(404, 'This evidence item does not exist.');
      return { fingerprint: null, routeTemplate: null, element: null };
    }
    if (body.target_kind === 'state') {
      const state = await loadState(portal, body.target_id);
      return { fingerprint: state.fingerprint, routeTemplate: state.route_template, element: null };
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
    };
  }

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
        });
        await trx
          .insertInto('amendments')
          .values({
            ...row,
            anchor_element: row.anchor_element === null ? null : JSON.stringify(row.anchor_element),
          })
          .execute();
        return row;
      });
    },

    async withdraw(portal, id) {
      return db.transaction().execute(async (trx) => {
        const found = await trx
          .selectFrom('amendments')
          .selectAll()
          .where('portal_id', '=', portal)
          .where('id', '=', id)
          .executeTakeFirst();
        if (found === undefined) throw new HttpError(404, 'This amendment does not exist.');
        const current = parseRow(found);
        if (current.status !== 'active')
          throw new HttpError(
            409,
            `Only an active amendment can be withdrawn (this one is ${current.status}).`,
          );
        const next = Amendment.parse({ ...current, status: 'withdrawn', withdrawn_at: nowIso() });
        await trx
          .updateTable('amendments')
          .set({ status: next.status, withdrawn_at: next.withdrawn_at })
          .where('id', '=', id)
          .execute();
        return next;
      });
    },

    async reapply(portal, id, body) {
      const original = await loadSuperseded(portal, id);
      if (original.kind === 'element_ref' && body.target_kind !== 'wireframe_element')
        throw new HttpError(400, 'An element reference must be re-applied to a wireframe element.');
      const anchor = await resolveAnchor(portal, {
        kind: original.kind,
        target_kind: body.target_kind,
        target_id: body.target_id,
        author: body.author,
      });
      return db.transaction().execute(async (trx) => {
        // Re-check inside the transaction: two clicks must not make two copies.
        const again = await trx
          .selectFrom('amendments')
          .select(['status', 'reapplied_as'])
          .where('id', '=', id)
          .executeTakeFirst();
        if (again?.status !== 'superseded' || again.reapplied_as !== null)
          throw new HttpError(409, 'This amendment was already re-applied or dismissed.');
        const keys = await trx
          .selectFrom('amendments')
          .select('key')
          .where('portal_id', '=', portal)
          .execute();
        const copy = Amendment.parse({
          ...original,
          id: newId(),
          key: nextKey(keys.map((k) => k.key)),
          target_kind: body.target_kind,
          target_id: body.target_id,
          text: body.text === undefined ? original.text : SECRETS.redact(body.text),
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
          reapplies: original.id,
          created_at: nowIso(),
          withdrawn_at: null,
        });
        await trx
          .insertInto('amendments')
          .values({
            ...copy,
            anchor_element:
              copy.anchor_element === null ? null : JSON.stringify(copy.anchor_element),
          })
          .execute();
        await trx
          .updateTable('amendments')
          .set({ reapplied_as: copy.id })
          .where('id', '=', original.id)
          .execute();
        return copy;
      });
    },

    async dismiss(portal, id) {
      const original = await loadSuperseded(portal, id);
      const next = Amendment.parse({ ...original, status: 'dismissed', dismissed_at: nowIso() });
      const done = await db
        .updateTable('amendments')
        .set({ status: next.status, dismissed_at: next.dismissed_at })
        .where('id', '=', id)
        .where('status', '=', 'superseded')
        .where('reapplied_as', 'is', null)
        .executeTakeFirst();
      if (Number(done.numUpdatedRows) !== 1)
        throw new HttpError(409, 'This amendment was already re-applied or dismissed.');
      return next;
    },
  };

  /** A superseded amendment of the portal that was neither re-applied nor dismissed yet. */
  async function loadSuperseded(portal: string, id: string): Promise<Amendment> {
    const found = await db
      .selectFrom('amendments')
      .selectAll()
      .where('portal_id', '=', portal)
      .where('id', '=', id)
      .executeTakeFirst();
    if (found === undefined) throw new HttpError(404, 'This amendment does not exist.');
    const current = parseRow(found);
    if (current.status !== 'superseded')
      throw new HttpError(
        409,
        `Only a superseded amendment can be re-applied or dismissed (this one is ${current.status}).`,
      );
    if (current.reapplied_as !== null)
      throw new HttpError(409, 'This amendment was already re-applied.');
    return current;
  }
}
