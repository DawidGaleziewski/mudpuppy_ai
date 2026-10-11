/**
 * `pnpm eval:judge-check` (spec 017 FR-005a, SC-007): one real judge call on a fixed tiny pair,
 * then every isolation check on what it loaded. Exit 0 all ok, 1 a check failed, 2 the judge
 * cannot run (login, CLI). Costs one call (about $0.005 on Sonnet).
 */
import { homedir } from 'node:os';
import { REPO_ROOT } from './config.js';
import { die } from './failures.js';
import { callJudge } from './graders/model/call.js';
import { defineJudge, type Pair } from './graders/model/definition.js';
import { checkIsolation, forbiddenNames } from './graders/model/isolation.js';
import { describeLogin, resolveJudgeLogin } from './graders/model/login.js';
import { systemPrompt, userMessage } from './graders/model/prompt.js';
import { JudgeSetupError } from './graders/model/setup-error.js';

const PROBE = defineJudge({
  id: 'isolation-probe',
  category: 'terms',
  question: 'Does this glossary record name the same portal term as the ground-truth term?',
  pass: 'The same term, allowing an added abbreviation in brackets.',
  fail: 'A different term, or it is not clear that it is the same term.',
  examples: [],
  selectPairs: () => [],
});

const PAIR: Pair = {
  id: 'probe~probe@1',
  itemId: 'probe',
  item: 'Autocasco',
  record: { key: 'probe', rev: 1, kind: 'glossary_term', text: 'term_verbatim: Autocasco (AC)' },
};

try {
  const login = resolveJudgeLogin();
  const out = await callJudge({
    model: PROBE.model,
    system: systemPrompt(PROBE),
    user: userMessage(PAIR),
    login,
  });
  const checks = checkIsolation(
    out.init,
    out.usage,
    out.configDir,
    forbiddenNames(homedir(), REPO_ROOT),
  );
  for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.check}: ${c.detail}`);
  console.log(
    `\nlogin: ${describeLogin(login)}\nmodel: ${out.init?.model ?? '?'}, Claude Code ${out.init?.claudeCodeVersion ?? '?'}` +
      `\nanswer: ${out.answer ? `${out.answer.verdict} (${out.answer.reason})` : `none (${out.rawResult.slice(0, 200)})`}` +
      `\ncost: $${out.usage.usd.toFixed(4)}, ${out.usage.input_tokens} in / ${out.usage.output_tokens} out, ${Math.round(out.durationMs / 1000)} s`,
  );
  process.exitCode = checks.every((c) => c.ok) && out.answer ? 0 : 1;
} catch (e) {
  if (e instanceof JudgeSetupError) die(`judge cannot run (${e.code}): ${e.message}`);
  throw e;
}
