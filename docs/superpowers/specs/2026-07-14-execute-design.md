# `redbar execute` — the agent writes the suite, and redbar grades it

**Date:** 2026-07-14
**Status:** approved

## The problem

`redbar briefing` produces the document. Someone still has to hand it to an agent, watch the agent
work, and afterwards answer the only question anyone actually cares about: **did it work?**

Today that answer comes from the agent. It writes tests, says "done, 12 tests written", and the
human has no cheap way to check. That is a model grading its own exam — the exact failure this
project was built to eliminate on the *finding* side, reintroduced on the *writing* side.

## The idea

`redbar execute` drives the agent, gap by gap, and then **measures what changed** instead of asking.

```
inspect  ──►  the BEFORE (gaps.json, TESTING.md)
                    │
                    ├── for each gap, worst first:
                    │      spawn the agent  ──►  three gates  ──►  journal
                    │
re-run coverage  ──►  inspect again  ──►  the AFTER
                    │
                    └──►  BEFORE × AFTER  ──►  OUTCOME.md / .html / .pdf
```

**A gap is closed when the coverage report says it is closed.** Not when the agent says so.

## Architecture

### 1. The agent registry — `src/agents.ts`

Data, not code. Same rule as `src/languages.ts`: if a `switch (agent)` ever appears, the design has
failed.

```ts
export type Agent = {
  id: string
  /** the binary, looked up on PATH */
  bin: string
  /** argv for a single headless, non-interactive run */
  args: (prompt: string) => string[]
}
```

Detection = the first agent in the table whose `bin` resolves on `PATH`. `--agent <id>` overrides.
No agent found is a clean error naming the ones it looked for — never a silent no-op.

The initial table: `claude`, `codex`, `copilot`, `gemini`, `cursor-agent`.

### 2. The assertion counter — registry data in `src/languages.ts`

A new field per language, one line, alongside `symbolPatterns`:

```ts
assertionPatterns: RegExp[]   // ts: /\bexpect\s*\(/, /\bassert\w*\s*\(/
```

`countAssertions(source, language)` lives in `src/assertions.ts` and is **pure**.

### 3. The loop — `src/execute.ts`

The agent runner is **injected**, exactly like the MCP's `ToolBox`:

```ts
export type RunAgent = (prompt: string) => string   // returns the agent's stdout
export function execute(root, inspection, conventions, run: RunAgent, opts): Journal
```

That is what makes the whole thing testable without spawning a process. The real spawn lives in
`cli.ts`, where the disk and the process already live.

For each gap, worst band first:

1. Build the prompt: **that one gap** + the convention for its layer + the source file + one
   instruction — write exactly one test file, change nothing else.
2. Run the agent.
3. Discover what it wrote, from `git status --porcelain`. Not from what the agent claims.
4. **Three gates**, all deterministic, all redbar's:

| Gate | Question | On failure |
|---|---|---|
| **scope** | did it touch product code? | `git checkout --` the product files. Verdict `touched-source`. |
| **assertion** | does the test file assert anything? | delete the file. Verdict `no-assertion`. |
| **execution** | does the test pass? (one retry) | delete the file. Verdict `needs-human`. |

5. Append the verdict to `.redbar/journal.json` — append-only, so `execute` resumes after a crash.

**The scope gate is the one nobody asks for and the one that matters most.** An agent that "fixes"
product code to make its test pass closes the gap, raises coverage, passes the suite — and has
silently changed the behaviour of the system. redbar must be able to say: you may write in files
matching `testFilePattern`, and nowhere else. Everything else is reverted.

### 4. The outcome — `src/outcome.ts` (pure) and `src/report.ts`

Cross the BEFORE gaps with the AFTER gaps. A gap present before and absent after is **closed, and
that is a measurement**.

| Verdict | Where the fact comes from |
|---|---|
| `closed` | **MEASURED** — has assertions, passes, and the line now executes in the fresh report |
| `open` | **MEASURED** — still uncovered |
| `no-assertion` | **MEASURED** — the file asserted nothing; redbar deleted it |
| `touched-source` | **MEASURED** — the agent edited product code; redbar reverted it |
| `needs-human` | **THE AGENT SAID** — failed twice. The reason is the agent's words, labelled as such |

`OUTCOME.md` renders these in two visually separate blocks — **what was measured** and **what the
agent claims**. The second never contaminates the first. Same three renderings as the briefing:
markdown for the agent and the repo, HTML for the human, PDF for whoever asks for one.

## Errors

- **No agent on PATH** — error naming every binary it looked for, and `--agent` to force one.
- **The agent writes nothing** — verdict `no-output`. Not a crash.
- **The agent hangs** — per-gap timeout (default 300s), verdict `timeout`, loop continues.
- **The final coverage run fails** — the journal is already on disk. Report what is known, say
  plainly that the AFTER could not be measured, and do not guess.

## Testing

- `execute.ts` — the whole loop with a fake `RunAgent`: every gate, every verdict, the retry, the
  resume. No process spawned.
- `assertions.ts` — pure, one case per language.
- `agents.ts` — detection order and the `--agent` override.
- `outcome.ts` — pure crossing of BEFORE × AFTER.
- **A real repository.** The Python repo used to find the cobertura bug is the harness: a real gap,
  a real agent, a real second measurement. Fixtures test what we already thought of.

## What this deliberately does not do

- **No parallelism.** Two agents writing into one worktree collide.
- **No auto-commit.** `execute` leaves the tree dirty. A human reads the diff.
- **No mutation testing.** It is the rigorous answer to "is this test any good", and it costs a
  mutation tool per language — which breaks both zero-dependency and any-language. The assertion
  gate catches the real failure mode; a deliberately stupid assertion still gets through, and that
  is a known ceiling, not an oversight.
