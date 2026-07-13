<div align="center">

# redbar

### It finds the test gaps in what you changed — and no model gets a say in the number.

[![ci](https://github.com/emersonjds/redbar/actions/workflows/ci.yml/badge.svg)](https://github.com/emersonjds/redbar/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript 7](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node 20.11+](https://img.shields.io/badge/Node-20.11+-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-success)](package.json)
[![zero LLM in analysis](https://img.shields.io/badge/analysis-zero%20LLM-critical)](#the-analysis-is-zero-llm-and-that-is-the-whole-point)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#adding-a-language-is-one-line)

**JavaScript · TypeScript · Java · Python · Rust · PHP · Go**

</div>

---

## The problem

Nobody argues that tests matter. Teams still ship without them, and it is almost never laziness. It is two different problems that get treated as one:

**1. Nobody knows where the holes are.** Coverage sits at 43%, and that number tells you nothing about whether *the thing you shipped last Tuesday* is tested. That is a **data problem** — not an AI problem.

**2. When someone does write a test, it comes out in a style nobody agreed on.** And when an AI agent writes it, you get a test in the model's house style, not yours. That is a **convention problem** — not a tooling problem.

Conflating the two is the classic mistake. redbar attacks both, with different mechanisms: the first with the compiler and git, the second with a conventions document the agent is forced to read.

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

## How it works

```
   git diff main...HEAD  ──┐
                           ├──►  changed ∩ uncovered  ──►  attribute to symbol  ──►  rank
   coverage report ────────┘                                                          │
   (lcov / JaCoCo / Cobertura)                                                        ▼
                                                                            ranked, typed gaps
```

Four steps, no magic:

1. **Detect** the language and the test runner from the project's own manifest.
2. **Parse** the coverage report the project already produces.
3. **Cross** it with the diff — what *changed* and is *uncovered*.
4. **Rank** by criticality, and label each gap `unit`, `integration`, or `e2e`.

### The analysis is zero-LLM, and that is the whole point

No model is called anywhere in this pipeline. The gap report is not an AI's opinion — it is your coverage report and your `git diff` talking.

This is not purism. It is the source of the number's authority. A wrong number from a language model is bad. **A wrong number from a regex is worse**, because it arrives wearing the compiler's uniform. So the analysis stays mechanical, deterministic, and auditable — you can check it by hand, and it gives the same answer twice.

Only the *writing* of a test touches an agent, and it does so through a small adapter.

### Ranking: which gap actually matters

Not all uncovered lines are equal. A 30-line straight-line function is safer than a 3-line one with four branches in it.

```
score = uncovered lines × (symbol has zero coverage ? 2 : 1) × (1 + branches)
```

Counting, not opinion. `branches` is a count of `if` / `for` / `while` / `case` / `catch` / `&&` / `||` — read from the code, ignoring the ones sitting inside comments, strings, and regex literals.

### Which kind of test is missing

redbar does not ask you, and does not ask a model. It infers it the way a senior would, in two seconds:

| Signal in the file | Kind |
|---|---|
| A route or controller — `pages/`, `routes/`, `@RestController`, `#[get(`, `Route::`, Next.js `app/**/page.tsx` | **e2e** |
| An I/O boundary — `repository`, `dao`, `client`, `gateway`, or it imports `sql` / `mongo` / `axios` / `jdbc` | **integration** |
| Anything else | **unit** |

It is a heuristic and it is wrong sometimes. The cost of being wrong is a test of the wrong kind, not a broken test — and a model here would break the zero-LLM promise for no real gain.

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
- **New hires learn the house standard by reading it, not by getting a PR rejected.** The conventions document is the deliverable; the tool just executes it.
- **AI-written tests come out in your style, not the model's.** The agent is handed your conventions before it writes a line.
- **Legacy code is not a wall.** redbar only ever looks at what *changed*. A repo at 12% coverage is not asked to reach 80% — it is asked not to get worse. That is the only coverage rule anyone has ever actually kept.

## Status

Honest about what exists today. The engine is done and exercised on real repositories; the surfaces around it are being built.

| | |
|---|---|
| ✅ **Engine** | Language + runner detection, three coverage parsers, diff crossing, symbol attribution, criticality ranking, test-kind classification |
| ✅ **Verified on real repos** | Ran on a production React Native app (Jest) and on redbar itself (Vitest) |
| 🚧 `redbar inspect` CLI | The engine is there; the CLI shell is not. Today: `npm run try -- <repo-path>` |
| 🚧 `redbar init` | Proposes the test libraries for the detected language. **It never installs anything — it prints the command and you press enter.** |
| 🚧 `redbar fix` | Worker pool that spawns the agent CLI *you already have* — Claude Code, Codex, or Copilot. No SDK, no API key, no new inference bill. |
| 🚧 MCP server + CI gate | Thin shells over the same engine |

The design documents are in [`docs/superpowers/specs/`](docs/superpowers/specs/), and the implementation plans in [`docs/superpowers/plans/`](docs/superpowers/plans/).

## Try it

Requires Node 20.11+.

```bash
git clone https://github.com/emersonjds/redbar.git
cd redbar && npm install

# point it at any repo, on a branch with work on it
npm run try -- /path/to/your/repo
```

No coverage report yet? It fails loudly and hands you the exact command for **your** runner — jest and vitest do not share one, and neither do maven and gradle:

```
redbar: coverage report not found at coverage/lcov.info.
Run: npx jest --coverage --coverageReporters=lcov --collectCoverageFrom='src/**/*.{ts,tsx,js,jsx}'
```

Run that, then run redbar again.

## Design principles

These are load-bearing. Each one is a decision that can be pointed at.

- **Zero LLM in the analysis.** The number's authority comes from the compiler and git. That is the pitch.
- **Zero runtime dependencies.** The coverage parsers are hand-written; the whole multi-LLM integration is `spawn()`. CI fails the build if a dependency shows up.
- **It never installs anything on its own.** Editing someone's `package.json` or `pom.xml` unasked is a rejected PR at best and a supply-chain incident at worst. `init` proposes; the human approves.
- **It never leaves a red test behind.** A generated test that fails twice is marked `needs-human` and deleted. One red test leaking into a demo erases everything else.
- **Every difference between languages is data.** If a `switch (language)` appears, the design failed.
- **Deterministic output.** Same input, same order, byte for byte. A report that reshuffles cannot be diffed in a PR, and a CI gate built on it would flap.

## Contributing

The most valuable contribution is not code — it is **running redbar on a real repository and telling us what it got wrong.**

Every serious bug in this tool so far was found that way, and not one of them was caught by a hand-written fixture:

- A React Native app revealed that a file **no test imports never appears in the coverage report at all** — so the file with zero tests was invisible to the tool built to find files with zero tests. The exact inverse of the promise.
- The same app revealed that real React writes `const Button = (...)` and exports at the bottom, so demanding the `export` keyword left every component named `(no symbol)`.
- Running redbar on redbar revealed that a static data table scored 21 phantom branches — keywords counted from inside regex literals and comments.

Fixtures test what you already thought of. Real repositories test what you did not.

## License

[MIT](LICENSE) © Emerson Silva
