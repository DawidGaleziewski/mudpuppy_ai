import type { EvidenceStore, Logger } from '@mudpuppy/core';
import type { DecisionLog, MinerRun, OpenedDb, MudPuppyDb, Tracer } from '@mudpuppy/store';
import type { captureVisuals } from '@mudpuppy/crawler';

/**
 * What the BA server's services need: the store and the evidence files, nothing that can reach a
 * portal. A `ServerContext` satisfies it, so tests may pass either.
 */
export interface BaContext {
  db: MudPuppyDb;
  raw: OpenedDb['raw'];
  evidence: EvidenceStore;
  logger: Logger;
  /** The store's environment, echoed on every result (spec 030 FR-052); absent in tests. */
  environment?: string;
}

/** One running mudpuppy server: written on the runs it drives (spec 010 F-14). */
export interface RunOwner {
  /** UUIDv7, new on every server start. */
  id: string;
  pid: number;
}

/** Everything a service needs. Run-scoped browser state lives elsewhere (session registry). */
export interface ServerContext {
  /** This server, when it shares the store with others; absent means "every running run is mine". */
  owner?: RunOwner;
  db: MudPuppyDb;
  raw: OpenedDb['raw'];
  evidence: EvidenceStore;
  decisions: DecisionLog;
  logger: Logger;
  /** Observability trace (spec 005); never read by a service to decide anything. */
  tracer: Tracer;
  /** Repo root holding `portals/` and `personas/`. */
  root: string;
  /** Environment whose database file this server records into (`data/db/<env>.sqlite`). */
  dbEnvironment: string;
  /** Mines business rules after a run's rebuild (spec 040 T030); absent: no mining. */
  miner?: MinerRun | null;
  /** Used only for robots.txt (spec 002 FR-001); injectable so tests never reach the network. */
  fetch?: typeof fetch;
  /** Vault key file (spec 009); default `MUDPUPPY_VAULT_KEY_FILE` or `~/.config/mudpuppy/vault.key`. */
  vaultKeyPath?: string;
  /** Screenshot + layout of a new state (spec 008); injectable so tests can force a failure. */
  captureVisuals?: typeof captureVisuals;
}
