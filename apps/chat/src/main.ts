// Entry point of the chat service (R-30 T014): `pnpm start` in apps/chat.
// Environment: PATHFINDER_ENV (required: a declared environment, spec 030 R-61),
// PATHFINDER_CHAT_PORT (default 4310).

import { requireEnvironment } from '@pathfinder/config';
import { createEvidenceStore } from '@pathfinder/core';
import { dbPathFor, migrateUp, openDb } from '@pathfinder/store';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnClaudeAgent } from './acp-client.js';
import { createAmendmentService } from './amendments.js';
import { createApi, listenLocal } from './api.js';
import { createCredentialsHandler } from './credentials.js';
import { findError, logError, sweepErrorLogs } from './error-log.js';
import { createFence } from './fence.js';
import { ChatService } from './service.js';
import { StepRecorder } from './step-recorder.js';
import { openingMessage } from './opening.js';
import { createPortal, describePortal, removeEnvironment, setEnvironment } from './portals.js';
import { createProcessService } from './process-service.js';
import { createProbeSuiteService } from './probe-suites.js';
import { createMarkService } from './marks.js';
import { createProposalService } from './proposal-service.js';
import { conversationsOfRun, runningRunsOfConversation, stopRun, stoppedNotice } from './runs.js';
import { setProcessScope } from './scope.js';
import { listPortals, loadWorkflowInput } from './workflow-data.js';
import { workflowState } from '@pathfinder/workflow';
import { buildSessionRequest } from './session-config.js';
import { ChatStore } from './store.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const runtimeDir = join(repoRoot, 'apps', 'chat', 'runtime');

function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

async function main(): Promise<void> {
  // No default (spec 030 R-61): the chat serves exactly the environment it is started on, and the
  // MCP servers it starts get the same one.
  const environment = requireEnvironment(repoRoot, process.env['PATHFINDER_ENV']);
  const port = Number(process.env['PATHFINDER_CHAT_PORT'] ?? '4310');
  mkdirSync(runtimeDir, { recursive: true });
  const opened = openDb(dbPathFor(join(repoRoot, 'data'), environment));
  migrateUp(opened.raw, join(repoRoot, 'data', 'migrations'));
  await sweepErrorLogs();

  // T022: steps follow the recorded work, after every chat event and on a timer (so the tracker is
  // right after a reload or restart even when no chat turn is running).
  const evidence = createEvidenceStore(join(repoRoot, 'data', 'evidence'));
  const recorder = new StepRecorder({
    raw: opened.raw,
    logError: (input) => logError(input),
    evidence,
  });
  const service = new ChatService({
    observe: (conversationId, event) => recorder.observe(conversationId, event),
    opening: (portal, conversationId) =>
      openingMessage(
        workflowState(loadWorkflowInput(opened.raw, { repoRoot }, portal, conversationId)),
        listPortals({ repoRoot }),
      ),
    store: new ChatStore(opened.db),
    launch: spawnClaudeAgent({
      cwd: runtimeDir,
      onStderr: (text) => process.stderr.write(`[agent] ${text}`),
    }),
    sessionRequest: (conversationId) =>
      buildSessionRequest({ repoRoot, conversationId, environment }),
    policy: createFence({ repoRoot }),
    logError: (input) => logError(input),
  });
  const amendments = createAmendmentService({ db: opened.db, evidence });
  const server = createApi({
    service,
    logError: (input) => logError(input),
    findError: (ref) => findError(ref),
    version: packageVersion(),
    credentials: createCredentialsHandler({ db: opened.db }),
    scope: (conversationId, body) => setProcessScope(opened.raw, repoRoot, conversationId, body),
    amendments,
    proposals: createProposalService({ db: opened.db, amendments }),
    processes: createProcessService({ db: opened.db }),
    probeSuites: createProbeSuiteService({ db: opened.db, repoRoot }),
    marks: createMarkService({ db: opened.db }),
    // T041: tell every conversation following the run; the timer moves its step on.
    stopRun: (runId) => {
      const stopped = stopRun(opened.raw, runId, { byBa: true });
      for (const conversationId of conversationsOfRun(opened.raw, runId))
        service.inject(conversationId, [{ type: 'notice', text: stoppedNotice(stopped) }]);
      return stopped;
    },
    runsOfConversation: (conversationId) => runningRunsOfConversation(opened.raw, conversationId),
    portals: {
      create: (body) => createPortal({ repoRoot }, body),
      describe: (id) => describePortal({ repoRoot }, id),
      setEnvironment: (id, env, body) => setEnvironment({ repoRoot }, id, env, body),
      removeEnvironment: (id, env) => removeEnvironment({ repoRoot }, id, env),
    },
  });
  const reconcile = async (): Promise<void> => {
    for (const [conversationId, events] of await recorder.reconcile())
      service.inject(conversationId, events);
  };
  await reconcile();
  const timer = setInterval(() => {
    reconcile().catch((error: unknown) =>
      logError({
        where: 'step-recorder timer',
        message: 'Step status update failed.',
        detail: error,
      }),
    );
  }, 2000);
  const bound = await listenLocal(server, port);
  console.log(`pathfinder-chat (${environment}) listening on http://127.0.0.1:${String(bound)}`);

  const stop = (): void => {
    clearInterval(timer);
    service.close();
    server.close();
    void opened.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
