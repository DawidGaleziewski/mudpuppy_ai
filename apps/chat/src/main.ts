// Entry point of the chat service (R-30 T014): `pnpm start` in apps/chat.
// Environment: MUDPUPPY_ENV (required: a declared environment, spec 030 R-61),
// MUDPUPPY_CHAT_PORT (default 4310).

import { requireEnvironment } from '@mudpuppy/config';
import { createEvidenceStore } from '@mudpuppy/core';
import { dbPathFor, migrateUp, openDb } from '@mudpuppy/store';
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
import {
  addExperimentFlag,
  createPortal,
  describePortal,
  removeEnvironment,
  setEnvironment,
  setHints,
} from './portals.js';
import { addPersona, removePersona } from './persona-add.js';
import { createProcessService } from './process-service.js';
import { createProbeSuiteService } from './probe-suites.js';
import { createMarkService } from './marks.js';
import { createProposalService } from './proposal-service.js';
import { conversationsOfRun, runningRunsOfConversation, stopRun, stoppedNotice } from './runs.js';
import { setProcessScope } from './scope.js';
import { listPortals, loadWorkflowInput } from './workflow-data.js';
import { workflowState } from '@mudpuppy/workflow';
import { buildSessionRequest } from './session-config.js';
import { ChatStore } from './store.js';
import { isWorkbench, observeWorkbench } from './workbench-events.js';
import { createWorkbenchService, type WorkbenchService } from './workbench-service.js';
import { commandsAllowedOn, commandsOffReason } from './workbench-envs.js';
import { shortScan } from './workbench-commands.js';
import {
  buildWorkbenchSessionRequest,
  createWorkbenchFence,
  Launches,
} from './workbench-session.js';
import { telemetryLog } from './workbench-telemetry.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const runtimeDir = join(repoRoot, 'apps', 'chat', 'runtime');

function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

type Opened = ReturnType<typeof openDb>;

/** The HTTP API over the store, with every service the dashboard calls. */
function buildApi({
  opened,
  service,
  evidence,
  environment,
  workbench,
}: {
  opened: Opened;
  service: ChatService;
  evidence: ReturnType<typeof createEvidenceStore>;
  environment: string;
  workbench: WorkbenchService;
}) {
  const amendments = createAmendmentService({ db: opened.db, evidence });
  return createApi({
    service,
    logError: (input) => logError(input),
    findError: (ref) => findError(ref),
    version: packageVersion(),
    credentials: createCredentialsHandler({ db: opened.db }),
    scope: (conversationId, body) => setProcessScope(opened.raw, repoRoot, conversationId, body),
    amendments,
    proposals: createProposalService({ db: opened.db, amendments }),
    processes: createProcessService({ db: opened.db, raw: opened.raw }),
    probeSuites: createProbeSuiteService({ db: opened.db, repoRoot }),
    marks: createMarkService({ db: opened.db }),
    checkRuns: { repoRoot, environment },
    modelStore: opened.raw,
    addExperimentFlag: (id, flag) => addExperimentFlag({ repoRoot }, id, flag),
    // T041: tell every conversation following the run; the timer moves its step on.
    stopRun: (runId) => {
      const stopped = stopRun(opened.raw, runId, { byBa: true });
      for (const conversationId of conversationsOfRun(opened.raw, runId))
        service.inject(conversationId, [{ type: 'notice', text: stoppedNotice(stopped) }]);
      return stopped;
    },
    runsOfConversation: (conversationId) => runningRunsOfConversation(opened.raw, conversationId),
    workbench,
    portals: {
      create: (body) => createPortal({ repoRoot }, body),
      describe: (id) => describePortal({ repoRoot }, id),
      setEnvironment: (id, env, body) => setEnvironment({ repoRoot }, id, env, body),
      removeEnvironment: (id, env) => removeEnvironment({ repoRoot }, id, env),
      setHints: (id, body) => setHints({ repoRoot }, id, body),
      addPersona: (id, body) => addPersona({ repoRoot }, id, body),
      removePersona: (id, name) => removePersona(opened.raw, { repoRoot }, id, name),
    },
  });
}

/**
 * T022: steps follow the recorded work now and every 2 s; spec 043: so do the Workbench's
 * command cards (expiry, a confirmed scan's run). Returns the timer.
 */
async function followSteps(
  recorder: StepRecorder,
  service: ChatService,
  workbench: WorkbenchService,
): Promise<NodeJS.Timeout> {
  const reconcile = async (): Promise<void> => {
    for (const [conversationId, events] of await recorder.reconcile())
      service.inject(conversationId, events);
    workbench.settle();
  };
  await reconcile();
  return setInterval(() => {
    reconcile().catch((error: unknown) =>
      logError({
        where: 'step-recorder timer',
        message: 'Step status update failed.',
        detail: error,
      }),
    );
  }, 2000);
}

async function main(): Promise<void> {
  // No default (spec 030 R-61): the chat serves exactly the environment it is started on, and the
  // MCP servers it starts get the same one.
  const environment = requireEnvironment(repoRoot, process.env['MUDPUPPY_ENV']);
  const port = Number(process.env['MUDPUPPY_CHAT_PORT'] ?? '4310');
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
  // Spec 043: a Workbench conversation gets its own prompt, tools and fence, and its words-lane
  // events; the crawler starts only with a confirmed command's prompt (F-10).
  const launches = new Launches();
  const workbenchOf = (conversationId: string): boolean => isWorkbench(opened.raw, conversationId);
  const service = new ChatService({
    observe: async (conversationId, event) => [
      ...(await recorder.observe(conversationId, event)),
      ...(workbenchOf(conversationId) ? observeWorkbench(opened.raw, conversationId, event) : []),
    ],
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
      workbenchOf(conversationId)
        ? buildWorkbenchSessionRequest({ repoRoot, conversationId, environment })
        : buildSessionRequest({ repoRoot, conversationId, environment }),
    policy: createFence({ repoRoot }),
    policyFor: (conversationId) =>
      workbenchOf(conversationId)
        ? createWorkbenchFence({ repoRoot }, conversationId, launches)
        : null,
    logError: (input) => logError(input),
  });
  const workbench = createWorkbenchService({
    raw: opened.raw,
    service,
    paths: { repoRoot },
    launches,
    // D-6 (owner 2026-10-22): commands only on the environments switched on.
    commandsOn: () => commandsAllowedOn(environment),
    offReason: commandsOffReason(environment),
    telemetry: telemetryLog(join(repoRoot, 'data', 'logs', 'workbench')),
    stopped: (runId) => {
      for (const conversationId of conversationsOfRun(opened.raw, runId))
        service.inject(conversationId, [
          { type: 'notice', text: `Scan ${shortScan(runId)} was stopped.` },
        ]);
    },
  });
  const server = buildApi({ opened, service, evidence, environment, workbench });
  const timer = await followSteps(recorder, service, workbench);
  const bound = await listenLocal(server, port);
  console.log(`mudpuppy-chat (${environment}) listening on http://127.0.0.1:${String(bound)}`);

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
