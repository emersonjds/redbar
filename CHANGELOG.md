# Changelog

All notable changes to redbar are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versioning
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the major version is `0`, the public surface — the CLI flags, the `gaps.json` shape, and the
`Language` registry type — may still change in a minor release. It will be noted here when it does.

## [Unreleased]

## [0.1.0] — 2026-07-13

The engine, the CLI, and the agent skills. Verified against a production React Native app and
against redbar itself.

### Added

- **Engine.** Crosses the project's coverage report with `git diff main...HEAD` and reports which
  changed symbols nothing executes. **No model is called** — the number comes from the coverage
  report and git, which is what makes it auditable.
- **Language registry** (`src/languages.ts`). One row of data per language: markers, runners,
  coverage format, symbol patterns, test libraries. Adding a language is one line, never a new
  module. Ships with TypeScript/JavaScript, Java, Python, Rust, PHP, and Go.
- **Three coverage parsers** — lcov, JaCoCo XML, Cobertura XML — which between them read every
  language above. Hand-written; **zero runtime dependencies.**
- **Runner detection.** jest vs vitest, maven vs gradle. They share neither a command nor a report
  path, and assuming one of them prints a command that can never produce the report redbar waits
  for.
- **Criticality bands** (`critical` / `high` / `medium` / `low`), from two measured facts: whether
  the symbol has any coverage, and how much branching it hides. The threshold of 5 branches is
  McCabe's.
- **Layer classification.** Each gap is tagged `unit`, `integration`, or `e2e`, inferred from the
  file — a route is e2e, an I/O boundary is integration.
- **CLI** — `redbar inspect`, `redbar init`, `redbar ci`.
  - `init` proposes the missing test libraries and **never installs them**. It prints the command;
    the human presses enter.
  - `ci` is the gate: it exits non-zero when the branch carries gaps above the threshold.
- **Reports** — `.redbar/gaps.json` for the agent, and a printable HTML/PDF table for the human and
  the pull request.
- **Agent skills** — `/redbar.inspect`, `/redbar.fix`, `/redbar.init`. The skill never analyzes
  coverage itself: it runs the engine and reports what came back.
- **Conventions** for TypeScript (unit, integration, e2e). Every rule is traceable to the library's
  own documentation — Playwright's best practices, the Vitest/Jest docs, Testcontainers. **Not a
  house style:** nobody argues with the Playwright docs in a code review.
- **Agent instructions** — `AGENTS.md`, with `CLAUDE.md` and `.github/copilot-instructions.md`
  pointing at it. One source of truth, loaded by the agent without anyone installing anything.

### Fixed

Every one of these was found by running redbar on a real repository. **Not one was caught by a
hand-written fixture** — which is the most useful thing we learned.

- **A file that no test imports never appears in the coverage report at all**, so the engine skipped
  it as "uninstrumented". The file with zero tests was invisible to the tool built to find files
  with zero tests — the exact inverse of the promise. A changed source file absent from the report
  is now a total gap.
- The lcov and Cobertura parsers **overwrote** instead of merging when one file appeared in two
  blocks (a concatenated monorepo report, a PHP trait, a C# lambda). This both lost real gaps and
  **fabricated** false ones by reporting covered lines as uncovered.
- `init` told a **jest** project to install **vitest**, which would have broken its own setup. Unit
  libraries belong to the runner, not to the language.
- Branch counting read keywords out of comments, strings, and regex literals — a static data table
  scored 21 phantom branches and topped the ranking.
- `classify` treated any `app/` path as a Next.js route, so every Python module under `app/` (a
  Flask/FastAPI package) was misfiled as e2e.
- Symbol extraction required the `export` keyword, so real React (`const Button = …`, exported at
  the bottom) came out as `(no symbol)` on every component.
- `git diff` parsing dropped paths with spaces or non-ASCII characters, and a content line beginning
  with `++ ` could hijack the file pointer.
- JaCoCo source roots were unreachable from `inspect()`, so any Kotlin or multi-module Maven repo
  returned **zero gaps with no error**.

[Unreleased]: https://github.com/emersonjds/redbar/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/emersonjds/redbar/releases/tag/v0.1.0
