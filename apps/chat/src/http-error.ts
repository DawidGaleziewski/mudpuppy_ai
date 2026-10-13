// An error that carries the HTTP status the API answers with. Messages are plain language and
// never contain secret values. `extra` adds machine-readable fields to the JSON body (e.g. the
// `STALE_REVISION` code and the latest revision, spec 022).

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
