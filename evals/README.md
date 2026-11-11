# Barnabas test conversations (evals)

About 27 scripted conversations that check how Barnabas actually behaves with the real Claude API:
hard moments, quick spoken answers, scripture and sermon prep, asking before acting, privacy, picking
the right tool, and honesty.

Each scenario signs in a fictional leader or member against the fictional test church and an
in-memory store, plays the scripted messages through the real engine (the same prompt, tools and
models as production), then grades the result two ways:

- **Code checks** (`evals/harness.ts`): which tools ran and in what order, what changed in the data
  (nothing without a yes), whether scripture is quoted word for word from the app's KJV text, whether
  spoken replies are short and plain, that no other family's names leak to a member.
- **An AI grader** (Claude Opus 5.5) for each scenario's `rubric`: warmth, gentleness in grief,
  honesty, brevity. It sees the transcript and the tools used, and passes a criterion only when the
  transcript clearly meets it.

Nothing leaves the sandbox: no real church data is read or changed, and no text, email or push can be
sent.

## Running

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run evals
EVAL_ONLY=grief-voice,crisis npm run evals     # some scenarios
EVAL_TRIALS=3 npm run evals                    # each scenario three times (replies vary run to run)
```

A full run makes roughly 60 to 100 Claude calls and costs about $5. Results go to
`evals/results/latest.json` (and a timestamped copy); each run prints what passed, what failed with
the transcript, the approximate cost, and which scenarios changed since the previous run.

Run it before and after changing the prompt (`src/lib/engine/prompt.ts`), the tools, the models or
the tone, and compare.

## Adding a scenario

Add an entry to `SCENARIOS` in `evals/scenarios.ts`: who is signed in, text or voice, the messages,
code checks, and a short rubric for the AI grader. Name tools through the `TOOLS` groups so a
scenario survives tools being merged or renamed. `tests/evals-harness.test.ts` checks every scenario
is well formed (it runs with the normal test suite, no key needed).
