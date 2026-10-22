import { describe, expect, it } from 'vitest';
import { nowIso } from '@mudpuppy/core';
import { DOC_CONTENT_BY_KIND } from '@mudpuppy/docs-model';
import { ToolError } from '../src/errors.js';
import { assertApiEndpointCitesCall } from '../src/services/ba/api-endpoint-check.js';
import { makeCtx, seedRun } from './helpers.js';

// spec 038 FR-008 (field C-10): an api_endpoint documents a call the crawler captured.
const content = (over: object = {}) =>
  DOC_CONTENT_BY_KIND.api_endpoint.parse({
    kind: 'api_endpoint',
    title: 'Typowa wartość pojazdu',
    method: 'GET',
    path: '/api/wartosc-pojazdu',
    purpose: 'Suggests the vehicle value when OC + AC is chosen',
    ...over,
  });

async function withCall() {
  const ctx = await makeCtx();
  const run = await seedRun(ctx);
  ctx.raw
    .prepare(
      `INSERT INTO network_calls (id, run_id, transition_id, method, url_template, status, req_schema, res_schema, created_at)
       VALUES ('call-1', ?, NULL, 'GET', 'http://127.0.0.1:4010/api/wartosc-pojazdu', 200, '{}', '{}', ?)`,
    )
    .run(run, nowIso());
  return ctx;
}

const code = (f: () => void): string => {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(ToolError);
    return (e as ToolError).code;
  }
  return 'none';
};

describe('assertApiEndpointCitesCall', () => {
  it('accepts a record citing the call it documents (host or not)', async () => {
    const ctx = await withCall();
    const cited = [{ target_kind: 'network_call', target_id: 'call-1' }];
    expect(code(() => assertApiEndpointCitesCall(ctx, content(), cited))).toBe('none');
    expect(code(() => assertApiEndpointCitesCall(ctx, content({ method: 'get' }), cited))).toBe(
      'none',
    );
  });

  it('refuses no call, an unknown call, or another method or path', async () => {
    const ctx = await withCall();
    const cited = [{ target_kind: 'network_call', target_id: 'call-1' }];
    expect(code(() => assertApiEndpointCitesCall(ctx, content(), []))).toBe('API_CALL_NOT_CITED');
    expect(
      code(() =>
        assertApiEndpointCitesCall(ctx, content(), [
          { target_kind: 'network_call', target_id: 'nope' },
        ]),
      ),
    ).toBe('API_CALL_NOT_CITED');
    expect(code(() => assertApiEndpointCitesCall(ctx, content({ method: 'POST' }), cited))).toBe(
      'API_CALL_NOT_CITED',
    );
    expect(
      code(() => assertApiEndpointCitesCall(ctx, content({ path: '/api/other' }), cited)),
    ).toBe('API_CALL_NOT_CITED');
  });

  it('leaves every other kind alone', async () => {
    const ctx = await makeCtx();
    const term = DOC_CONTENT_BY_KIND.assumption.parse({
      kind: 'assumption',
      title: 'x',
      statement: 'x',
      impact_if_wrong: 'x',
    });
    expect(code(() => assertApiEndpointCitesCall(ctx, term, []))).toBe('none');
  });
});
