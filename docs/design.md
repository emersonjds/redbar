# redbar — design, decisão por decisão

> O mergulho fundo. O [README](../README.md) é o resumo; este documento guarda cada decisão
> de design e o porquê dela, na íntegra.

---

## The problem

Nobody argues that tests matter. Teams still ship without them, and it is almost never laziness. It is two different problems that get treated as one:

**1. Nobody knows where the holes are.** Coverage sits at 43%, and that number tells you nothing about whether *the thing you shipped last Tuesday* is tested. That is a **data problem** — not an AI problem.

**2. When someone does write a test, it comes out in a style nobody agreed on.** Six developers, six styles. Hand it to an AI agent and you get a seventh — whatever the model felt like that morning. That is a **convention problem** — not a tooling problem.

Conflating the two is the classic mistake. redbar attacks both, with different mechanisms: the first with the compiler and git, the second with a spec the agent is forced to read — **the library's own documented standard**, so the tie-breaker is not one more opinion.

## What it does

Coverage tools tell you what percentage of your codebase is covered. Useless on a Tuesday afternoon.

redbar answers the only question that matters in a pull request:

> **What did I just change that nothing tests?**

It reads the coverage report your project already produces, crosses it with `git diff main...HEAD`, and ranks what is left by how dangerous it is.

```
language: TypeScript
runner:   jest
base:     origin/master
gaps:     289

! [5742] e2e          src/pages/Checkout/index.tsx:124  Checkout      — 99 line(s), 28 branch(es)
! [4800] e2e          src/pages/Register/index.tsx:146  Register      — 100 line(s), 23 branch(es)
! [ 798] e2e          src/pages/Product/index.tsx:40    narrowAsset   — 21 line(s), 18 branch(es)
  [ 564] integration  src/api.ts:15                     request       — 47 line(s), 11 branch(es)
  [ 340] unit         src/components/ui/Button.tsx:22   Button        — 96 line(s),  7 branch(es)
```

Read one line of that: a symbol name, the kind of test it is missing, how many uncovered lines you added, and how many branches are hiding in there. `!` means the symbol has **no** coverage at all. That is a to-do list, not a dashboard.

## The whole flow, end to end

You point redbar at a repo. It takes you from "I don't know what's untested" all the way to "tested code, and a report of what happened" — and the line down the middle is the whole design: **everything above it is measured, nothing above it calls a model.**

```
  you: a repo, on a branch with work on it
        │
        ▼
  ┌─────────────────────────  THE MEASUREMENT  ·  zero LLM  ──────────────────────────┐
  │  1. detect the language and the runner        from the project's own manifest      │
  │  2. get a coverage report                     run the project's own command if none│
  │  3. cross it with  git diff base...HEAD       changed ∩ uncovered                   │
  │  4. attribute each uncovered line to a symbol, rank it, tag it unit/integration/e2e │
  └────────────────────────────────────┬──────────────────────────────────────────────┘
        │
        ▼
   the document        .redbar/TESTING.md · gaps.json · REDBAR.html · REDBAR.pdf
        │              what to test, in what order, at which layer, to whose standard
        │
  ══════╪═══════════  the frontier: a model is allowed in here, and nowhere above  ═════
        │
        ▼
  ┌─────────────────────────  THE WRITING  ·  one model, judgment only  ───────────────┐
  │  5. hand each gap to the agent  one at a time, with the layer's canonical standard  │
  │  6. gate what it wrote   scope · one-file · assertion · execution  (agent: no vote) │
  │  7. RE-RUN coverage, inspect again   a gap is "closed" because the report says so   │
  └────────────────────────────────────┬──────────────────────────────────────────────┘
        │
        ▼
   the outcome         .redbar/OUTCOME.md · .html · .pdf
                       measured verdicts, and the agent's own account, never mixed
```

Two halves, one line between them. The top half is the compiler and git; run it twice, get the same bytes. The bottom half is where the model finally does the one thing it is good at — writing a test — and even there it gets no say in whether the gap actually closed. That is measured again, from a fresh coverage report.

> **[See the whole flow as a diagram →](https://claude.ai/code/artifact/fac215b0-64a0-42c4-814f-eef64864049b)** — the twelve steps, the frontier, and the second measurement, laid out end to end.

### Finding the gaps — four steps, no magic

1. **Detect** the language and the test runner from the project's own manifest.
2. **Get** the coverage report the project produces — and if it is missing, run the project's own coverage command to produce it; if it is older than the code, say so, because a stale report hides the newest gaps best.
3. **Cross** it with the diff — what *changed* and is *uncovered*.
4. **Rank** by criticality, and label each gap `unit`, `integration`, or `e2e`.

### The analysis is zero-LLM, and that is the whole point

No model is called anywhere in this pipeline. The gap report is not an AI's opinion — it is your coverage report and your `git diff` talking.

This is not purism. It is the source of the number's authority. A wrong number from a language model is bad. **A wrong number from a regex is worse**, because it arrives wearing the compiler's uniform. So the analysis stays mechanical, deterministic, and auditable — you can check it by hand, and it gives the same answer twice.

Only the *writing* of a test touches an agent, and it does so through a small adapter.

### Two halves, and only one of them is a model

This is the shape of the whole tool, and the reason the tagline reads the way it does:

| | Who does it | Why |
|---|---|---|
| **Finding the gaps** | The compiler and git. **Zero LLM.** | A number you can audit, that comes out the same twice. |
| **Writing the tests** | Agents — Claude Code, Codex, or Copilot — **reading your spec**. | Writing a good test is judgment. That is what models are for. |

Getting this backwards is how tools end up asking a model to *guess* at coverage. redbar asks a model to do the one thing a model is actually good at, and nothing else.

### Spec-driven: the specialist agent **is** a markdown file

Here is the part most AI testing tools get wrong. They hand the model a file and ask for a test. What comes back is written in **the model's** house style — whatever it saw most on GitHub that day — and it drifts between runs. Six prompts, six styles. Which is the exact problem you were trying to solve.

So redbar never asks an agent to invent a standard. It hands it one:

```
prompt = conventions/<language>/<layer>.md   ← the library's canonical standard
       + the gap (file, symbol, uncovered lines, branches)
       + the source
       + one instruction: write exactly this test file, change nothing else
```

**The "senior specialist in Rust integration testing" *is* the file `conventions/rust/integration.md`.** There is no fleet of 30 hand-tuned prompts to maintain. Swapping the specialist means editing a markdown file — no release, no deploy.

#### The standard is the library's, not a committee's

This is a deliberate reversal, and it is the most important decision in the project.

The obvious move is to write *your company's* testing standard and feed the agent that. It is also wrong. The complaint is **"everyone writes tests their own way"** — and authoring a house standard does not fix that, **it adds a seventh way.** One more opinion, written by whoever came to the meeting, going stale the moment its author changes teams.

There is already a tie-breaker, and it is free:

| Layer | The spec is | Straight from |
|---|---|---|
| **e2e** | Role-based locators, web-first assertions, no CSS selectors | [Playwright Best Practices](https://playwright.dev/docs/best-practices) |
| **unit** (TS) | Vitest / Jest idiom — assert behavior, mock nothing | the official Vitest docs |
| **unit** (Python) | plain `assert`, fixtures over `setUp` | the pytest docs |
| **unit** (Java) | JUnit 5 + Mockito | the JUnit 5 user guide |
| **integration** (Java) | `@SpringBootTest` + Testcontainers | Spring & Testcontainers docs |
| **unit** (Rust) | `#[cfg(test)] mod tests` | The Rust Book, ch. 11 |

**Nobody argues with the Playwright docs in a code review. Everybody argues with the standard a colleague invented last week.** That asymmetry is the whole point — and the model was *trained* on those docs, so it follows them far more faithfully than it follows anything you wrote on Tuesday.

Every convention answers the same five questions, so two languages' standards can be diffed side by side:

1. Where the test file lives
2. What one test looks like (a real, copy-pasteable example)
3. What to assert — and what **not** to assert
4. What to mock, and what to never mock *(the line between unit and integration lives here)*
5. Naming

#### When your project really is different

Some choices are genuinely local and no library documents them: MSW or nock? Which fixture factory? Testcontainers, or a shared staging database?

```
conventions/<lang>/<layer>.md          # ships with redbar — the library's standard
.redbar/conventions/<lang>/<layer>.md  # optional — your project's deltas, appended
```

You start from the standard and state only your deltas. **If that override file starts growing, that is the smell** — a project that overrides everything has not adopted a standard, it has written a house style with extra steps.

### Every layer, decided for you

You do not tell redbar which kind of test you need, and neither does a model. It infers it from the code, the way a senior would in two seconds:

| Signal in the file | Layer |
|---|---|
| A route or controller — `pages/`, `routes/`, `@RestController`, `#[get(`, `Route::`, Next.js `app/**/page.tsx` | **e2e** |
| An I/O boundary — `repository`, `dao`, `client`, `gateway`, or it imports `sql` / `mongo` / `axios` / `jdbc` | **integration** |
| Anything else | **unit** |

A gap tagged `e2e` gets `conventions/<lang>/e2e.md`. A gap tagged `unit` gets the unit one. The layer picks the spec, the spec picks the style.

It is a heuristic, and it is wrong sometimes. That is fine: the cost of being wrong is a test at the wrong layer, not a broken test. Putting a model here would buy very little and would cost the zero-LLM guarantee that makes the number worth trusting.

### Ranking: which gap actually matters

Not all uncovered lines are equal. A 30-line straight-line function is safer than a 3-line one with four branches in it.

```
score = uncovered lines × (symbol has zero coverage ? 2 : 1) × (1 + branches)
```

Counting, not opinion. `branches` is a count of `if` / `for` / `while` / `case` / `catch` / `&&` / `||` — read from the code, ignoring the ones sitting inside comments, strings, and regex literals.

### Criticality: what to fix first

A score of `5742` does not tell anyone what to do on a Monday. A band does. It comes from two facts already measured — **is any of this symbol covered?** and **how much branching hides in it?** — and nothing else:

|  | 0 branches | 1–4 branches | 5+ branches |
|---|---|---|---|
| **no coverage** | medium | **high** | **critical** |
| partly covered | low | low | medium |

The threshold of 5 is [McCabe's](https://en.wikipedia.org/wiki/Cyclomatic_complexity): past it, a function needs a test. **Untested branching logic is the worst cell** — every branch is a path nothing has ever executed. Untested straight-line code is bad but bounded. Partly-covered code at least has a test pointing at it that someone can extend.

### The document — one inspection, every audience

The same measurement, rendered for whoever is reading. They cannot disagree with each other, and that is the only property that makes a report worth handing to someone who cannot re-run it.

| File | For | What it is |
|---|---|---|
| `.redbar/TESTING.md` | **the agent** | the brief it writes tests from — the work, the order, the layer, the standard, the provenance of every number. Self-contained: paste it into any agent, no redbar required |
| `.redbar/gaps.json` | **machines** | the stable contract — every gap plus its severity, and a flag when the report is stale |
| `REDBAR.html` | **you** | a ranked table with a print stylesheet |
| `REDBAR.pdf` | **management** | the same numbers; nobody forwards a terminal screenshot |
| a `<!-- redbar -->` PR comment | **the reviewer** | the gap table, editing its own comment on every push instead of stacking |

```bash
redbar briefing            # prints the brief and writes TESTING.md + HTML + PDF
redbar inspect --html x.html --md x.md   # the table, the PR comment
```

The PDF comes from the Chrome already on the machine driving its own print stylesheet — no PDF library in the dependency tree. No browser installed? The HTML carries the stylesheet, so `Cmd+P` produces the same file.

## "Why not just write a skill for this?"

The fair objection. You already have an agent. Write a skill — *"look at the diff, find what isn't tested, write the tests"* — and you are done in an afternoon. So why a tool?

Because a skill is a **prompt**, and the hard half of this problem is **not a prompt problem.**

| | A skill / prompt | redbar |
|---|---|---|
| **Where are the gaps?** | The model reads the code and *guesses* what looks untested. It has never executed a line of it. | It reads the coverage report. The runner already **measured** which lines executed. Not an inference — a measurement. |
| **Is the answer stable?** | Ask twice, get two answers. Different model, different list. | Deterministic. Same input, same output, byte for byte. It can be diffed in a PR. |
| **Can you trust the number?** | It is an opinion, and opinions cannot fail a build. | It is `git diff ∩ uncovered`. You can verify it by hand. |
| **Does it run when nobody remembers?** | Only when a human invokes it, on a machine that has it installed. | **CI gate.** It runs on every PR, for everyone — including the people who don't use AI. |
| **Does it work in Codex? Copilot?** | Skills are harness-specific. Rewrite it. | One engine, four faces: CLI, MCP, CI, library. Any agent, or none. |
| **Does the test it wrote actually pass?** | The model says it does. | It **runs** the test. Fails twice → marked `needs-human` and deleted. **Never commits red.** |
| **What does it cost to scan a big repo?** | The model must read the codebase to find candidates — slow, expensive, and it still misses things. | Seconds. It reads a report and a diff. Zero tokens. |

### The two failures a prompt cannot fix

**1. A model cannot know what is covered.** Coverage is a *runtime* fact — which lines the test suite actually executed. It is not visible in the source. An agent staring at `payment.ts` cannot tell you whether line 42 ran last night. It can only guess, confidently. redbar does not guess: the coverage report already contains the answer, measured by the runner.

This is the whole first half of the problem, and it is a **data problem, not an AI problem.** Reaching for a model here is using the one tool that structurally cannot answer the question.

**2. A prompt is opt-in, and opt-in does not change a team.** The developer who was already writing tests will run your skill. The one who wasn't, won't. Nothing changed.

> **You cannot force an agent to use a tool. You force the pull request.**

The CI gate is the only layer nobody routes around — and a gate needs a number that is *reproducible*, not a model's opinion that varies by run. A skill can never be that gate, no matter how good the prompt is.

### And the skill is not the enemy

redbar is not a replacement for your agent — it **aims** it.

Point the redbar MCP server at Claude Code, Codex, or Copilot, and the agent stops guessing what to test. It gets handed the exact symbol, the exact uncovered lines, and the canonical spec for the layer. **The skill is a consumer of redbar, not a competitor to it.**

What redbar contributes is the part a prompt structurally cannot: **the measurement, the determinism, and the gate.**

## Why ten languages does not cost ten times more

This is the design decision the whole project rests on.

**Coverage formats do not multiply with languages.** There is no format per language — there is a format per tooling ecosystem, and the languages cluster into three of them:

| Format | In the registry today | Same parser also reads |
|---|---|---|
| **lcov** | JavaScript, TypeScript, Rust | Ruby, C/C++, Swift |
| **Cobertura XML** | Python, PHP, Go | C# (coverlet), Kotlin via Gradle |
| **JaCoCo XML** | Java | Kotlin, Scala, Groovy |

**Three parsers, and the hard part is already done for the right-hand column too.** Everything that actually differs between languages — the root marker, the runner, the coverage command, where the report lands, which libraries to install, the regex that spots a public symbol — is **data**, not code.

### Adding a language is one line

It is a row in a table (`src/languages.ts`):

```ts
{
  id: 'ruby',
  name: 'Ruby',
  markers: ['Gemfile'],
  format: 'lcov',                                  // reuses the parser that already exists
  runners: [{
    name: 'rspec',
    detect: /rspec/,
    coverageCommand: 'COVERAGE=lcov bundle exec rspec',
    reportPath: 'coverage/lcov/project.lcov',
  }],
  sourceExtensions: ['.rb'],
  testFilePattern: /(^|\/)spec\/|_spec\.rb$/,
  symbolPatterns: [/^\s*def\s+(\w+)/, /^\s*class\s+(\w+)/],
  testLibs: { unit: ['rspec'], integration: ['rspec', 'webmock'], e2e: ['capybara'] },
  installCommand: (libs) => `bundle add --group test ${libs.join(' ')}`,
  canFix: true,
}
```

No new module. No `switch (language)` anywhere in the codebase — if one ever appears, the design has failed. That constraint is enforced in review, and it is why the tool can grow sideways without growing heavier.

## What it does for a development team

A tool nobody runs is a tool that does not exist. redbar is designed around a blunt fact:

> **You cannot force an agent to use a tool. You force the pull request.**

Three layers, in ascending order of force:

| Layer | What it is | Who it binds |
|---|---|---|
| **CI gate** | The PR fails when new or changed code carries gaps above the threshold. Same binary as the local run. | **Everyone. Nobody routes around it.** |
| **Repo config** | `AGENTS.md` and `.github/copilot-instructions.md` point at the same conventions document. | Every AI agent, automatically — nobody installs anything |
| **MCP** | The agent calls redbar directly and already knows what to do. | Whoever wants the convenience |

**MCP is what makes it pleasant. CI is what makes it mandatory.** Both, or neither works.

What a team actually gets:

- **Code review stops arguing about tests.** The gap list is in the PR, generated the same way for everyone. It is not a reviewer's opinion against an author's — it is the coverage report against the diff.
- **Tests stop being a matter of taste.** The standard is not a colleague's preference you can push back on — it is the library's own documentation. That ends the argument instead of relocating it.
- **New hires already know the standard.** They learned Vitest and Playwright the same way everyone else did: from the docs. There is no internal dialect to onboard into.
- **AI-written tests stop drifting.** The agent is handed the canonical spec before it writes a line, so the same gap produces the same shape of test today and next month — regardless of which model wrote it.
- **Legacy code is not a wall.** redbar only ever looks at what *changed*. A repo at 12% coverage is not asked to reach 80% — it is asked not to get worse. That is the only coverage rule anyone has ever actually kept.

### The gate, in the pull request

`redbar ci` fails the build when the diff carries gaps above the threshold, and `--md` writes the same table as a comment the reviewer actually reads. A gate that only prints `FAIL` gets disabled by the third person it blocks; a gate that names the symbol gets a test written.

```yaml
# .github/workflows/redbar.yml
on: pull_request
permissions: { contents: read, pull-requests: write }

jobs:
  gaps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }        # redbar diffs against the base branch
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run coverage           # whatever your runner's coverage command is
      - id: gate
        continue-on-error: true         # so the comment still lands on the run that fails
        run: npx redbar ci --base origin/${{ github.base_ref }} --md redbar.md
      - env: { GH_TOKEN: '${{ github.token }}' }
        run: |
          id=$(gh api "repos/${{ github.repository }}/issues/${{ github.event.number }}/comments" \
                --jq 'map(select(.body | startswith("<!-- redbar -->"))) | .[0].id // empty')
          [ -n "$id" ] \
            && gh api -X PATCH "repos/${{ github.repository }}/issues/comments/$id" -F body=@redbar.md \
            || gh api -X POST "repos/${{ github.repository }}/issues/${{ github.event.number }}/comments" -F body=@redbar.md
      - if: steps.gate.outcome == 'failure'
        run: exit 1
```

The comment carries a `<!-- redbar -->` marker, so every push **edits the same comment** instead of stacking a new one. A pull request with eleven redbar comments is a pull request where nobody reads the redbar comment.

The thresholds are `--max-critical` (default `0`) and `--max-high` (default: unlimited). Start with `--max-critical 0` and nothing else: it blocks only untested branching logic in code the branch actually touched, which is the one rule nobody argues with.

## Status

Honest about what exists today. The engine is done and exercised on real repositories; the surfaces around it are being built.

| | |
|---|---|
| ✅ **Engine** | Language + runner detection, three coverage parsers, diff crossing, symbol attribution, criticality ranking, layer classification |
| ✅ **Verified on real repos** | A production React Native app (Jest) and redbar itself (Vitest). Every serious bug in this tool was found that way |
| ✅ **CLI** | `redbar inspect`, `redbar briefing`, `redbar execute`, `redbar explain`, `redbar init`, `redbar ci`, `redbar mcp` |
| ✅ **Reports** | `.redbar/gaps.json` for the agent, a markdown comment for the pull request, a printable HTML/PDF table for the human |
| ✅ **CI gate** | `redbar ci --md` — fails the build and posts the gap table on the PR, editing its own comment instead of stacking |
| ✅ **`execute`** | Hands each gap to whichever coding agent is installed, gates what it wrote, then re-measures. `OUTCOME.md` reports the measured verdicts and the agent's own account, never mixed |
| ✅ **Agent skills** | `/redbar.inspect`, `/redbar.fix`, `/redbar.init` — the agent reads the gap and the spec, writes the test, **runs it**, and never leaves a red one |
| ✅ **MCP server** | `redbar mcp` — same engine, exposed to any MCP client |
| ✅ **Conventions** | TypeScript, Python, Java, Rust, PHP — unit, integration, e2e, each traceable to the library's own docs |
| 🚧 **Conventions** for Go | Same five questions, each ecosystem's idiom |
| 🚧 **`fix` worker pool** | Batch mode for CI: N gaps in parallel, partitioned by target file so two workers can never collide |

The design documents are in [`docs/superpowers/specs/`](superpowers/specs/), and the implementation plans in [`docs/superpowers/plans/`](superpowers/plans/).

## Use it with your agent

The skills work in Claude Code today, and they follow one rule: **the skill never analyzes coverage itself — it runs the engine and reports what came back.** The LLM orchestrates; it does not calculate.

```
/redbar.inspect          find what this branch left untested
/redbar.fix              write the missing tests, run them, never leave a red one
/redbar.init             propose the test libraries (it never installs them)
```

`/redbar.fix` is the whole pitch in one command. It reads `.redbar/gaps.json`, reads the canonical spec for that layer, writes **one** test file, **runs it**, and if it fails twice it deletes the file and marks the gap `needs-human`. It never weakens an assertion to get to green — a test that asserts nothing reports coverage that does not exist, which is the exact lie this tool was built to eliminate.

Agent instructions live in [`AGENTS.md`](../AGENTS.md), with `CLAUDE.md` and `.github/copilot-instructions.md` pointing at it. One source of truth, not five — **the agent loads it on its own, nobody installs anything.**

### `redbar execute` — the agent writes, redbar grades

```bash
redbar execute            # detects your agent, hands it every gap, then measures what changed
redbar execute --max 3    # the three worst gaps only
```

It finds whichever coding agent is installed (`claude`, `codex`, `copilot`, `gemini`,
`cursor-agent`), hands it **one gap at a time** with the canonical standard for that layer, and puts
everything it writes through four gates — none of which the agent has a vote in:

| Gate | If it fails |
|---|---|
| Did it touch product code? | **reverted.** An agent that "fixes" the source to make its test pass has silently changed what your system does. |
| Did it write more than one test file? | **all of them deleted**, marked `too-many-files`. Rule 1 of the prompt is "exactly one test file" — an ungraded extra file would still raise coverage and close the gap without ever passing the next two gates. |
| Does the test assert anything? | **deleted.** A test that asserts nothing still raises coverage. That is the trick this gate exists to catch. |
| Does the test pass? (one retry) | **deleted**, and the gap is marked `needs-human`. |

Before each gap runs, redbar snapshots which files are already dirty and subtracts that baseline
from what the agent touched — so gate one never reverts a human's uncommitted edit, and gap two
never inherits or deletes gap one's test file just because it is still sitting in the tree.

Then it **re-runs the coverage command and inspects again**. A gap is `closed` because the fresh
report says those lines now execute — not because the agent said so. `OUTCOME.md` renders the
measured verdicts (`closed`, `open`, `no-assertion`, `too-many-files`, `touched-source`) and the
agent's own account (`needs-human`, `timeout`, `no-output`) in two separate blocks, and the second
never gets to promote itself into the first.

`execute` refuses to run on a dirty working tree. It writes files and reverts files, and it cannot
tell its own writes from your uncommitted work — reverting the wrong one has no reflog and no stash
behind it. It names what is dirty and tells you to commit or stash first. There is no `--force`:
the same stance `git rebase` takes, for the same reason.

## Try it — the whole journey in four commands

Requires Node 20.11+. Stand in any repo, on a branch with work on it.

```bash
# 1. what did I change that nothing tests?
redbar inspect                 # the ranked gap list — measured, zero LLM

# 2. give me the brief to hand my agent
redbar briefing                # writes .redbar/TESTING.md + HTML + PDF

# 3. let my agent write the tests, and grade the result
redbar execute                 # detects your agent, gates its work, re-measures

# 4. prove any single number is real
redbar explain Checkout        # the lcov line, the diff line, the score arithmetic
```

Missing a coverage report? `inspect` runs your project's own coverage command for you. Only tests, no coverage step configured? It fails loudly with the exact command for **your** runner — jest and vitest do not share one, and neither do maven and gradle — and never guesses. No tests at all? It stops and points you at `redbar init`, which proposes the libraries and installs nothing.

Working from the redbar checkout instead of an install? Swap `redbar` for `npm run try --` or `npx tsx src/cli.ts`.

## Design principles

These are load-bearing. Each one is a decision that can be pointed at.

- **Zero LLM in the analysis.** The number's authority comes from the compiler and git. That is the pitch.
- **Zero runtime dependencies.** The coverage parsers are hand-written; the whole multi-LLM integration is `spawn()`. CI fails the build if a dependency shows up.
- **It never installs anything on its own.** Editing someone's `package.json` or `pom.xml` unasked is a rejected PR at best and a supply-chain incident at worst. `init` proposes; the human approves.
- **It never leaves a red test behind.** A generated test that fails twice is marked `needs-human` and deleted. One red test leaking into a demo erases everything else.
- **Every difference between languages is data.** If a `switch (language)` appears, the design failed.
- **Deterministic output.** Same input, same order, byte for byte. A report that reshuffles cannot be diffed in a PR, and a CI gate built on it would flap.

## Releases

Semantic versioning, and the tag is what publishes. There is no release bot and no
`semantic-release` in the dependency tree — a tool that sells zero runtime dependencies does not
bring thirty of them to cut a version.

```bash
npm run release:patch   # 0.1.0 → 0.1.1   a fix
npm run release:minor   # 0.1.0 → 0.2.0   a feature, or a change to the public surface
npm run release:major   # 0.1.0 → 1.0.0   a break
```

Each one bumps `package.json`, commits, tags, and pushes the tag. Pushing the tag triggers
[`release.yml`](../.github/workflows/release.yml), which **refuses to publish unless the build is
green** — typecheck, the full suite, the build, the zero-dependency assertion, and a check that the
tag matches the version in `package.json`. A tag is a promise; it does not get cut from a red build.

`preversion` runs the typecheck and the tests locally too, so a broken release fails on your machine
before it ever reaches CI.

While the major version is `0`, the public surface — the CLI flags, the `gaps.json` shape, the
`Language` registry type — can still shift in a minor. [`CHANGELOG.md`](../CHANGELOG.md) says when it
does.

## Contributing

The most valuable contribution is not code — it is **running redbar on a real repository and telling us what it got wrong.**

Every serious bug in this tool so far was found that way, and not one of them was caught by a hand-written fixture:

- A React Native app revealed that a file **no test imports never appears in the coverage report at all** — so the file with zero tests was invisible to the tool built to find files with zero tests. The exact inverse of the promise.
- The same app revealed that real React writes `const Button = (...)` and exports at the bottom, so demanding the `export` keyword left every component named `(no symbol)`.
- Running redbar on redbar revealed that a static data table scored 21 phantom branches — keywords counted from inside regex literals and comments.

Fixtures test what you already thought of. Real repositories test what you did not.

## License

[MIT](../LICENSE) © Emerson Silva
