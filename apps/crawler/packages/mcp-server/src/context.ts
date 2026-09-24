import type { DecisionLog, EvidenceStore, Logger, OpenedDb, PathfinderDb } from '@pathfinder/core';

/** Everything a service needs. Run-scoped browser state lives elsewhere (session registry). */
export interface ServerContext {
  db: PathfinderDb;
  raw: OpenedDb['raw'];
  evidence: EvidenceStore;
  decisions: DecisionLog;
  logger: Logger;
  /** Repo root holding `portals/` and `personas/`. */
  root: string;
  /** Environment whose database file this server records into (`data/db/<env>.sqlite`). */
  dbEnvironment: string;
  /** Used only for robots.txt (spec 002 FR-001); injectable so tests never reach the network. */
  fetch?: typeof fetch;
}
