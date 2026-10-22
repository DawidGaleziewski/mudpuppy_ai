# Review evals
Afte revieweing evals I started with crawler/scripts/eval and package.json.
These are my questions. I want to understand these things. Discuss with me to make my understaning better.
Don't just agree with me. Push back if I am wrong.


## crawler evals

### export async function healthy(url: string): Promise<boolean> {
First. why imports for this function are bellow comment? Doesnt eval work as tools calls and isnt it better for LLM to have description above function?

Secondly, why this is a eval? We check for url to come back. Shouldnt it be a test? It is quite deterministic what url we get, isnt it?
Is there a reason beheid it beeing a eval?


### ensurePortal

Nested ternary. Is there a reason for this? Maybe better use if/gards or swithces. This is hard to read. Or is it easier to llm. If not lets add to our linting rules that no nested ternaries
Also quite hard to figure out what exactly it does, i would move it to helper functionj wi9th discriptive name. For more declarative code. 

```typescript
  const [probe, cmd, args] = estate
    ? [
        'http://127.0.0.1:4100/healthz',
        'node',
        [
          join(root, 'apps/proving-ground/scripts/start.mjs'),
          ...(sessionTimeoutS === undefined ? [] : ['--session-timeout', String(sessionTimeoutS)]),
        ],
      ]
    : portal === 'reference-insurer'
      ? [
          'http://127.0.0.1:4010/robots.txt',
          'pnpm',
          ['--dir', join(root, 'apps/crawler'), 'reference-portal'],
        ]
      : [null, null, null];

```

In general whole estate.ts seems more like a unit test then a eval to me. it is more true false and deterministic. Or am I wrong?


### sweep.ts

I havew a bit hard time undesrstand purpose of this whole eval. Am I correct it does check for security concerns like passwords stored inf iles

```typescript
/**
 * Inputs of the eval's password sweep (spec 014 US1 AS1.3, D3): the persona's vault passwords
 * and every place an agent run can leave text. The counting itself is `passwordHits` in
 * `@mudpuppy/gates`; nothing here prints a secret.
 */
```


So this is a security sweep? This seems a bit costly tbh. Not much against security in general. But nor sure I want to spend to much tokens on this.
Also this could not be deterministic test? Passwords are usually detected by static code analysis in things lkike sonarQUbe. Not sure this is right place for checking security


### workspace.ts
```typescript
/**
 * A fresh workspace with copies of portals/, personas/ and the migrations, so the developer's
 * store is never touched. The portal's credential rows are copied in (they stay encrypted; the
 * same vault key opens them).
 */

```

Again I see security concerns here. First think when I look into files. It is hard for me to seperate what evaluates portal actual work and what checks for security. Myabe we could seperate this into own cocnerns. By having evals folder and seperate files for each concern. security and thing slike processes (maybe better name for this) or goals we should achieve


### eval-run.ts
If i understan this. This in main eval router?
This seems very messy. I cant really understand what is going on here.

I like the fact we are putting this in names vars. I dont like the fact this is in main one big function. 
Probably we should make a folder  and add utils there. I want code to be declatrative. I want to know what is going on

```typescript
const root = resolve(join(import.meta.dirname, '../../..'));
const argv = process.argv.slice(2);
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`);
  return i > -1 && argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[i + 1] : undefined;
};
const has = (n: string) => argv.includes(`--${n}`);
const die = (msg: string, code = 2): never => {
  console.error(msg);
  process.exit(code);
};
/** Inside the run: throw, so `finally` still stops the portal server (spec 009 F-16). */
class EvalAbort extends Error {}
const abort = (msg: string): never => {
  throw new EvalAbort(msg);
};


```

Again cool that these are named but maybe put them in a object or a class? So that we know where this came from and what it should be doing without implementation details.
```typescript
const portal = argv[0];
if (!portal || portal.startsWith('--') || !/^[a-z0-9][a-z0-9_-]*$/.test(portal))
  die('usage: pnpm eval <portal> [--persona guest] [--budget-usd 5] [--promote] [--dry-run]');
const persona = arg('persona') ?? 'guest';
const budget = arg('budget-usd') ?? '5';
const env = arg('env') ?? 'sandbox';
const model = arg('model');
const timeoutArg = arg('session-timeout');
const sessionTimeout = timeoutArg === undefined ? undefined : Number(timeoutArg);
if (sessionTimeout !== undefined && !(Number.isInteger(sessionTimeout) && sessionTimeout > 0))
  die('--session-timeout takes a whole number of seconds');
const evalDir = join(root, 'data', 'evals', portal!);
```

Again this seems something that we may want to remove from this main file? Maybne this could be more general part of somekind of utils package? This sounds like it does not only relate to this particular eval


### Run agent
I like this function as it is a bit easier to read:
```typescript
function runAgent(ws: string, agent: 'crawler' | 'ba', prompt: string, sessionId: string): CliOut {
  const args = [
    '-p',
    prompt,
    '--agent',
    agent,
    '--session-id',
    sessionId,
    '--output-format',
    'json',
    '--max-budget-usd',
    budget,
    '--mcp-config',
    join(root, '.mcp.json'),
    '--strict-mcp-config',
    // Only the agent's own server: every tool of it, nothing else.
    '--allowedTools',
    agent === 'crawler' ? 'mcp__mudpuppy' : 'mcp__mudpuppy-ba',
    ...(model ? ['--model', model] : []),
  ];
  const r = spawnSync('claude', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, MUDPUPPY_ENV: env, MUDPUPPY_ROOT: ws },
  });
```

but i have my doubts here. First. it has  a lot of implemenmtation details before it. 
This seems like entry point to running agent. And actualy thing that interests us. And interests you as LLm when you search for scanning it. Maybe this should be mor expoised and rest hhidden (idk much about how LLMs call function so aI maybe wrong here). But wouldnt it be both easier to read for me, and you. IF you were using something lise a class, that is instanced. and has exported interface. Where you know what exactly to use. What params it has and what they do. So you can instatiate and only use what you need. Without looking into implementation details?
But maybe I am wrong because it is run from LLM so maybe you do not see this that much. Still making this more declarative, and  exposing things that matter, without implementation details in one big file could be better. But question is it better for both LLM and human?

# prompts
I think this is very important. And it is quite unfortunete I had to keep fishing to find it. we probably have to move it to its own file

```typescript
const PROMPTS = {
  crawler: (p: string, who: string) =>
    `Map the portal "${p}" as persona "${who}" in map mode, following your procedure until the frontier is empty or a budget ends. ${who === 'guest' ? '' : 'Log in right after the first navigate.'} Report as your Return section says.`,
  ba: (p: string, runId: string) =>
    `Document the portal "${p}" from the recorded map run ${runId}: start one analysis session over that run, do all seven passes as the ba-practice skill says, answer any pending feedback, and finish the session. Report as your Return section says.`,
};
```

/evals
Inside sperate folders for: sample_prompts (super important)

## measure 
If i understand correctly this is how we  gather data, that will be later used for eval

```typescript
async function measure(ws: string, gt: GroundTruth, runId: string, sessions: Sessions) {
  const opened = openDb(dbPathFor(join(ws, 'data'), env));
  opened.raw.pragma('query_only = ON');
  const one = <T>(sql: string, ...p: unknown[]) => opened.raw.prepare(sql).get(...p) as T;
  const col = (sql: string, ...p: unknown[]) =>
    (opened.raw.prepare(sql).all(...p) as { v: string }[]).map((r) => r.v);
  const session = one<{ id: string; status: string } | undefined>(
    'SELECT id, status FROM analysis_sessions WHERE portal_id = ? AND started_at >= ? ORDER BY started_at DESC LIMIT 1',
    portal,
    started,
  );
  const input = loadEvalInput(opened.raw, portal!);
  const report = evaluate({ portal_id: portal!, ...input, groundTruth: gt });
  const final = one<{ status: string; steps_used: number }>(
    'SELECT status, steps_used FROM runs WHERE id = ?',
    runId,
  );
  const pending = one<{ n: number }>(
    "SELECT count(*) AS n FROM frontier WHERE run_id = ? AND status = 'pending'",
    runId,
  ).n;
  const count = (rule: string) =>
    one<{ n: number }>(
      'SELECT count(*) AS n FROM decision_log WHERE run_id = ? AND rule = ?',
      runId,
      rule,
    ).n;
  const routes = col(
    'SELECT DISTINCT s.route_template AS v FROM state_observations o JOIN states s ON s.id = o.state_id WHERE o.run_id = ?',
    runId,
  );
  // Pages read inside frames count as reached under their own route (spec 015 F-13).
  const framed = frameRoutes(
    col(
      'SELECT composition_json AS v FROM state_observations WHERE run_id = ? AND composition_json IS NOT NULL',
      runId,
    ),
  );
  const crawl = crawlScreens(gt.screens, [...routes, ...framed], persona !== 'guest');
  const widget = widgetActions({
    edgeActions: col(
      "SELECT action_json AS v FROM edges WHERE run_id = ? AND status = 'executed'",
      runId,
    ),
    actionCalls: col(
      'SELECT url_template AS v FROM network_calls WHERE run_id = ? AND edge_id IS NOT NULL',
      runId,
    ),
  });
  await opened.close();
  console.log(
    `crawl: ${crawl.matched}/${crawl.total} ground-truth screens${crawl.missing.length ? `, missing ${crawl.missing.join(', ')}` : ''}; frontier pending ${pending}`,
  );
  const hits = await sweep(ws, sessions);
  return {
    session,
    scores: {
      ...Object.fromEntries(
        Object.entries(report.scores).map(([k, s]) => [
          k,
          { matched: s.matched, total: s.total, pct: s.pct },
        ]),
      ),
      crawl_screens: { matched: crawl.matched, total: crawl.total, pct: crawl.pct },
    },
    overclaims: report.overclaims.length,
    checks: {
      frontier_empty_at_finish: final.status === 'completed' && pending === 0,
      // false when the agent's budget cut the run short (status `interrupted`): not a fair baseline
      crawler_completed: final.status === 'completed',
      crawler_steps: final.steps_used,
      frontier_pending: pending,
      ba_session_completed: session?.status === 'completed',
      handoffs: input.handoffs.length,
      relogins: count('relogin'),
      logged_in: count('login') > 0 && persona !== 'guest',
      password_hits: hits.total,
      widget_actions: widget,
    },
  };
}
```

But what exactly are we mesuring here? Like we get genral information on the run, and actions we did. THis seems ok in general. But I am not sure if this does measure  if we have reached our goal. Btw do we measure here clrawler run? Or Ba creating docs? Or both?
Again a lot of implementation details. I would like to have SQL queries nicly put in a object/dictonary in same folder as here in seperate file with names on what exactly we want to get by that query.

This seems like quite large eval and it seems toi be trying measure everything. Maybe cut it in two? Or even focus on trying to do a mapping runs. Where we have evals for diffrent portals we have. To check and evaluate how each mapping went? Focusing on if we cought specific obstacles and elements


## main
ahh ok so this is main
```typescript
preflight();
const gtPath = groundTruthPath(root, portal!);
if (!gtPath)
  die(`no ground truth known for ${portal}; only reference-insurer and proving-ground-*`);
const gt = GroundTruth.parse(JSON.parse(readFileSync(gtPath!, 'utf8')));
const started = new Date().toISOString();
if (has('dry-run')) {
  // Also opens the vault, so a missing key or a broken copy fails here, not after a paid crawl.
  const ws = createWorkspace(root, portal!, env);
  const secrets = await portalSecrets(ws, portal!, env);
  console.log(
    `dry run ok: ${portal} as ${persona}, budget $${budget}/agent, ground truth ${gt.portal_id}, ${secrets.length} secret(s) to sweep for`,
  );
  process.exit(0);
}
```

This probably should be in something like index.ts 


### save 

```typescript
function save(result: Result): void {
  mkdirSync(join(evalDir, 'history'), { recursive: true });
  const file = join(evalDir, `${started.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  const basePath = join(evalDir, 'baseline.json');
  const baseline = existsSync(basePath)
    ? EvalResult.parse(JSON.parse(readFileSync(basePath, 'utf8')))
    : null;
  const tolPath = join(evalDir, 'tolerances.json');
  const tolerances = existsSync(tolPath)
    ? Tolerances.parse(JSON.parse(readFileSync(tolPath, 'utf8')))
    : {};
  if (baseline && baseline.conditions?.session_timeout_s !== result.conditions?.session_timeout_s)
    console.warn(
      `warning: the baseline ran with session timeout ${baseline.conditions?.session_timeout_s ?? 'default'}, this eval with ${result.conditions?.session_timeout_s ?? 'default'}: not comparable`,
    );
  const cmp = compareEval(result, baseline, tolerances);
  process.stdout.write(comparisonMarkdown(result, cmp));
  console.log(`\nresult: ${file}`);
  if (has('promote')) promote(result, baseline, cmp.regressions);
  if (cmp.regressions.length > 0) process.exitCode = 1;
}
```
Ok cool but this seems like implementation details we doi not need.
Again seems we could be better of moving it to something like eval utils in same project. Is it btw something we will do for each eval or these crawler specific. Because if we releat it for each eval maybe eval-utils package is in order?

### promote 
agfain this is cool function but same things aplly as above. I dont want to see implementation details here. Will be follow this pattern on each eval? Then maybe own package for this?
a lib for handling evals. Saving things, proimoting things etc


### cost
Again implementation details and seem a bit generic. Maybe own package?

```typescript
const cost = { usd: 0, input_tokens: 0, output_tokens: 0, duration_ms: 0 };
const add = (o: CliOut) => {
  cost.usd += o.total_cost_usd ?? 0;
  cost.input_tokens +=
    (o.usage?.input_tokens ?? 0) +
    (o.usage?.cache_read_input_tokens ?? 0) +
    (o.usage?.cache_creation_input_tokens ?? 0);
  cost.output_tokens += o.usage?.output_tokens ?? 0;
  cost.duration_ms += o.duration_ms ?? 0;
};
```

### main lifecycyle?

out of the blue I see async code?
Again maybe this seems like main.ts candidate.

## suggested filder structurer

So I think we need to have at least all things EVAL related in eval folder.
I am a bit lost what is related to evals. I see:

### eval-run.ts
one huge function. No way of knowing this is the main eval entry without looking into it.
No place i can see test prompts quickly, add my own prompts for tests.

### eval folder 
not sure what are these? Are these evaluting something? Util functions for this particular crawler usae case?
Both docs audit and eval?
Not sure what is responsible for what.
I do not know where innput prompts are so I can easilly change them/add new eval prompts. Or even if these prompts are parts of same eval or couple evals.
Which is repsonsible for measuring and actual scoring. And which functions are just helpers in this.

I would like to see in general more declarative code. Less imperative functions.

## question me
What are good practices? Is this format good practice for creating evals in professional projects?
What are the enteties we usually have?
Like evals folder will have things like measures, index.ts, baselines, helpers etc?
Can you check some git projects that know what they are doing what is good structure>

ps. I event found pw-eval in crawler source not sure how it relates to other.
Ground truths are scattrered in packages/reference portal. This is something I should own then it shouyld be easy to access and modify. 
In general I think we probably should hoist eval folder into root. Not put it individual packages. Or maybe keep them per package but in root of that package



