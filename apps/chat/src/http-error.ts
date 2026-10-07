// An error that carries the HTTP status the API answers with. Messages are plain language and
// never contain secret values.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
