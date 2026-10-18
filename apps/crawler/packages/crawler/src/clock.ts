/**
 * The clock every wait measures with (spec 036 FR-001): monotonic, so a wall clock that steps (WSL
 * resyncing it by ±6 s, an NTP correction on a VM) neither stalls a wait to its hard limit nor ends
 * it early. Timestamps written to records stay wall-clock (`Date.now()`); only durations use this.
 */
export const monotonicNow = (): number => performance.now();
