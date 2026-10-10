# 5. LLM as a judge

## The idea in one paragraph

Some checks are about meaning, not form. "Does this BA record state the age rule correctly?" can't be
answered reliably by string matching (section 3 showed both false passes and false fails). A person could
answer it in five seconds. **An LLM judge is a second model call that answers one narrow question like
that, returns pass/fail plus a reason, and is trusted only after you've checked that it agrees with your
own answers.**

The last part is the whole difference between a judge that helps and one that just adds noise.

## When to use a judge, and when not

| Use code (deterministic) | Use a judge | Use a human |
| --- | --- | --- |
| Screens (route template matches) | Rules (does a record state this rule, correctly?) | Calibrating the judge (labels) |
| Fields (label exists) | Processes (does the record describe this process's steps and end?) | Hold-out ground truth |
| Constraints with a clear value (`max_length: 5`) | Over-claims phrased in prose ("the system always...") | Periodic spot checks of the judge |
| Hard safety checks (`password_hits = 0`) | Terms with variants ("Autocasco" vs "Autocasco (AC)"), if exact match turns out too strict | |

Rule of thumb: **code first**. Add a judge only for categories where you've shown (exercise 1.2) that
code gives wrong answers.

## Known weaknesses of judges

| Bias | What happens | Defence |
| --- | --- | --- |
| **Position bias** | When comparing two answers, it prefers the first (or second) one | Don't do pairwise comparison; grade one record against one ground-truth item |
| **Verbosity bias** | Longer answers look better | Ask a binary factual question, not "how good is it" |
| **Self-preference** | A model rates text in its own style higher | Calibrate against your labels; optionally cross-check with a different provider |
| **Leniency** | Says "pass" when unsure | Instruct "if the record doesn't clearly state it, fail"; measure the true-negative rate |
| **Scale drift** | "Rate 1–5" means different things each call | Use pass/fail only |
| **Non-determinism** | The same question gets different verdicts | Measure it: run the judge 3× on the calibration set |

## How to build one: the method

This follows Hamel Husain's "critique shadowing" approach.

1. **Write down the question per category, in one sentence.**
   Rules: *"Does this documentation record state the given business rule, with the same limits and
   conditions, as something the portal does?"*
2. **Build a labelled set (you, by hand).** 40 pairs of (ground-truth rule, BA record), roughly half that
   should pass and half that should fail. For each one: `pass` or `fail` plus one sentence why. Take the
   pairs from real eval outputs (`/tmp/pf-eval-*`), and include tricky ones: right rule, wrong limits; right
   limits, wrong field; rule stated as an open question; etc.
3. **Split it**: 20 for developing the prompt (dev set), 20 locked away for the final check (test set).
4. **Write the judge prompt** (Claude can draft it): the question, the definitions of pass and fail, 3–5
   of your labelled examples *with your reasons* as few-shot examples, and the output format.
5. **Run it on the dev set, compare with your labels**, read every disagreement, improve the prompt
   (usually: clearer definition of fail, one more example). Repeat until it agrees on ~90 %.
6. **Run it once on the test set.** That's its real agreement. If it's much lower than on the dev set,
   you've tuned the prompt to the dev examples.
7. **Report two numbers, not one**:
   - **True-positive rate (TPR)**: of the pairs you said pass, how many did the judge pass?
   - **True-negative rate (TNR)**: of the pairs you said fail, how many did the judge fail?

   A judge that passes everything has TPR 100 % and TNR 0 %. "Accuracy 80 %" hides that.
8. **Re-check regularly.** When the BA prompt changes a lot, or every month, label 10 new pairs and see if
   the judge still agrees.

## How it fits into this harness

### Where

After the deterministic `evaluate()` in `apps/crawler/evals/scorers/docs-coverage.ts`, add a judge step for rules
(and later processes). Keep code matching for screens, fields and constraints.

```
crawler (map) → BA → evaluate() (code)  ──┐
                                          ├→ scores JSON (+ judge verdicts and reasons)
                  judge(rules, records) ──┘
```

### Prefilter with code, judge only the candidates

Don't ask the judge to read all records for every rule. Use code to pick the candidates (records citing
the anchor screen, as `ruleRecords()` already does), then ask the judge about each (rule, candidate) pair.
That's cheaper, and each question stays narrow.

### How to call it with only Claude

You already spawn headless Claude in `evals/harness/agent.ts` (`claude -p ... --output-format json`). A judge call is
the same, without agents, tools or MCP servers, and with a JSON schema so the answer is always parseable:

```bash
claude -p "$PROMPT" \
  --model sonnet \
  --tools "" \
  --strict-mcp-config \
  --no-session-persistence \
  --output-format json \
  --json-schema '{"type":"object","properties":{"verdict":{"enum":["pass","fail"]},"reason":{"type":"string"}},"required":["verdict","reason"]}'
```

(Flags checked against the local Claude Code CLI, version 2.1.288. Check `claude --help` if something
changed.)

A sketch of the TypeScript side, a new scorer in `evals/scorers/`, calling headless Claude the way `runAgent` in `evals/harness/agent.ts` does:

```ts
interface Verdict { verdict: 'pass' | 'fail'; reason: string }

function judgeRule(rule: GroundTruthRule, record: EvalRecord): Verdict {
  const prompt = [
    JUDGE_INSTRUCTIONS,               // question + pass/fail definitions + your few-shot examples
    `<rule>${rule.statement}</rule>`,
    `<record>${JSON.stringify(record.content)}</record>`,
  ].join('\n\n');
  const r = spawnSync('claude', ['-p', prompt, '--model', 'sonnet', '--tools', '',
    '--strict-mcp-config', '--no-session-persistence', '--output-format', 'json',
    '--json-schema', VERDICT_SCHEMA], { encoding: 'utf8' });
  return parseVerdict(r.stdout);       // read the structured result from the JSON envelope
}
```

Store every verdict with its reason in the eval result. Then you can read *why* the judge passed or failed
something, which is how you review the judge later.

An alternative is the Agent SDK (TypeScript) with an API key, which gives more control (temperature,
caching) and doesn't use your subscription quota. For a first version, the CLI is enough and matches what
the eval already does.

### Do you need OpenRouter or a second provider?

**Not to start.** The main risk isn't "Claude judging Claude", it's an uncalibrated judge. A Claude judge
that agrees with your labels at TPR/TNR ≥ 90 % is fine, whichever company made it.

A second provider becomes useful later, as a **cross-check**:

- Run the same judge prompt on another model (via OpenRouter, or directly) over the calibration set.
- If both agree with your labels, good. If only Claude agrees, self-preference may be inflating scores.
- Costs are small: about 20 rules × a few candidates × short prompts is cents per eval.

If you add it: keep the provider behind one small function (`judge(prompt) → Verdict`), put the key in the
existing vault or an env variable (never in the repo), and remember you're sending portal content to
another company. Fine for the reference portal and proving ground; check before sending a client portal's
data.

## How to review a judge

- **Agreement table** on the test set (your label vs judge):

  |  | Judge pass | Judge fail |
  | --- | --- | --- |
  | **You: pass** | ✅ true positive | ❌ false negative |
  | **You: fail** | ❌ false positive | ✅ true negative |

- **Read every disagreement.** Sometimes *you* were wrong. Fix your label then (that's criteria drift,
  and normal).
- **Stability**: run it 3× on the same set. If verdicts flip on more than ~5 % of items, make the question
  narrower or take the majority of 3.
- **Watch the reasons**, not just the verdicts. A pass with a reason that doesn't match the record is a bug.

## Exercises

- **5.1 Label 40 pairs.** From one or two reference-insurer eval outputs, take 40 (rule, record) pairs.
  Label pass/fail with one sentence each, in `learning/notes/judge-labels.md` (or a small rating page,
  as you liked for the glossary). 1–2 hours. This is the most valuable part: you'll discover what *you*
  mean by "documented the rule".
- **5.2 Build and calibrate.** Let Claude implement the judge step (spec it as a small roadmap item).
  Calibrate on 20, test on 20, report TPR/TNR.
- **5.3 Compare.** Score the last 3 reference-insurer runs with both the code matcher and the judge. Where
  do they disagree, and who's right?

## Where in your process

- **R-39 (BA goal quality)** is the natural place: before raising the rules score, make the rules score
  trustworthy.
- **Any new semantic category** (e.g. R-37 query-parameter dependencies, R-44 revisions) gets a judge
  only with a labelled set.

## Resources

**Articles**
- Hamel Husain: [Creating a LLM-as-a-Judge That Drives Business Results](https://pages.hamel.dev/posts/new-blog-post-creating-a-llm-as-a-judge-that-drives-business-results) (critique shadowing). Summary by [Simon Willison](https://simonwillison.net/2024/Oct/30/llm-as-a-judge). **Read first.**
- Eugene Yan: [Evaluating the Effectiveness of LLM-Evaluators (aka LLM-as-Judge)](https://eugeneyan.com/writing/llm-evaluators/). The broadest overview: techniques, alignment, critiques.
- Shankar et al.: [Who Validates the Validators?](https://arxiv.org/pdf/2404.12272). Why judges must be aligned to human grades; criteria drift.
- Zheng et al.: [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://neurips.cc/virtual/2023/poster/73434). Where position, verbosity and self-enhancement bias were measured.
- Anthropic: [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system). Their judge rubric (accuracy, citations, completeness...) for an agent producing cited documents, close to your BA.
- Anthropic docs: [Develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests). Includes LLM-graded examples and tips.
- Survey (for depth, optional): [LLMs-as-Judges: A Comprehensive Survey](https://arxiv.org/html/2412.05579v2).

**Video**
- DeepLearning.AI: [Evaluating AI Agents](https://www.deeplearning.ai/short-courses/evaluating-ai-agents/) (free). Lessons on choosing code vs LLM-as-judge evaluators, with code you can watch run.
- Lenny's Podcast with Hamel and Shreya (YouTube, [notes](https://www.lennysnewsletter.com/p/why-ai-evals-are-the-hottest-new-skill)). They build an LLM-judge prompt from error-analysis notes.

**Paid**
- Maven *AI Evals for Engineers & PMs* ([page](https://maven.com/courses/for-engineers/evals)). Has a full module on designing and validating judges.
