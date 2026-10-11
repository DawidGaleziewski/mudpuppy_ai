/**
 * A judge that cannot run at all (no login, a bad token, an isolation leak), as opposed to one
 * pair failing. Typed (G-24) so commands can print it plainly and exit 2.
 */
export type JudgeSetupCode =
  | 'NO_LOGIN'
  | 'TOKEN_MALFORMED'
  | 'TOKEN_REJECTED'
  | 'CLI_MISSING'
  /** The account's usage limit: verdicts would measure the outage, not the judge (spec 014 F-04). */
  | 'USAGE_LIMIT';

export class JudgeSetupError extends Error {
  constructor(
    readonly code: JudgeSetupCode,
    message: string,
  ) {
    super(message);
    this.name = 'JudgeSetupError';
  }
}
