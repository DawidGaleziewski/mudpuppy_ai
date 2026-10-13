// JSON in and out for the chat service's HTTP routes (shared by api.ts and the route modules).

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z } from 'zod';
import { HttpError } from './http-error.js';

export const MAX_BODY_BYTES = 256 * 1024;

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

export async function readJson(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > maxBytes) throw new HttpError(400, 'The request is too large.');
    chunks.push(buf);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
}

export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first === undefined ? '' : ` (${first.path.join('.') || 'body'})`;
    throw new HttpError(400, `The request is not valid${where}.`);
  }
  return parsed.data;
}
