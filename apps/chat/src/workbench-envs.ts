// Where Workbench commands may run (spec 043 D-6 as the owner decided it, 2026-10-22; R-94 (8)):
// only on the environments the owner switches on, `MUDPUPPY_WORKBENCH_COMMAND_ENVS` (a comma list;
// on at first for local-dev and sandbox, off elsewhere). Off pauses the command cards with a reason
// and a way to Scans, as the commands switch already does (WB-UI-25).

export const DEFAULT_COMMAND_ENVIRONMENTS: readonly string[] = ['local-dev', 'sandbox'];

/** The switched-on environments: the setting's comma list, or the default when it is unset. */
export function commandEnvironments(setting: string | undefined): readonly string[] {
  if (setting === undefined) return DEFAULT_COMMAND_ENVIRONMENTS;
  return setting
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Whether Workbench commands may run on `environment`. */
export const commandsAllowedOn = (
  environment: string,
  setting: string | undefined = process.env['MUDPUPPY_WORKBENCH_COMMAND_ENVS'],
): boolean => commandEnvironments(setting).includes(environment);

/** What the card says when commands are off here. */
export const commandsOffReason = (environment: string): string =>
  `Workbench commands are off on ${environment}: start scans in Scans`;
