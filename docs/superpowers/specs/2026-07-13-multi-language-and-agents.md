# redbar — Design addendum: multi-language and specialist agents

**Date:** 2026-07-13
**Status:** addendum to `2026-07-12-redbar-design.md`. Where there is a conflict, this document wins.

## What changed

The original design locked the scope to 3 stacks (TS, Java, Python). The scope is now **any language** — js, ts, rust, java, python, php, go, kotlin, c#, ruby — with **specialist agents per test type** (unit, integration, e2e), and an `init` that **proposes the test libs** of the detected language for the human to approve.

This looks like a scope explosion. It isn't — and the reason is the next section.

## Why N languages doesn't cost N times more

**Coverage report formats converge into three.** There is no one format per language: there is one format per *tool ecosystem*, and languages cluster into them.

| Format | Languages that emit it |
|---|---|
| **lcov** | JS, TS, Rust (`cargo-llvm-cov --lcov`), Ruby (`simplecov-lcov`), C/C++ (`gcov`), Swift |
| **Cobertura XML** | Python (`coverage.py`), PHP (`phpunit --coverage-cobertura`), C#/.NET (`coverlet`), Go (`gocover-cobertura`) |
| **JaCoCo XML** | Java, Kotlin, Scala, Groovy |

The **three parsers from the original design already cover the ten requested languages.** No new parser.

What changes per language is **data, not code**: which file marks the project root, which command generates the coverage, where the report lands, which test libs to install, and the regex that recognizes a public symbol.

Therefore: **`src/languages.ts` is a table.** Adding Go is one line in it — not a module, not a release, not one more `if` anywhere. It is the same decision the design had already made for the LLMs (the agent adapter is config, not code), applied to languages.

If that table turns into a `switch`, the project failed.

## The registry

```ts
type Language = {
  id: string                       // 'ts' | 'rust' | 'php'
  name: string                     // 'TypeScript'
  markers: string[]                // ['package.json'] — identifies the root
  format: 'lcov' | 'jacoco' | 'cobertura'
  reportPath: string               // 'coverage/lcov.info'
  coverageCommand: string          // command that GENERATES the report
  symbolPatterns: RegExp[]         // recognizes an exported/public symbol
  testLibs: { unit: string[]; integration: string[]; e2e: string[] }
  installCommand: (libs: string[]) => string
  canFix: boolean                  // does the agent write tests in this language?
}
```

`canFix: false` remains a legitimate choice (the design cuts Python from `fix`). `inspect` works in every language in the table; `fix` works where there is a written convention.

## The specialist agents

**They are not N × 3 agents.** That would be 30 prompts to maintain, and none of them would be any good.

An agent is the composition of three things that already exist:

```
prompt = conventions/<language>/<type>.md   ← the library's canonical standard
       + the gap (file, symbol, lines, source code)
       + the path of the test file to create
```

The "Rust integration test specialist" **is** `conventions/rust/integration.md`. Swapping the specialist means editing a markdown file, not shipping a deploy. It is the same escape hatch as the LLM adapter, applied to testing knowledge.

> **SUPERSEDED — see `2026-07-13-conventions-are-library-standards.md`.**
> This section originally called the conventions "the house standard (the real deliverable)",
> to be authored by the team. That is reversed. The complaint is "everyone writes tests their
> own way"; a house standard does not fix that, **it adds a seventh way**. The convention for a
> layer is the **canonical standard of the library that runs it** — Playwright's best-practices
> page, the Vitest docs, the pytest idiom — with an optional per-project override for genuinely
> local choices. Nobody argues with the Playwright docs; everybody argues with the standard a
> colleague invented last week.

## How the test type is decided

You don't ask the human or the model. It is inferred from the file's path and content — it is the same reasoning a senior does in two seconds:

| Signal in the gap's file | Type |
|---|---|
| route / controller: `app/`, `pages/`, `routes/`, `@RestController`, `@RequestMapping`, `#[get(`, `Route::` | **e2e** |
| I/O boundary: `repository`, `dao`, `client`, `gateway`, `db`, `sql`, `http` in the name or in the imports | **integration** |
| anything else | **unit** |

`classify.ts` — a ~25-line heuristic. It's wrong sometimes; the cost of being wrong is a test of the wrong type, not a broken test. If the team complains about the accuracy, the table gets one more line. Not worth a classifier model.

## How "the most critical points" are measured

The design's ranking (uncovered lines × fully uncovered symbol) gains **one** signal: branch density.

```
score = lines_in_gap × (symbol_with_no_coverage_at_all ? 2 : 1) × (1 + branches)
```

`branches` = count of `if`/`for`/`while`/`case`/`catch`/`&&`/`||`/`?` in the symbol's lines. A 3-line function with 4 branches is more dangerous than a 30-line straight-line one, and the ranking has to say so.

It remains **zero-LLM**: it's counting, not opinion. The authority of the number — the central argument of the pitch — stays intact.

## `init` and installing libs

Flow, with no change of principle:

1. `redbar init` detects the language via the registry's `markers`.
2. Prints the **diff** of what's missing: test libs (unit/integration/e2e) + coverage config.
3. Prints the **exact command** to install (`npm i -D vitest @playwright/test`, `cargo add --dev`, `composer require --dev phpunit/phpunit`, …).
4. **The human hits enter.** The tool never installs on its own.

Rule from the original design, kept without exception: touching someone else's `package.json`/`pom.xml`/`Cargo.toml` without asking is a supply chain incident.

## Revised scope

| Language | Format | `inspect` | `fix` |
|---|---|---|---|
| TypeScript / JavaScript | lcov | Yes | Yes |
| Java / Kotlin | JaCoCo | Yes | Yes |
| Python | Cobertura | Yes | Yes |
| Rust | lcov | Yes | Yes |
| PHP | Cobertura | Yes | Yes |
| Go | Cobertura | Yes | later |
| C# / Ruby / Scala | Cobertura / lcov / JaCoCo | Yes | later |

`inspect` is free for the whole table — it's the same parser. `fix` costs **one conventions markdown per language**, and that cost is human, not engineering.

## What stays out of scope

- Automatic dependency installation (`init` proposes, the human approves).
- LLM SDK, API key management, new inference cost.
- Isolation via git worktree (eliminated by partitioning per target file).
- AST parser. The symbol regexes are shallow on purpose: the goal is to **name** the gap, not to compile the language.
