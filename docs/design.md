# redbar — the design, decision by decision

> The deep dive. The [README](../README.md) is the summary; this document keeps every design
> decision and the reason behind it, in full.

---

## The problem

Nobody argues that tests matter. Teams still ship without them, and it's almost never laziness. These are two different problems treated as one:

**1. Nobody knows where the holes are.** Coverage reads 43%, and that number says nothing about whether *what you shipped last Tuesday* has a test. That's a **data problem**, not an AI problem.

**2. When someone does write a test, it comes out in a style nobody agreed on.** Six devs, six styles. Hand it to an AI agent and you get a seventh: whatever the model felt like doing that morning. That's a **convention problem**, not a tooling problem.

Mixing the two is the classic mistake. redbar attacks both, with different mechanisms: the first with the compiler and git, the second with a spec the agent is required to read. **The library's own documented standard**, so the tie-breaker stops being one more opinion.

## What it does

A coverage tool tells you what percentage of the code is covered. Useless on a Tuesday afternoon.

redbar answers the one question that matters in a pull request:

> **What did I just change that nothing tests?**

It reads the coverage report your project already produces, crosses it with `git diff main...HEAD`, and sorts what's left by how dangerous it is.

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

Read one line of that: a symbol name, the kind of test that's missing, how many uncovered lines you added, and how many branches are hiding in there. `!` means the symbol has **no** coverage at all. This is a to-do list, not a dashboard.

## The whole flow, end to end

You point redbar at a repo. It takes you from "I don't know what's untested" to "tested code, and a report of what happened." The line in the middle is the whole design: **everything above it is measured, nothing above it calls a model.**

```
  you: a repo, on a branch with work done
        │
        ▼
  ┌─────────────────────────  THE MEASUREMENT  ·  zero LLM  ────────────────────┐
  │  1. detect the language and the runner    from the project manifest         │
  │  2. grab a coverage report                run the project's command if      │
  │                                            there isn't one                   │
  │  3. cross with  git diff base...HEAD      changed ∩ uncovered               │
  │  4. attribute each uncovered line to a symbol, sort, tag                    │
  │     unit/integration/e2e                                                    │
  └────────────────────────────────────┬────────────────────────────────────────┘
        │
        ▼
   the document        .redbar/TESTING.md · gaps.json · REDBAR.html · REDBAR.pdf
        │             what to test, in what order, at which layer, following
        │             which standard
        │
  ══════╪═══════════  the boundary: a model is allowed here, and nowhere        ═════
        │             above it
        ▼
  ┌─────────────────────────  THE WRITING  ·  one model, judgment only  ───────┐
  │  5. hand each gap to the agent, one at a time, with the layer's canonical  │
  │     standard                                                              │
  │  6. gate what it wrote   scope · one file · assertion · execution         │
  │     (agent: no vote)                                                      │
  │  7. RUN coverage again, inspect again   a gap is "closed" because the     │
  │     report says so                                                       │
  └────────────────────────────────────┬───────────────────────────────────────┘
        │
        ▼
   the outcome        .redbar/OUTCOME.md · .html · .pdf
                      measured verdicts, and the agent's own account, never
                      mixed together
```

Two halves, one line between them. The top half is the compiler and git. Run it twice, the same byte comes out. The bottom half is where the model finally does the one thing it does well: write a test. And even there it gets no vote on whether the gap really closed. That's measured again, from a fresh coverage report.

> **[See the whole flow as a diagram →](https://claude.ai/code/artifact/fac215b0-64a0-42c4-814f-eef64864049b)** The twelve steps, the boundary, and the second measurement, start to finish.

### Finding the gaps: four steps, no magic

1. **Detect** the language and the test runner from the project manifest.
2. **Grab** the coverage report the project produces. If there isn't one, run the project's own coverage command to generate one; if it's older than the code, warn, because a stale report is great at hiding the newest gaps.
3. **Cross** it with the diff: what *changed* and is *uncovered*.
4. **Sort** by criticality, and tag each gap `unit`, `integration`, or `e2e`.

### The analysis is zero-LLM, and that's the whole point

No model is called anywhere in that pipeline. The gap report is not an AI opinion. It's your coverage report and your `git diff` talking.

This isn't purism. It's where the number's authority comes from. A wrong number from a language model is bad. **A wrong number from a regex is worse**, because it shows up dressed as a compiler. So the analysis stays mechanical, gives the same answer every time, and you can check it by hand. And it gives the same answer twice.

Only the *writing* of a test goes through an agent, and that happens through a small adapter.

### Two halves, and only one of them is a model

This is the shape of the whole tool, and the reason the slogan is what it is:

| | Who does it | Why |
|---|---|---|
| **Finding the gaps** | The compiler and git. **Zero LLM.** | A number you can check by hand, and that comes out the same twice. |
| **Writing the tests** | Agents (Claude Code, Codex, or Copilot) **reading your spec**. | Writing a good test is judgment. That's what a model is for. |

Invert that and you get the tool that asks a model to *guess* coverage. redbar asks the model to do the one thing it actually does well, and nothing else.

### Spec-driven: the specialist agent **is** a markdown file

Here's the part most AI test tools get wrong. They hand the model a file and ask for a test. What comes back is written in the **model's** style: whatever it saw most on GitHub that day. And it changes from run to run. Six prompts, six styles. Exactly the problem you set out to solve.

So redbar never asks an agent to invent a standard. It hands it one:

```
prompt = conventions/<language>/<layer>.md   ← the library's canonical standard
       + the gap (file, symbol, uncovered lines, branches)
       + the source code
       + one instruction: write exactly this test file, change nothing else
```

**The "senior specialist in Rust integration testing" *is* the file `conventions/rust/integration.md`.** There's no fleet of 30 hand-tuned prompts to maintain. Swapping the specialist is editing a markdown file. No release, no deploy.

#### The standard is the library's, not a committee's

This is a deliberate inversion, and it's the most important decision in the project.

The obvious move is to write *your company's testing standard* and feed the agent that. It's also wrong. The complaint is **"everyone writes tests their own way"**, and creating an in-house standard doesn't solve that, it **adds a seventh way.** One more opinion, written by whoever showed up to the meeting, that goes stale the minute the author changes teams.

A tie-breaker already exists, and it's free:

| Layer | The spec is | Straight from |
|---|---|---|
| **e2e** | Role-based locators, web-first assertions, no CSS selectors | [Playwright Best Practices](https://playwright.dev/docs/best-practices) |
| **unit** (TS) | Vitest / Jest idiom: assert behavior, mock nothing | the official Vitest documentation |
| **unit** (Python) | Plain `assert`, fixtures instead of `setUp` | the pytest documentation |
| **unit** (Java) | JUnit 5 + Mockito | the official JUnit 5 guide |
| **integration** (Java) | `@SpringBootTest` + Testcontainers | the Spring and Testcontainers documentation |
| **unit** (Rust) | `#[cfg(test)] mod tests` | The Rust Book, ch. 11 |

**Nobody argues with the Playwright documentation in a code review. Everybody argues with the standard a colleague invented last week.** That asymmetry is the whole point. And the model was *trained* on that documentation, so it follows it far more faithfully than anything you wrote on a Tuesday.

Every convention answers the same five questions, so you can hold two languages' standards side by side:

1. Where the test file lives
2. What a test looks like (a real example, ready to copy and paste)
3. What to assert, and what **not** to assert
4. What to mock, and what to never mock *(the line between unit and integration lives here)*
5. Naming

#### When your project really is different

Some choices really are local, and no library documents them: MSW or nock? Which fixture factory? Testcontainers, or a shared staging database?

```
conventions/<lang>/<layer>.md          # ships with redbar, the library standard
.redbar/conventions/<lang>/<layer>.md  # optional, your project's deltas, appended
```

You start from the standard and declare only your deltas. **If that override file starts to grow, that's the warning sign.** A project that overrides everything didn't adopt a standard, it just wrote an in-house style with an extra step.

### Every layer, decided for you

You don't tell redbar what kind of test you need, and no model does either. It infers it from the code, the way a senior would in two seconds:

| Signal in the file | Layer |
|---|---|
| A route or controller: `pages/`, `routes/`, `@RestController`, `#[get(`, `Route::`, Next.js `app/**/page.tsx` | **e2e** |
| An I/O boundary: `repository`, `dao`, `client`, `gateway`, or it imports `sql` / `mongo` / `axios` / `jdbc` | **integration** |
| Anything else | **unit** |

A gap tagged `e2e` gets `conventions/<lang>/e2e.md`. A gap tagged `unit` gets the unit one. The layer picks the spec, the spec picks the style.

It's a heuristic, and it's sometimes wrong. That's fine: the cost of being wrong is a test in the wrong layer, not a broken test. Putting a model here would buy very little and would cost the zero-LLM guarantee that makes the number worth trusting.

### Ranking: which gap actually matters

Not every uncovered line is equal. A straight 30-line function is safer than a 3-line one with four branches inside.

```
score = uncovered lines × (symbol has zero coverage ? 2 : 1) × (1 + branches)
```

Counting, not opinion. `branches` is a count of `if` / `for` / `while` / `case` / `catch` / `&&` / `||`, read straight from the code, ignoring the ones inside comments, strings, and regex literals.

### Criticality: what to fix first

A score of `5742` tells nobody what to do on a Monday. A band does. It comes from two facts already measured: **is any part of this symbol covered?** and **how much branch is hiding in it?** And nothing else.

|  | 0 branches | 1-4 branches | 5+ branches |
|---|---|---|---|
| **no coverage** | medium | **high** | **critical** |
| partially covered | low | low | medium |

The limit of 5 is [McCabe's](https://en.wikipedia.org/wiki/Cyclomatic_complexity): past it, the function needs a test. **Untested branch logic is the worst cell**: each branch is a path nothing ever ran. Untested straight-line code is bad but limited. Partially covered code at least has a test pointing at it that someone can extend.

### The document: one inspection, all public

The same measurement, rendered for whoever is reading. They can't disagree with each other, and that's the one property that makes a report worth handing to someone who won't run it again.

| File | For whom | What it is |
|---|---|---|
| `.redbar/TESTING.md` | **the agent** | the briefing for where it writes the tests: the work, the order, the layer, the standard, where each number came from. Self-contained: paste it into any agent, no redbar needed |
| `.redbar/gaps.json` | **machines** | the stable contract: every gap plus its severity, and a flag when the report is stale |
| `REDBAR.html` | **you** | a sorted table with a print stylesheet |
| `REDBAR.pdf` | **management** | the same numbers; nobody forwards a terminal screenshot |
| a PR comment with `<!-- redbar -->` | **the reviewer** | the gap table, editing its own comment on every push instead of stacking |

```bash
redbar briefing            # prints the briefing and writes TESTING.md + HTML + PDF
redbar inspect --html x.html --md x.md   # the table, the PR comment
```

The PDF comes out of the Chrome that's already on the machine, running its own print stylesheet. No PDF library in the dependency tree. No browser installed? The HTML loads the style, so `Cmd+P` produces the same file.

## "Why not just write a skill for this?"

Fair objection. You already have an agent. You write a skill, *"look at the diff, find what's untested, write the tests"*, and you're done in an afternoon. So why a tool?

Because a skill is a **prompt**, and the hard half of this problem **is not a prompt problem.**

| | Skill / prompt | redbar |
|---|---|---|
| **Where are the gaps?** | The model reads the code and *guesses* what looks untested. It never ran a single line. | It reads the coverage report. The runner already **measured** which lines ran. Not inference, measurement. |
| **Is the answer stable?** | Ask twice, get two answers. Different model, different list. | Same input, same output, byte for byte. You can diff it in a PR. |
| **Can you trust the number?** | It's an opinion, and an opinion doesn't fail a build. | It's `git diff ∩ uncovered`. You can check it by hand. |
| **Does it run when nobody remembers?** | Only when a human invokes it, on a machine that has it installed. | **CI gate.** Runs on every PR, for everyone, including people who don't use AI. |
| **Does it work in Codex? In Copilot?** | A skill is harness-specific. Rewrite it. | One engine, four faces: CLI, MCP, CI, library. Any agent, or none. |
| **Does the test it wrote actually pass?** | The model says so. | It **runs** the test. Fails twice → marked `needs-human` and deleted. **It never commits red.** |
| **What does it cost to scan a big repo?** | The model has to read the code to find candidates: slow, expensive, and it still misses things. | Seconds. It reads a report and a diff. Zero tokens. |

### The two failures a prompt can't solve

**1. A model can't know what's covered.** Coverage is a *runtime* fact: which lines the test suite actually ran. It isn't visible in the source code. An agent looking at `payment.ts` can't tell whether line 42 ran last night. It can only guess, confidently. redbar doesn't guess: the coverage report already has the answer, measured by the runner.

That's the entire first half of the problem, and it's a **data problem, not an AI problem.** Reaching for a model here is using the one tool that structurally can't answer the question.

**2. A prompt is optional, and optional doesn't change a team.** The dev who already wrote tests will run your skill. The one who didn't, won't. Nothing changed.

> **You can't force an agent to use a tool. You force the pull request.**

The CI gate is the one layer nobody can route around. And a gate needs a *reproducible* number, not the opinion of a model that varies on every run. A skill can never be that gate, no matter how good the prompt.

### And the skill isn't the enemy

redbar doesn't replace your agent, it **aims** the agent.

Point redbar's MCP server at Claude Code, Codex, or Copilot, and the agent stops guessing what to test. It gets the exact symbol, the exact uncovered lines, and the layer's canonical spec. **The skill is a consumer of redbar, not a competitor to it.**

What redbar contributes is the part a prompt structurally can't: **the measurement, the determinism, and the gate.**

## Why ten languages don't cost ten times as much

This is the design decision the whole project leans on.

**Coverage format doesn't multiply with language.** There isn't one format per language, there's one format per tooling ecosystem, and languages group into three of them:

| Format | In the registry today | The same parser also reads |
|---|---|---|
| **lcov** | JavaScript, TypeScript, Rust | Ruby, C/C++, Swift |
| **Cobertura XML** | Python, PHP, Go | C# (coverlet), Kotlin via Gradle |
| **JaCoCo XML** | Java | Kotlin, Scala, Groovy |

**Three parsers, and the hard part is already done for the right-hand column too.** Everything that really changes between languages (the root marker, the runner, the coverage command, where the report lands, which libraries to install, the regex that identifies a public symbol) is **data**, not code.

### Adding a language is one line

It's one line in a table (`src/languages.ts`):

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

No new module. No `switch (language)` anywhere in the code. If one shows up, the design failed. That constraint is enforced in review, and it's why the tool grows sideways without getting heavier.

## What it does for a development team

A tool nobody runs is a tool that doesn't exist. redbar was designed around one dry fact:

> **You can't force an agent to use a tool. You force the pull request.**

Three layers, in increasing order of force:

| Layer | What it is | Who it binds |
|---|---|---|
| **CI gate** | The PR fails when new or changed code carries gaps above the limit. Same binary as the local run. | **Everyone. Nobody routes around it.** |
| **Repo config** | `AGENTS.md` and `.github/copilot-instructions.md` point at the same conventions document. | Every AI agent, automatically. Nobody installs anything |
| **MCP** | The agent calls redbar directly and already knows what to do. | Whoever wants the convenience |

**MCP is what makes it pleasant. CI is what makes it mandatory.** Both together, or neither works.

What a team actually gains:

- **Code review stops arguing about tests.** The gap list is in the PR, generated the same way for everyone. It isn't the reviewer's opinion against the author's, it's the coverage report against the diff.
- **Testing stops being a matter of taste.** The standard isn't a colleague's preference you can contest, it's the library's own documentation. That ends the argument instead of just moving it somewhere else.
- **New hires already know the standard.** They learned Vitest and Playwright the same way everyone did: from the documentation. There's no internal dialect to learn.
- **AI-written tests stop varying.** The agent gets the canonical spec before it writes the first line, so the same gap produces the same test format today and next month, no matter which model wrote it.
- **Legacy code isn't a wall.** redbar only looks at what *changed*. A repo at 12% coverage doesn't have to reach 80%, it just has to not get worse. It's the one coverage rule people actually keep.

### The gate, in the pull request

`redbar ci` fails the build when the diff carries gaps above the limit, and `--md` writes the same table as a comment the reviewer actually reads. A gate that only prints `FAIL` gets disabled by the third person it blocks; a gate that names the symbol gets someone to write the test.

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

The limits are `--max-critical` (default `0`) and `--max-high` (default: unlimited). Start with just `--max-critical 0`: it blocks only untested branch logic in code the branch actually touched, the one rule nobody contests.

## Status

Honesty about what exists today. The engine is done and tested on real repositories; the surfaces around it are being built.

| | |
|---|---|
| ✅ **Engine** | Language + runner detection, three coverage parsers, crossing with the diff, symbol attribution, criticality ranking, layer classification |
| ✅ **Verified on real repos** | A production React Native app (Jest) and redbar itself (Vitest). Every serious bug in this tool was found that way |
| ✅ **CLI** | `redbar inspect`, `redbar briefing`, `redbar execute`, `redbar explain`, `redbar init`, `redbar ci`, `redbar mcp` |
| ✅ **Reports** | `.redbar/gaps.json` for the agent, a markdown comment for the pull request, an HTML/PDF table to print for the human |
| ✅ **CI gate** | `redbar ci --md` fails the build and posts the gap table on the PR, editing its own comment instead of stacking |
| ✅ **`execute`** | Hands each gap to any installed code agent, gates what it wrote, then measures again. `OUTCOME.md` carries the measured verdicts and the agent's own account, never mixed together |
| ✅ **Agent skills** | `/redbar.inspect`, `/redbar.fix`, `/redbar.init`: the agent reads the gap and the spec, writes the test, **runs it**, and never leaves a red one behind |
| ✅ **MCP server** | `redbar mcp`: same engine, exposed to any MCP client |
| ✅ **Conventions** | TypeScript, Python, Java, Rust, PHP: unit, integration, e2e, each traceable to the library's own documentation |
| 🚧 **Conventions** for Go | The same five questions, each ecosystem's idiom |
| 🚧 **`fix` worker pool** | Batch mode for CI: N gaps in parallel, partitioned by target file so two workers never collide |

The design documents are in [`docs/superpowers/specs/`](superpowers/specs/), and the implementation plans in [`docs/superpowers/plans/`](superpowers/plans/).

## Use it with your agent

The skills work in Claude Code today, and they follow one rule: **the skill never analyzes coverage itself, it runs the engine and reports what came back.** The LLM orchestrates; it doesn't compute.

```
/redbar.inspect          find what this branch left untested
/redbar.fix               write the missing tests, run them, never leave a red one
/redbar.init               propose the test libraries (never installs)
```

`/redbar.fix` is the whole pitch in a single command. It reads `.redbar/gaps.json`, reads that layer's canonical spec, writes **one** test file, **runs it**, and if it fails twice it deletes the file and marks the gap `needs-human`. It never weakens an assertion to go green: a test that asserts nothing reports coverage that doesn't exist, exactly the lie this tool was built to eliminate.

The agent instructions live in [`AGENTS.md`](../AGENTS.md), with `CLAUDE.md` and `.github/copilot-instructions.md` pointing there. One source of truth, not five. **The agent loads it on its own, nobody installs anything.**

### `redbar execute`: the agent writes, redbar judges

```bash
redbar execute            # detects your agent, hands over every gap, then measures what changed
redbar execute --max 3    # just the three worst gaps
```

It finds any installed code agent (`claude`, `codex`, `copilot`, `gemini`,
`cursor-agent`), hands over **one gap at a time** with the layer's canonical standard, and passes everything
it writes through four gates, on none of which the agent gets a vote:

| Gate | If it fails |
|---|---|
| Did it touch product code? | **reverted.** An agent that "fixes" the source to make its test pass has silently changed what your system does. |
| Did it write more than one test file? | **all deleted**, marked `too-many-files`. Rule 1 of the prompt is "exactly one test file": an extra file with no judgment would still raise coverage and close the gap without ever passing the next two gates. |
| Does the test assert anything? | **deleted.** A test that asserts nothing still raises coverage. That's the cheat this gate exists to catch. |
| Does the test pass? (one retry) | **deleted**, and the gap is marked `needs-human`. |

Before each gap runs, redbar takes a snapshot of which files are already dirty and subtracts
that baseline from what the agent touched. That way the first gate never reverts a human's uncommitted
edit, and the second gap never inherits or deletes the first's test file just because it's
still in the tree.

Then it **runs the coverage command again and inspects again**. A gap is `closed`
because the new report says those lines now run, not because the agent said so. `OUTCOME.md`
shows the measured verdicts (`closed`, `open`, `no-assertion`, `too-many-files`, `touched-source`) and the
agent's own account (`needs-human`, `timeout`, `no-output`) in two separate blocks, and the second
never becomes the first.

`execute` refuses to run on a dirty working tree. It writes and reverts files, and it can't
tell its own writing apart from your uncommitted work. Reverting the wrong one has no reflog or
stash behind it. It names what's dirty and tells you to commit or stash before running. There's no
`--force`: the same stance as `git rebase`, for the same reason.

## Try it: the whole journey in four commands

Requires Node 20.11+. Drop it in any repo, on a branch with work done.

```bash
# 1. what did I change that nothing tests?
redbar inspect                 # the gap list, sorted, measured, zero LLM

# 2. give me the briefing to hand to my agent
redbar briefing                # writes .redbar/TESTING.md + HTML + PDF

# 3. let my agent write the tests, and judge the result
redbar execute                 # detects your agent, gates its work, measures again

# 4. prove any given number is real
redbar explain Checkout        # the lcov line, the diff line, the score arithmetic
```

No coverage report? `inspect` runs your project's coverage command for you. Only have
tests, with no coverage step configured? It fails loudly, with the exact command for **your** runner.
jest and vitest don't share one, and neither do maven and gradle. And it never guesses. No tests at all? It stops and
points you at `redbar init`, which proposes the libraries and installs nothing.

Working from a redbar checkout instead of an install? Swap `redbar` for
`npm run try --` or `npx tsx src/cli.ts`.

## Design principles

These principles hold the project up. Each one is a decision you can point at.

- **Zero LLM in the analysis.** The number's authority comes from the compiler and git. That's the pitch.
- **Zero runtime dependencies.** The coverage parsers are written by hand; the entire multi-LLM integration is a `spawn()`. CI fails the build if a dependency shows up.
- **It never installs anything on its own.** Editing someone's `package.json` or `pom.xml` without asking is, at best, a rejected PR and, at worst, a supply-chain incident. `init` proposes; the human approves.
- **It never leaves a red test behind.** A generated test that fails twice is marked `needs-human` and deleted. One red test leaking into a demo erases everything else.
- **Every difference between languages is data.** If a `switch (language)` shows up, the design failed.
- **Deterministic output.** Same input, same order, byte for byte. A report that shuffles can't be diffed in a PR, and a CI gate built on top of it would be flaky.

## Releases

Semantic versioning, and the tag is what publishes. There's no release bot and no `semantic-release`
in the dependency tree. A tool that sells zero runtime dependencies doesn't bring in thirty
of them just to cut a version.

```bash
npm run release:patch   # 0.1.0 → 0.1.1   a fix
npm run release:minor   # 0.1.0 → 0.2.0   a feature, or a change to the public surface
npm run release:major   # 0.1.0 → 1.0.0   a break
```

Each one updates `package.json`, commits, creates the tag, and pushes the tag. Pushing the tag triggers
[`release.yml`](../.github/workflows/release.yml), which **refuses to publish if the build isn't
green**: typecheck, the whole suite, the build, the zero-dependency check, and the check that
the tag matches `package.json`'s version. A tag is a promise; you don't cut one from a red build.

`preversion` runs typecheck and the tests locally too, so a broken release fails on
your machine before it reaches CI.

While the major version is `0`, the public surface (the CLI flags, the `gaps.json` format, the
registry's `Language` type) can still change in a minor. The [`CHANGELOG.md`](../CHANGELOG.md) says so
when it happens.

## Contributing

The most valuable contribution isn't code. It's **running redbar on a real repository and telling
us what it got wrong.**

Every serious bug in this tool so far was found that way, and none of them was caught by a
hand-written fixture:

- A React Native app revealed that **a file no test imports never shows up in the coverage report**. So the file with zero tests was invisible to the tool built to find files with zero tests. The exact inverse of the promise.
- The same app revealed that real React writes `const Button = (...)` and exports at the end of the file, so requiring the `export` keyword left every component named `(no symbol)`.
- Running redbar on redbar itself revealed that a static data table scored 21 phantom branches: keywords counted from inside regex literals and comments.

A fixture tests what you already thought of. A real repository tests what you didn't.

## License

[MIT](../LICENSE) © Emerson Silva
