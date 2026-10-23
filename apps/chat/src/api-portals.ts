// Portal routes of the chat service (spec 011: "+ new portal" and the portal settings page;
// spec 040 T021: Settings ▸ Hints and Budgets).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { Environment } from '@mudpuppy/config';
import { parseBody, readJson, sendJson } from './http-io.js';
import { HttpError } from './http-error.js';
import { PersonaRefusal, type SavedPersona } from './personas.js';
import {
  EnvironmentBody,
  HintsBody,
  NewPortalBody,
  PortalRefusal,
  type PortalSummary,
} from './portals.js';

export interface PortalCommands {
  create: (body: NewPortalBody) => PortalSummary;
  describe: (id: string) => PortalSummary;
  setEnvironment: (id: string, env: Environment, body: EnvironmentBody) => PortalSummary;
  removeEnvironment: (id: string, env: Environment) => PortalSummary;
  /** Settings ▸ Hints and Budgets (spec 040 T021). */
  setHints?: (id: string, body: HintsBody) => PortalSummary;
  /** Add a persona (spec 072, `persona.add`'s API): its args, checked by `addPersona`. */
  addPersona?: (id: string, body: unknown) => SavedPersona;
  /** Its Undo: remove it while no scan used it. */
  removePersona?: (id: string, name: string) => { portal: string; persona: string };
}

const PERSONA_STATUS: Record<PersonaRefusal['code'], number> = {
  MISSING_INPUT: 404,
  PERSONA_EXISTS: 409,
  INLINE_SECRET: 400,
  CEILING_WIDENED: 400,
  INVALID: 400,
};

/** Run a persona command; a refusal becomes its HTTP status with the reasons in the message. */
function personaCall<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof PersonaRefusal)
      throw new HttpError(PERSONA_STATUS[error.code], error.details.length > 0 ? `${error.message}: ${error.details.join('; ')}` : `${error.message}.`);
    throw error;
  }
}

/** POST /portals/{id}/personas, DELETE /portals/{id}/personas/{name}; false when not one of them. */
async function personaRoutes(req: IncomingMessage, res: ServerResponse, method: string, path: string, portals: PortalCommands | undefined): Promise<boolean> {
  const add = /^\/portals\/([^/]+)\/personas$/.exec(path);
  if (method === 'POST' && add !== null) {
    const addPersona = portals?.addPersona;
    if (addPersona === undefined) throw new HttpError(404, 'This address does not exist.');
    const body = await readJson(req);
    sendJson(res, 201, personaCall(() => addPersona(decodeURIComponent(add[1]!), body)));
    return true;
  }
  const one = /^\/portals\/([^/]+)\/personas\/([^/]+)$/.exec(path);
  if (method === 'DELETE' && one !== null) {
    const removePersona = portals?.removePersona;
    if (removePersona === undefined) throw new HttpError(404, 'This address does not exist.');
    sendJson(res, 200, personaCall(() => removePersona(decodeURIComponent(one[1]!), decodeURIComponent(one[2]!))));
    return true;
  }
  return false;
}

const PORTAL_STATUS: Record<PortalRefusal['code'], number> = {
  PORTAL_EXISTS: 409,
  LAST_ENVIRONMENT: 409,
  PORTAL_NOT_FOUND: 404,
  INVALID: 400,
};

/** Run a portal command; a refusal becomes its HTTP status with the reasons in the message. */
function portalCall(run: () => PortalSummary): PortalSummary {
  try {
    return run();
  } catch (error) {
    if (error instanceof PortalRefusal)
      throw new HttpError(
        PORTAL_STATUS[error.code],
        error.details.length > 0
          ? `${error.message}: ${error.details.join('; ')}`
          : `${error.message}.`,
      );
    throw error;
  }
}

async function environmentRoute(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  [, rawId, rawEnv]: RegExpExecArray,
  portals: PortalCommands,
): Promise<void> {
  const id = decodeURIComponent(rawId!);
  const env = Environment.safeParse(decodeURIComponent(rawEnv!));
  if (!env.success)
    throw new HttpError(400, 'The environment must be production, staging or sandbox.');
  if (method === 'PUT') {
    const body = parseBody(EnvironmentBody, await readJson(req));
    sendJson(
      res,
      200,
      portalCall(() => portals.setEnvironment(id, env.data, body)),
    );
  } else
    sendJson(
      res,
      200,
      portalCall(() => portals.removeEnvironment(id, env.data)),
    );
}

/** The portal routes; false when the request is not one of them. */
export async function portalRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  portals: PortalCommands | undefined,
): Promise<boolean> {
  if (method === 'POST' && path === '/portals') {
    if (portals === undefined) throw new HttpError(404, 'This address does not exist.');
    const body = parseBody(NewPortalBody, await readJson(req));
    sendJson(
      res,
      201,
      portalCall(() => portals.create(body)),
    );
    return true;
  }
  const portalOne = /^\/portals\/([^/]+)$/.exec(path);
  if (method === 'GET' && portalOne !== null) {
    if (portals === undefined) throw new HttpError(404, 'This address does not exist.');
    const id = decodeURIComponent(portalOne[1]!);
    sendJson(
      res,
      200,
      portalCall(() => portals.describe(id)),
    );
    return true;
  }
  const portalHints = /^\/portals\/([^/]+)\/hints$/.exec(path);
  if (method === 'PUT' && portalHints !== null) {
    if (portals?.setHints === undefined) throw new HttpError(404, 'This address does not exist.');
    const setHints = portals.setHints;
    const body = parseBody(HintsBody, await readJson(req));
    const id = decodeURIComponent(portalHints[1]!);
    sendJson(
      res,
      200,
      portalCall(() => setHints(id, body)),
    );
    return true;
  }
  const portalEnv = /^\/portals\/([^/]+)\/environments\/([^/]+)$/.exec(path);
  if ((method === 'PUT' || method === 'DELETE') && portalEnv !== null) {
    if (portals === undefined) throw new HttpError(404, 'This address does not exist.');
    await environmentRoute(req, res, method, portalEnv, portals);
    return true;
  }
  return personaRoutes(req, res, method, path, portals);
}
