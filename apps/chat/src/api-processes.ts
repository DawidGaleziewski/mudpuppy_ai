// BA process routes of the chat service (spec 022 M5, contracts/processes-api.md). Every write is
// one revision; a stale `base_rev` answers 409 STALE_REVISION with the latest head.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './http-error.js';
import { readJson, sendJson } from './http-io.js';
import type { ProcessService } from './process-service.js';

const SEG = '([^/]+)';
const P = `^/portals/${SEG}`;
const ROUTES: {
  method: string;
  path: RegExp;
  status: number;
  run: (s: ProcessService, a: string[], body: unknown) => Promise<unknown>;
}[] = [
  { method: 'POST', path: re(`${P}/processes$`), status: 201, run: (s, [p], b) => s.create(p!, b) },
  // spec 078 (designer T-06): merge two saved processes (or its dry run), and undo / split back
  {
    method: 'POST',
    path: re(`${P}/processes/merge$`),
    status: 200,
    run: (s, [p], b) => s.mergeProcesses(p!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/merges/${SEG}/undo$`),
    status: 200,
    run: (s, [p, id], b) => s.unmerge(p!, id!, b),
  },
  // spec 078 (designer T-05): Add to process is a scope change; its Undo
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}/scope$`),
    status: 200,
    run: (s, [p, id], b) => s.addToScope(p!, id!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}/scope/remove$`),
    status: 200,
    run: (s, [p, id], b) => s.removeFromScope(p!, id!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/from-record$`),
    status: 200,
    run: (s, [p], b) => s.fromRecord(p!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}$`),
    status: 200,
    run: (s, [p, id], b) => s.change(p!, id!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}/archive$`),
    status: 200,
    run: (s, [p, id], b) => s.archive(p!, id!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}/unarchive$`),
    status: 200,
    run: (s, [p, id], b) => s.unarchive(p!, id!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}/models/${SEG}/edit$`),
    status: 201,
    run: (s, [p, id, l], b) => s.editAsIs(p!, id!, l!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}/models$`),
    status: 201,
    run: (s, [p, id], b) => s.branch(p!, id!, b),
  },
  {
    method: 'PUT',
    path: re(`${P}/processes/${SEG}/models/${SEG}/draft$`),
    status: 200,
    run: (s, [p, id, l], b) => s.saveDraft(p!, id!, l!, b),
  },
  {
    method: 'DELETE',
    path: re(`${P}/processes/${SEG}/models/${SEG}/draft$`),
    status: 200,
    run: (s, [p, id, l], b) => s.discardDraft(p!, id!, l!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}/models/${SEG}/save$`),
    status: 201,
    run: (s, [p, id, l], b) => s.saveRevision(p!, id!, l!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}/models/${SEG}/rebase$`),
    status: 200,
    run: (s, [p, id, l], b) => s.rebaseDraft(p!, id!, l!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}/models/${SEG}/restore$`),
    status: 201,
    run: (s, [p, id, l], b) => s.restore(p!, id!, l!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}/live$`),
    status: 201,
    run: (s, [p, id], b) => s.markLive(p!, id!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/processes/${SEG}/change-spec$`),
    status: 201,
    run: (s, [p, id], b) => s.saveChangeSpec(p!, id!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/suggestions/${SEG}/accept$`),
    status: 201,
    run: (s, [p, id], b) => s.accept(p!, id!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/suggestions/${SEG}/dismiss$`),
    status: 200,
    run: (s, [p, id], b) => s.dismiss(p!, id!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/suggestions/${SEG}/split$`),
    status: 201,
    run: (s, [p, id], b) => s.split(p!, id!, b),
  },
  {
    method: 'POST',
    path: re(`${P}/suggestions/${SEG}/merge$`),
    status: 201,
    run: (s, [p, id], b) => s.merge(p!, id!, b),
  },
];

function re(source: string): RegExp {
  return new RegExp(source);
}

/** Handles the request when it is a process route; returns false otherwise. */
export async function processRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  processes: ProcessService | undefined,
): Promise<boolean> {
  const matches = ROUTES.map((r) => ({ r, m: r.path.exec(path) })).filter((x) => x.m !== null);
  if (matches.length === 0) return false;
  if (processes === undefined) throw new HttpError(404, 'This address does not exist.');
  const hit = matches.find((x) => x.r.method === method);
  if (hit === undefined) throw new HttpError(405, 'This method is not allowed here.');
  const args = hit.m!.slice(1).map((a) => decodeURIComponent(a));
  sendJson(res, hit.r.status, await hit.r.run(processes, args, await readJson(req)));
  return true;
}
