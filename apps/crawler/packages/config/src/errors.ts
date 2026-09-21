import type { ZodError } from 'zod';

/** Every config failure names the file and the specific problem (FR-017). */
export class ConfigError extends Error {
  constructor(
    readonly file: string,
    readonly problems: string[],
  ) {
    super(`${file}: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

export function zodProblems(error: ZodError): string[] {
  return error.issues.map((i) =>
    i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message,
  );
}
